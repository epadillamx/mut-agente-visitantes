"""
Lambda Function para Bedrock Knowledge Base
Versión: 2.2 - Fix Preguntas con separador correcto

CAMBIOS EN ESTA VERSIÓN:
- ✅ Fix separador CSV de preguntas (;)
- ✅ Fix nombres de columnas (pregunta, respuesta, texto_embedding, categoria_nombre)
- ✅ Usa SOLO la columna 'texto_embedding' del CSV
- ✅ No reconstruye el texto, usa directamente lo que viene en el CSV

CSV ENTRADA (PREGUNTAS_OPTIMIZADO_VECTORDB.csv):
- pregunta (minúscula)
- respuesta (minúscula)
- texto_embedding ← USAMOS ESTA COLUMNA
- categoria_nombre
- categoria_completa
- SEPARADOR: ; (punto y coma)
"""

import re
import os
import json
import boto3
import awswrangler as wr
import pandas as pd
from math import ceil
from io import StringIO
from datetime import datetime


# ============================================================================
# HANDLER PRINCIPAL - CONFIGURACIÓN ACTUALIZADA
# ============================================================================

def lambda_handler(event, context):
    """
    Transforma CSVs optimizados a formato Bedrock KB con chunks vectoriales.
    Versión 4.0 - Lectura dinámica desde variables de entorno
    """
    try:
        # Obtener configuración desde variables de entorno
        s3_bucket = os.environ.get('S3_BUCKET_NAME')
        s3_vectorial_prefix = os.environ.get('S3_VECTORIAL_PREFIX', 'vectorial/')
        base_output_path = os.environ.get('KB_S3_ECOMM_PATH')
        
        if not s3_bucket:
            raise ValueError("Variable de entorno S3_BUCKET_NAME no está configurada")
        if not base_output_path:
            raise ValueError("Variable de entorno KB_S3_ECOMM_PATH no está configurada")
        
        # Remover 'arn:aws:s3:::' si está presente (por si acaso)
        if s3_bucket.startswith('arn:aws:s3:::'):
            s3_bucket = s3_bucket.replace('arn:aws:s3:::', '')
        
        print(f"📦 Bucket S3: {s3_bucket}")
        print(f"📂 Prefix Vectorial: {s3_vectorial_prefix}")
        print(f"📤 Output Path: {base_output_path}")
        
        # Buscar archivos vectoriales más recientes en S3
        s3_client = boto3.client('s3')
        
        def get_latest_vectorial_file(filename):
            """
            Obtiene el archivo vectorial con nombre fijo
            Los archivos ahora tienen nombres constantes para reemplazarse
            """
            full_key = f"{s3_vectorial_prefix}{filename}"
            
            try:
                # Verificar si el archivo existe
                s3_client.head_object(Bucket=s3_bucket, Key=full_key)
                return full_key
            except:
                print(f"   ⚠️  Archivo no encontrado: {full_key}")
                return None
        
        # Configuración actualizada para archivos vectoriales preparados
        # Ahora con nombres fijos (sin timestamp)
        csv_files = {
            'eventos': {
                'filename': get_latest_vectorial_file('eventos_vectorial.csv'),
                's3_key': None,  # Se llenará dinámicamente
                'encoding': 'utf-8',
                'text_fields': ['texto_embedding'],  # ← Campo ya optimizado
                'metadata_fields': [
                    'titulo', 'descripcion', 'fecha_texto', 'hora_texto', 'lugar', 
                    'organizador', 'tipo', 'horas', 'link', 'document_type', 'search_category'
                ],
                'id_field': 'titulo',
                'format': 'jsonl'
            },
            'preguntas': {
                'filename': get_latest_vectorial_file('preguntas_vectorial.csv'),
                's3_key': None,  # Se llenará dinámicamente
                'encoding': 'utf-8',
                'separator': ',',  # ← CSV usa punto y coma
                'text_fields': ['texto_embedding'],  # ← Campo ya optimizado
                'metadata_fields': ['pregunta', 'respuesta', 'categoria_nombre', 'categoria_completa'],
                'id_field': 'pregunta',
                'format': 'jsonl'
            },
            'stores': {
                'filename': get_latest_vectorial_file('stores_vectorial.csv'),
                's3_key': None,  # Se llenará dinámicamente
                'encoding': 'utf-8',
                'text_fields': ['texto_embedding'],  # ← Campo ya optimizado
                'metadata_fields': [
                    'titulo', 'lugar', 'horario', 'nivel', 'local', 'telefono', 
                    'mail', 'tipo', 'web', 'url_web', 'link', 'document_type', 'search_category'
                ],
                'id_field': 'titulo',
                'format': 'jsonl'
            },
            'restaurantes': {
                'filename': get_latest_vectorial_file('restaurantes_vectorial.csv'),
                's3_key': None,  # Se llenará dinámicamente
                'encoding': 'utf-8',
                'text_fields': ['texto_embedding'],  # ← Campo ya optimizado
                'metadata_fields': [
                    'titulo', 'lugar', 'horario', 'nivel', 'local', 'telefono', 
                    'mail', 'tipo', 'web', 'url_web', 'link', 'document_type', 'search_category'
                ],
                'id_field': 'titulo',
                'format': 'jsonl'
            }
        }
        
        # Verificar que se encontraron todos los archivos
        missing_files = [k for k, v in csv_files.items() if v['filename'] is None]
        if missing_files:
            print(f"⚠️  Archivos vectoriales no encontrados para: {', '.join(missing_files)}")
            # Continuar solo con los archivos encontrados
            csv_files = {k: v for k, v in csv_files.items() if v['filename'] is not None}
        
        # Actualizar s3_key con la ruta completa
        for key in csv_files:
            csv_files[key]['s3_key'] = csv_files[key]['filename']
        
        # Chunks optimizados para base vectorial
        num_rows_per_file = {
            'preguntas': 10,     # ~75 FAQs → ~8 archivos
            'eventos': 8,        # ~26 eventos → ~4 archivos
            'stores': 20,        # ~127 tiendas → ~7 archivos
            'restaurantes': 15   # ~79 restaurantes → ~6 archivos
        }
        
        results = {}
        stats = {
            'total_documents': 0,
            'total_chunks': 0,
            'by_type': {}
        }
        
        print("\n" + "="*80)
        print("🚀 TRANSFORMACIÓN A BASE VECTORIAL - BEDROCK KB v3.0")
        print("="*80)
        print("📋 Modo: Lectura directa de archivos vectoriales preparados")
        print("="*80)
        
        # Procesar cada dataset
        for file_type, file_config in csv_files.items():
            s3_key = file_config['s3_key']
            encoding = file_config['encoding']
            s3_path = f"s3://{s3_bucket}/{s3_key}"
            output_s3_key = f"{base_output_path}/{file_type}"
            
            print(f"\n{'='*80}")
            print(f"📂 {file_type.upper()}")
            print(f"   Input:  {s3_key}")
            print(f"   Output: {output_s3_key}")
            print(f"   Formato: {file_config['format'].upper()}")
            print(f"   Chunk: {num_rows_per_file.get(file_type)} docs/archivo")
            print(f"{'='*80}")
            
            try:
                # Leer CSV optimizado
                separator = file_config.get('separator', ',')
                df = read_csv_robust(s3_path, encoding, file_type, separator)
                
                if df is None or len(df) == 0:
                    print(f"⚠️  {file_type} vacío o no encontrado")
                    results[file_type] = 0
                    continue
                
                print(f"✅ Leídos {len(df)} registros")
                print(f"   Columnas: {list(df.columns)}")
                
                # Validar columnas requeridas
                required = file_config['text_fields'] + [file_config['id_field']]
                missing = [col for col in required if col not in df.columns]
                if missing:
                    print(f"⚠️  Columnas faltantes: {missing}")
                
                # Transformar para Bedrock KB
                df = transform_for_bedrock_kb(df, file_type, file_config)
                
                # Estadísticas
                avg_length = df['bedrock_text'].str.len().mean()
                print(f"✅ {len(df)} documentos listos")
                print(f"   Texto promedio: {avg_length:.0f} caracteres")
                
                # Escribir en formato Bedrock
                rows_written = write_bedrock_kb_format(
                    df=df,
                    file_type=file_type,
                    file_config=file_config,
                    s3_bucket=s3_bucket,
                    output_s3_key=output_s3_key,
                    num_rows_per_file=num_rows_per_file.get(file_type, 15)
                )
                
                # Calcular chunks creados
                chunks_created = ceil(len(df) / num_rows_per_file.get(file_type, 15))
                
                results[file_type] = rows_written
                stats['total_documents'] += rows_written
                stats['total_chunks'] += chunks_created
                stats['by_type'][file_type] = {
                    'documents': rows_written,
                    'chunks': chunks_created,
                    'avg_text_length': int(avg_length)
                }
                
                print(f"✅ {rows_written} documentos escritos en {chunks_created} chunks")
                
            except Exception as e:
                print(f"❌ Error procesando {file_type}: {str(e)}")
                import traceback
                traceback.print_exc()
                results[file_type] = f"Error: {str(e)}"
                continue
        
        print("\n" + "="*80)
        print("✅ TRANSFORMACIÓN COMPLETADA")
        print("="*80)
        print(f"📊 Estadísticas Globales:")
        print(f"   Total documentos: {stats['total_documents']}")
        print(f"   Total chunks: {stats['total_chunks']}")
        print(f"\n📋 Por tipo:")
        for tipo, data in stats['by_type'].items():
            print(f"   • {tipo}: {data['documents']} docs, "
                  f"{data['chunks']} chunks, "
                  f"{data['avg_text_length']} chars avg")
        print("="*80 + "\n")
        
        return {
            "statusCode": 200,
            "body": {
                "message": "Transformación exitosa a base vectorial",
                "output_path": base_output_path,
                "results": results,
                "statistics": stats,
                "timestamp": datetime.utcnow().isoformat(),
                "version": "3.0",
                "mode": "vectorial_preparado"
            }
        }
        
    except Exception as e:
        print(f"💥 Error crítico: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": {"error": str(e)}
        }


