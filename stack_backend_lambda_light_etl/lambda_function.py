import re
import os
import json
import boto3
import awswrangler as wr
import pandas as pd
from math import ceil
from io import StringIO
from datetime import datetime


def lambda_handler(event, context):
    try:
        # S3 bucket configuration
        s3_bucket = "raw-virtual-assistant-data-948270077717-us-east-1"
        
        # Define CSV files with optimized configurations for Bedrock KB
        csv_files = {
            'eventos': {
                'filename': 'eventos.csv',
                'encoding': 'utf-8',
                'text_fields': ['titulo', 'descripcion', 'contenido'],
                'metadata_fields': ['fecha_texto', 'hora_texto', 'lugar', 'organizador', 'tipo', 'horas'],
                'id_field': 'titulo'
            },
            'preguntas': {
                'filename': 'preguntas.csv',
                'encoding': 'cp1252',
                'text_fields': ['Preguntas tipo', 'Respuesta'],
                'metadata_fields': ['Categoria'],
                'id_field': 'Preguntas tipo'
            },
            'stores': {
                'filename': 'stores.csv',
                'encoding': 'utf-8',
                'text_fields': ['titulo', 'content'],
                'metadata_fields': ['lugar', 'horario', 'nivel', 'local', 'telefono', 'mail', 'tipo', 'web', 'url_web'],
                'id_field': 'titulo'
            },
            'restaurantes': {
                'filename': 'todas_restaurantes.csv',
                'encoding': 'utf-8',
                'text_fields': ['titulo', 'content'],
                'metadata_fields': ['lugar', 'horario', 'nivel', 'local', 'telefono', 'mail', 'tipo', 'web', 'url_web'],
                'id_field': 'titulo'
            }
        }
        
        # Output configuration
        num_rows_per_file = 25  # Optimizado para chunks más pequeños y precisos
        
        # Knowledge Base output path - separar por tipo de documento
        base_output_path = os.environ.get('KB_S3_PATH', 'datasets/demo_kb/knowledge-base-ecommerce-s3-001/v1')
        
        results = {}
        
        # Process each CSV file
        for file_type, file_config in csv_files.items():
            filename = file_config['filename']
            encoding = file_config['encoding']
            s3_path = f"s3://{s3_bucket}/{filename}"
            
            # Crear path específico por tipo de documento
            output_s3_key = f"{base_output_path}/{file_type}"
            
            print(f"Processing {file_type} from {s3_path}")
            
            try:
                # Read CSV with robust parsing
                df = read_csv_robust(s3_path, encoding)
                
                if df is None or len(df) == 0:
                    print(f"Warning: {file_type} is empty. Skipping...")
                    results[file_type] = 0
                    continue
                
                print(f"Successfully read {len(df)} rows from {file_type}")
                
                # Transform and enrich dataframe for Bedrock KB
                df = transform_for_bedrock_kb(df, file_type, file_config)
                
                print(f"Writing {len(df)} optimized documents for {file_type}...")
                
                # Write to S3 with enhanced metadata
                rows_written = write_bedrock_kb_format(
                    df=df,
                    file_type=file_type,
                    file_config=file_config,
                    s3_bucket=s3_bucket,
                    output_s3_key=output_s3_key,
                    num_rows_per_file=num_rows_per_file
                )
                
                results[file_type] = rows_written
                print(f"✓ {file_type}: {rows_written} documents written")
                
            except Exception as e:
                print(f"✗ Error processing {file_type}: {str(e)}")
                results[file_type] = f"Error: {str(e)}"
                continue
        
        return {
            "statusCode": 200,
            "body": {
                "message": "Data successfully processed for Bedrock Knowledge Base",
                "output_path": base_output_path,
                "results": results,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
    except Exception as e:
        print(f"Critical error: {str(e)}")
        return {
            "statusCode": 500,
            "body": {"error": str(e)}
        }


def read_csv_robust(s3_path, encoding):
    """Read CSV with multiple fallback strategies."""
    try:
        df = wr.s3.read_csv(
            path=s3_path,
            header=0,
            sep=',',
            quotechar='"',
            encoding=encoding,
            escapechar='\\',
            on_bad_lines='skip',
            engine='python'
        )
        return df
    except Exception as e1:
        print(f"Strategy 1 failed: {str(e1)}")
        
        try:
            s3_client = boto3.client('s3')
            bucket, key = s3_path.replace('s3://', '').split('/', 1)
            
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            content = obj['Body'].read().decode(encoding)
            
            df = pd.read_csv(
                StringIO(content),
                sep=',',
                quotechar='"',
                encoding=encoding,
                on_bad_lines='skip',
                engine='python',
                dtype=str
            )
            return df
        except Exception as e2:
            print(f"All strategies failed: {str(e2)}")
            return None


def transform_for_bedrock_kb(df, file_type, file_config):
    """
    Transform DataFrame optimized for Bedrock Knowledge Base embeddings.
    Creates a rich text field combining relevant fields for better semantic search.
    """
    
    # Clean all text fields
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()
            df[col] = df[col].replace(['nan', 'None', 'NaN', ''], '')
    
    # Create optimized text content for embeddings based on file type
    if file_type == 'eventos':
        df['bedrock_text'] = df.apply(lambda row: create_evento_text(row), axis=1)
        df['document_type'] = 'evento'
        df['search_category'] = 'eventos_y_actividades'
        
    elif file_type == 'preguntas':
        df['bedrock_text'] = df.apply(lambda row: create_pregunta_text(row), axis=1)
        df['document_type'] = 'faq'
        df['search_category'] = 'preguntas_frecuentes'
        
    elif file_type == 'stores':
        df['bedrock_text'] = df.apply(lambda row: create_store_text(row), axis=1)
        df['document_type'] = 'tienda'
        df['search_category'] = 'comercios_y_tiendas'
        
    elif file_type == 'restaurantes':
        df['bedrock_text'] = df.apply(lambda row: create_restaurant_text(row), axis=1)
        df['document_type'] = 'restaurante'
        df['search_category'] = 'gastronomia'
    
    # Generate unique document IDs
    df['document_id'] = df.apply(
        lambda row: generate_document_id(file_type, row.name, row.get(file_config['id_field'], '')),
        axis=1
    )
    
    # Remove rows with empty bedrock_text
    df = df[df['bedrock_text'].str.len() > 20]
    
    # Fill remaining NaN
    df = df.fillna('')
    
    return df


def create_evento_text(row):
    """Create optimized text for evento embeddings."""
    parts = []
    
    if row.get('titulo'):
        parts.append(f"Evento: {row['titulo']}")
    
    if row.get('descripcion'):
        parts.append(f"Descripción: {row['descripcion'][:500]}")
    
    if row.get('contenido'):
        parts.append(f"{row['contenido'][:500]}")
    
    if row.get('fecha_texto'):
        parts.append(f"Fecha: {row['fecha_texto']}")
    
    if row.get('hora_texto'):
        parts.append(f"Horario: {row['hora_texto']}")
    
    if row.get('lugar'):
        parts.append(f"Lugar: {row['lugar']}")
    
    if row.get('organizador'):
        parts.append(f"Organiza: {row['organizador']}")
    
    return " | ".join(parts)


def create_pregunta_text(row):
    """Create optimized text for FAQ embeddings."""
    pregunta = row.get('Preguntas tipo', '')
    respuesta = row.get('Respuesta', '')
    categoria = row.get('Categoria', '')
    
    text = f"Pregunta: {pregunta}\n\nRespuesta: {respuesta}"
    
    if categoria:
        text = f"[{categoria}] {text}"
    
    return text


def create_store_text(row):
    """Create optimized text for store embeddings."""
    parts = []
    
    if row.get('titulo'):
        parts.append(f"Tienda: {row['titulo']}")
    
    if row.get('content'):
        parts.append(f"{row['content'][:400]}")
    
    if row.get('lugar'):
        parts.append(f"Ubicación: {row['lugar']}")
    
    if row.get('local'):
        parts.append(f"Local: {row['local']}")
    
    if row.get('horario'):
        parts.append(f"Horario: {row['horario']}")
    
    if row.get('tipo'):
        parts.append(f"Tipo: {row['tipo']}")
    
    return " | ".join(parts)


def create_restaurant_text(row):
    """Create optimized text for restaurant embeddings."""
    parts = []
    
    if row.get('titulo'):
        parts.append(f"Restaurante: {row['titulo']}")
    
    if row.get('content'):
        parts.append(f"{row['content'][:400]}")
    
    if row.get('lugar'):
        parts.append(f"Ubicación: {row['lugar']}")
    
    if row.get('local'):
        parts.append(f"Local: {row['local']}")
    
    if row.get('horario'):
        parts.append(f"Horario: {row['horario']}")
    
    if row.get('tipo'):
        parts.append(f"Tipo de cocina: {row['tipo']}")
    
    return " | ".join(parts)


def generate_document_id(file_type, index, identifier):
    """Generate unique document ID."""
    clean_id = re.sub(r'[^a-zA-Z0-9]', '_', str(identifier)[:50])
    return f"{file_type}_{index}_{clean_id}"


def write_bedrock_kb_format(df, file_type, file_config, s3_bucket, output_s3_key, num_rows_per_file):
    """
    Write data in optimized format for Bedrock Knowledge Base.
    Creates CSV files with text content and separate metadata JSON files.
    """
    
    s3_client = boto3.client('s3')
    
    num_rows = len(df)
    num_files = ceil(num_rows / num_rows_per_file)
    
    total_rows = 0
    
    for i in range(num_files):
        start_row = i * num_rows_per_file
        end_row = min((i + 1) * num_rows_per_file, num_rows)
        
        df_chunk = df.iloc[start_row:end_row].copy()
        
        # File naming
        file_name = f"{file_type}_part_{i+1:03d}.csv"
        full_s3_path = f"s3://{s3_bucket}/{output_s3_key}/{file_name}"
        
        # Prepare data for CSV (text content + metadata columns)
        output_columns = ['document_id', 'bedrock_text', 'document_type', 'search_category']
        
        # Add metadata fields
        for field in file_config['metadata_fields']:
            if field in df_chunk.columns:
                output_columns.append(field)
        
        df_output = df_chunk[output_columns].copy()
        
        # Write CSV to S3
        wr.s3.to_csv(
            df_output,
            full_s3_path,
            index=False,
            encoding='utf-8'
        )
        
        # Create enhanced metadata for Bedrock KB
        metadata = {
            "metadataAttributes": {
                "document_type": file_type,
                "search_category": df_chunk['search_category'].iloc[0],
                "chunk_number": i + 1,
                "total_chunks": num_files,
                "document_count": len(df_chunk),
                "data_source": file_config['filename'],
                "processing_date": datetime.utcnow().isoformat(),
                "version": "v1"
            }
        }
        
        # Write metadata JSON
        metadata_key = f"{output_s3_key}/{file_name}.metadata.json"
        s3_client.put_object(
            Bucket=s3_bucket,
            Key=metadata_key,
            Body=json.dumps(metadata, ensure_ascii=False, indent=2),
            ContentType='application/json'
        )
        
        total_rows += len(df_chunk)
        print(f"  ✓ Written: {file_name} ({len(df_chunk)} documents)")
    
    return total_rows