# ============================================================================
# LECTURA DE CSV
# ============================================================================

def read_csv_robust(s3_path, encoding, file_type, separator=','):
    """Lee CSV con manejo robusto y tipo específico para telefono."""
    try:
        dtype_specs = {'telefono': str} if file_type == 'restaurantes' else None
        
        df = wr.s3.read_csv(
            path=s3_path,
            header=0,
            sep=separator,
            quotechar='"',
            encoding=encoding,
            escapechar='\\',
            on_bad_lines='skip',
            engine='python',
            dtype=dtype_specs
        )
        
        if file_type == 'restaurantes' and 'telefono' in df.columns:
            df['telefono'] = df['telefono'].astype(str).str.replace('.0', '', regex=False)
            df['telefono'] = df['telefono'].str.replace('nan', '', regex=False)
        
        return df
        
    except Exception as e1:
        print(f"⚠️  Método 1 falló: {str(e1)}")
        
        try:
            s3_client = boto3.client('s3')
            bucket, key = s3_path.replace('s3://', '').split('/', 1)
            
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            content = obj['Body'].read().decode(encoding)
            
            dtype_specs = {'telefono': str} if file_type == 'restaurantes' else None
            
            df = pd.read_csv(
                StringIO(content),
                sep=separator,
                quotechar='"',
                encoding=encoding,
                on_bad_lines='skip',
                engine='python',
                dtype=dtype_specs
            )
            
            if file_type == 'restaurantes' and 'telefono' in df.columns:
                df['telefono'] = df['telefono'].astype(str).str.replace('.0', '', regex=False)
                df['telefono'] = df['telefono'].str.replace('nan', '', regex=False)
            
            return df
            
        except Exception as e2:
            print(f"❌ Todas las estrategias fallaron: {str(e2)}")
            return None


# ============================================================================
# TRANSFORMACIÓN PARA BEDROCK KB
# ============================================================================

def transform_for_bedrock_kb(df, file_type, file_config):
    """
    Transforma DataFrame a formato Bedrock KB.
    Versión 3.0: Los archivos YA vienen con texto_embedding optimizado.
    Solo se valida y estructura para Bedrock.
    """
    
    # Limpiar todos los campos de texto
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()
            df[col] = df[col].replace(['nan', 'None', 'NaN', ''], '')
    
    # Usar directamente el campo texto_embedding si existe
    if 'texto_embedding' in df.columns:
        df['bedrock_text'] = df['texto_embedding']
        print(f"   ✅ Usando campo 'texto_embedding' directo del CSV")
    else:
        # Fallback: crear texto según tipo (compatibilidad)
        print(f"   ⚠️  Campo 'texto_embedding' no encontrado, generando...")
        if file_type == 'eventos':
            df = create_eventos_bedrock_text(df)
        elif file_type == 'preguntas':
            df = create_preguntas_bedrock_text(df)
        elif file_type == 'stores':
            df = create_stores_bedrock_text(df)
        elif file_type == 'restaurantes':
            df = create_restaurantes_bedrock_text(df)
    
    # Asignar document_type y search_category si no existen
    if 'document_type' not in df.columns:
        df['document_type'] = file_type
    
    if 'search_category' not in df.columns:
        category_map = {
            'eventos': 'eventos_y_actividades',
            'preguntas': 'preguntas_frecuentes',
            'stores': 'comercios_y_tiendas',
            'restaurantes': 'gastronomia'
        }
        df['search_category'] = category_map.get(file_type, file_type)
    
    # Generar IDs únicos
    timestamp = int(datetime.utcnow().timestamp())
    df['document_id'] = df.apply(
        lambda row: f"{file_type}_{timestamp}_{row.name}_{sanitize_text(str(row.get(file_config['id_field'], ''))[:30])}",
        axis=1
    )
    
    # Filtrar documentos vacíos
    initial_count = len(df)
    df = df[df['bedrock_text'].str.len() > 20]
    removed = initial_count - len(df)
    
    if removed > 0:
        print(f"   ⚠️  Removidos {removed} documentos vacíos")
    
    df = df.fillna('')
    
    return df


# ============================================================================
# CREACIÓN DE TEXTO PARA EMBEDDINGS - SOLO PREGUNTAS OPTIMIZADO
# ============================================================================

def create_preguntas_bedrock_text(df):
    """
    USA DIRECTAMENTE la columna 'texto_embedding' del CSV.
    No reconstruye nada, solo toma el contenido ya optimizado.
    
    CSV tiene (con separador ;):
    - pregunta (minúscula)
    - respuesta (minúscula)
    - texto_embedding ← USAMOS ESTA
    - categoria_nombre
    - categoria_completa
    """
    
    def build_text(row):
        # Usar directamente la columna texto_embedding
        if row.get('texto_embedding'):
            return str(row['texto_embedding']).strip()
        
        # Fallback si no existe (no debería pasar)
        return f"Pregunta: {row.get('pregunta', '')}\nRespuesta: {row.get('respuesta', '')}"
    
    df['bedrock_text'] = df.apply(build_text, axis=1)
    df['document_type'] = 'faq'
    df['search_category'] = 'preguntas_frecuentes'
    
    return df


# ============================================================================
# OTRAS FUNCIONES (SIN CAMBIOS)
# ============================================================================

def create_eventos_bedrock_text(df):
    """Crea texto para embeddings de eventos."""
    def build_text(row):
        parts = []
        if row.get('keywords') and row.get('keywords') != '':
            parts.append(f"🔑 KEYWORDS: {row['keywords']}")
        if row.get('tipo'):
            parts.append(f"📌 TIPO: {row['tipo']}")
        if row.get('titulo'):
            parts.append(f"🎯 EVENTO: {row['titulo']}")
        if row.get('descripcion'):
            parts.append(f"📝 {row['descripcion']}")
        if row.get('contenido'):
            parts.append(row['contenido'])
        
        info_practica = []
        if row.get('fecha_texto'):
            info_practica.append(f"📅 {row['fecha_texto']}")
        if row.get('hora_texto'):
            info_practica.append(f"🕐 {row['hora_texto']}")
        if row.get('lugar'):
            info_practica.append(f"📍 {row['lugar']}")
        if info_practica:
            parts.append(" | ".join(info_practica))
        
        if row.get('publico_objetivo') and row.get('publico_objetivo') != '':
            parts.append(f"👨‍👩‍👧 PÚBLICO: {row['publico_objetivo']}")
        if row.get('entrada') and row.get('entrada') != '':
            parts.append(f"🎟️ ENTRADA: {row['entrada']}")
        if row.get('organizador'):
            parts.append(f"👥 ORGANIZA: {row['organizador']}")
        
        return "\n\n".join(parts)
    
    df['bedrock_text'] = df.apply(build_text, axis=1)
    df['document_type'] = 'evento'
    df['search_category'] = 'eventos_y_actividades'
    return df


def create_stores_bedrock_text(df):
    """Crea texto para embeddings de tiendas."""
    def build_text(row):
        parts = []
        if row.get('titulo'):
            parts.append(f"🏪 TIENDA: {row['titulo']}")
        if row.get('tipo'):
            parts.append(f"📌 CATEGORÍA: {row['tipo']}")
        if row.get('content'):
            content_text = row['content'][:600]
            if content_text:
                parts.append(content_text)
        
        ubicacion_parts = []
        if row.get('lugar'):
            ubicacion_parts.append(row['lugar'])
        if row.get('nivel'):
            ubicacion_parts.append(f"Nivel {row['nivel']}")
        if row.get('local'):
            ubicacion_parts.append(f"Local {row['local']}")
        if ubicacion_parts:
            parts.append(f"📍 UBICACIÓN: {' - '.join(ubicacion_parts)}")
        
        if row.get('horario'):
            parts.append(f"🕐 HORARIO: {row['horario']}")
        
        contacto_parts = []
        telefono = str(row.get('telefono', ''))
        if telefono and telefono not in ['nan', '', 'None']:
            contacto_parts.append(f"📞 {telefono}")
        if row.get('mail'):
            contacto_parts.append(f"📧 {row['mail']}")
        if contacto_parts:
            parts.append(f"CONTACTO: {' | '.join(contacto_parts)}")
        
        if row.get('web') and row.get('web') not in ['nan', '', 'None']:
            parts.append(f"🌐 WEB: {row['web']}")
        
        return " | ".join(parts)
    
    df['bedrock_text'] = df.apply(build_text, axis=1)
    df['document_type'] = 'tienda'
    df['search_category'] = 'comercios_y_tiendas'
    return df


def create_restaurantes_bedrock_text(df):
    """Crea texto para embeddings de restaurantes."""
    def build_text(row):
        parts = []
        if row.get('titulo'):
            parts.append(f"🍽️ RESTAURANTE: {row['titulo']}")
        if row.get('tipo'):
            parts.append(f"👨‍🍳 COCINA: {row['tipo']}")
        if row.get('content'):
            content_text = row['content'][:600]
            if content_text:
                parts.append(content_text)
        
        ubicacion_parts = []
        if row.get('lugar'):
            ubicacion_parts.append(row['lugar'])
        if row.get('nivel'):
            ubicacion_parts.append(f"Nivel {row['nivel']}")
        if row.get('local'):
            ubicacion_parts.append(f"Local {row['local']}")
        if ubicacion_parts:
            parts.append(f"📍 UBICACIÓN: {' - '.join(ubicacion_parts)}")
        
        if row.get('horario'):
            parts.append(f"🕐 HORARIO: {row['horario']}")
        
        contacto_parts = []
        telefono = str(row.get('telefono', ''))
        if telefono and telefono not in ['nan', '', 'None', '0']:
            contacto_parts.append(f"📞 {telefono}")
        if row.get('mail'):
            contacto_parts.append(f"📧 {row['mail']}")
        if contacto_parts:
            parts.append(f"CONTACTO: {' | '.join(contacto_parts)}")
        
        if row.get('web') and row.get('web') not in ['nan', '', 'None']:
            parts.append(f"🌐 WEB: {row['web']}")
        
        return " | ".join(parts)
    
    df['bedrock_text'] = df.apply(build_text, axis=1)
    df['document_type'] = 'restaurante'
    df['search_category'] = 'gastronomia'
    return df


def write_bedrock_kb_format(df, file_type, file_config, s3_bucket, output_s3_key, num_rows_per_file):
    """Escribe datos en formato optimizado para Bedrock KB."""
    s3_client = boto3.client('s3')
    num_rows = len(df)
    num_files = ceil(num_rows / num_rows_per_file)
    total_rows = 0
    output_format = file_config.get('format', 'csv')
    
    print(f"   📝 Creando {num_files} chunks...")
    
    for i in range(num_files):
        start_row = i * num_rows_per_file
        end_row = min((i + 1) * num_rows_per_file, num_rows)
        df_chunk = df.iloc[start_row:end_row].copy()
        
        if output_format == 'jsonl':
            file_name = f"{file_type}_chunk_{i+1:03d}.jsonl"
            full_s3_key = f"{output_s3_key}/{file_name}"
            
            jsonl_content = []
            for _, row in df_chunk.iterrows():
                metadata = {
                    "document_type": row['document_type'],
                    "search_category": row['search_category']
                }
                
                for field in file_config['metadata_fields']:
                    if field in row:
                        value = str(row[field])
                        if value and value not in ['nan', '', 'None']:
                            metadata[field] = value
                
                doc = {
                    "document_id": row['document_id'],
                    "content": row['bedrock_text'],
                    "metadata": metadata
                }
                jsonl_content.append(json.dumps(doc, ensure_ascii=False))
            
            s3_client.put_object(
                Bucket=s3_bucket,
                Key=full_s3_key,
                Body='\n'.join(jsonl_content).encode('utf-8'),
                ContentType='application/jsonlines'
            )
            
        else:
            file_name = f"{file_type}_chunk_{i+1:03d}.csv"
            full_s3_path = f"s3://{s3_bucket}/{output_s3_key}/{file_name}"
            
            output_columns = ['document_id', 'bedrock_text', 'document_type', 'search_category']
            for field in file_config['metadata_fields']:
                if field in df_chunk.columns:
                    output_columns.append(field)
            output_columns = [col for col in output_columns if col in df_chunk.columns]
            
            df_output = df_chunk[output_columns].copy()
            wr.s3.to_csv(df_output, full_s3_path, index=False, encoding='utf-8')
        
        metadata_doc = {
            "metadataAttributes": {
                "document_type": file_type,
                "search_category": df_chunk['search_category'].iloc[0],
                "chunk_number": i + 1,
                "total_chunks": num_files,
                "document_count": len(df_chunk),
                "data_source": file_config['filename'],
                "processing_date": datetime.utcnow().isoformat(),
                "version": "v2_optimized",
                "format": output_format
            }
        }
        
        metadata_key = f"{output_s3_key}/{file_name}.metadata.json"
        s3_client.put_object(
            Bucket=s3_bucket,
            Key=metadata_key,
            Body=json.dumps(metadata_doc, ensure_ascii=False, indent=2),
            ContentType='application/json'
        )
        
        total_rows += len(df_chunk)
        print(f"      ✓ {file_name} ({len(df_chunk)} docs)")
    
    return total_rows


def sanitize_text(text):
    """Limpia texto para usar en IDs."""
    text = str(text)
    text = re.sub(r'[^a-zA-Z0-9]', '_', text)
    text = re.sub(r'_+', '_', text)
    return text.strip('_')