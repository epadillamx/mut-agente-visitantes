"""
Lambda Function: Data Extraction and Vectorial Preparation
Extrae datos de mut.cl API y prepara datos vectoriales para Knowledge Base
"""
import os
import json
import boto3
import requests
import pandas as pd
import unicodedata
import re
from datetime import datetime
from io import StringIO

s3_client = boto3.client('s3')

# Variables de entorno
S3_BUCKET_NAME = os.environ['S3_BUCKET_NAME']
S3_RAW_PREFIX = os.environ.get('S3_RAW_PREFIX', 'raw/')
S3_VECTORIAL_PREFIX = os.environ.get('S3_VECTORIAL_PREFIX', 'vectorial/')
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://mut.cl/wp-json/wp/v2')

def lambda_handler(event, context):
    """
    Main handler - Ejecuta extracción completa de datos
    """
    print("=" * 80)
    print("🚀 Iniciando extracción de datos desde mut.cl")
    print("=" * 80)
    
    results = {
        'timestamp': datetime.now().isoformat(),
        'bucket': S3_BUCKET_NAME,
        'extractions': {}
    }
    
    try:
        # 1. Extraer Eventos
        print("\n📅 Extrayendo eventos...")
        eventos_df = extraer_eventos()
        results['extractions']['eventos'] = upload_to_s3(eventos_df, 'eventos')
        
        # 2. Extraer Tiendas
        print("\n🏪 Extrayendo tiendas...")
        tiendas_df = extraer_tiendas()
        results['extractions']['tiendas'] = upload_to_s3(tiendas_df, 'tiendas')
        
        # 3. Extraer Restaurantes
        print("\n🍽️ Extrayendo restaurantes...")
        restaurantes_df = extraer_restaurantes()
        results['extractions']['restaurantes'] = upload_to_s3(restaurantes_df, 'restaurantes')
        
        # 4. Preparar datos vectoriales
        print("\n🔄 Preparando datos vectoriales...")
        preparar_datos_vectoriales(eventos_df, tiendas_df, restaurantes_df)
        
        results['status'] = 'success'
        results['message'] = 'Extracción completada exitosamente'
        
        print("\n" + "=" * 80)
        print("✅ Proceso completado exitosamente")
        print("=" * 80)
        
        return {
            'statusCode': 200,
            'body': json.dumps(results)
        }
        
    except Exception as e:
        print(f"\n❌ Error en el proceso: {str(e)}")
        results['status'] = 'error'
        results['error'] = str(e)
        
        return {
            'statusCode': 500,
            'body': json.dumps(results)
        }


def extraer_eventos():
    """Extrae eventos desde API de WordPress"""
    todos_eventos = []
    
    for i in range(1, 101):
        url = f"{API_BASE_URL}/event?per_page=100&page={i}"
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if len(data) == 0:
                print(f"   No hay más datos en página {i}")
                break
            
            print(f"   Procesando página {i}: {len(data)} eventos")
            
            for item in data:
                acf = item.get('acf', {})
                info_destacada = acf.get('informacion_destacada', {})
                info_tienda = acf.get('informacion_tienda', [])
                
                # Extraer horas
                hours_list = info_destacada.get('hours', [])
                hours = ', '.join([h.get('hour', '') for h in hours_list if h.get('hour')]) if hours_list else ''
                
                # Extraer información del primer card
                date_text = ''
                hour_text = ''
                place_text = ''
                description = ''
                
                if info_tienda and len(info_tienda) > 0:
                    cards = info_tienda[0].get('cards', [])
                    if cards and len(cards) > 0:
                        card = cards[0]
                        data_card = card.get('data', {})
                        date_text = data_card.get('date', '')
                        hour_text = data_card.get('hour', '')
                        place_text = data_card.get('place', '')
                        description = data_card.get('description', '')
                
                contenido = item.get('content', {}).get('rendered', '')
                contenido_limpio = contenido.replace('<p>', '').replace('</p>', '').replace('&#8230;', '...')
                
                todos_eventos.append({
                    'titulo': item.get('title', {}).get('rendered', ''),
                    'link': item.get('link', ''),
                    'contenido': contenido_limpio,
                    'horas': hours,
                    'fecha_texto': date_text,
                    'hora_texto': hour_text,
                    'lugar': place_text,
                    'descripcion': description,
                    'organizador': info_destacada.get('organizer', ''),
                    'tipo': 'event'
                })
                
        except Exception as e:
            print(f"   Error en página {i}: {str(e)}")
            break
    
    df = pd.DataFrame(todos_eventos)
    print(f"   ✓ Total eventos extraídos: {len(df)}")
    return df


def extraer_tiendas():
    """Extrae tiendas desde API de WordPress"""
    todas_tiendas = []
    
    for i in range(1, 101):
        url = f"{API_BASE_URL}/stores?per_page=100&page={i}"
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if len(data) == 0:
                print(f"   No hay más datos en página {i}")
                break
            
            print(f"   Procesando página {i}: {len(data)} tiendas")
            
            for item in data:
                info_t = item.get('acf', {}).get('informacion_tienda', [{}])
                
                if not info_t or not isinstance(info_t, list):
                    info_t = [{}]
                
                info = info_t[0].get('info', {}) if info_t[0] else {}
                
                # Redes sociales
                rss_list = info_t[0].get('rrss', []) if info_t[0] else []
                rss_urls = []
                if rss_list and isinstance(rss_list, list):
                    for r in rss_list:
                        if isinstance(r, dict):
                            url = r.get('url') or r.get('link') or r.get('value') or ''
                            if url:
                                rss_urls.append(str(url))
                        elif isinstance(r, str):
                            rss_urls.append(r)
                
                rss = '; '.join(rss_urls) if rss_urls else ''
                
                # Web
                page_link = info.get('page_link') if info else None
                if isinstance(page_link, dict):
                    web_title = page_link.get('title', '')
                    web_url = page_link.get('url', '')
                elif page_link:
                    web_title = str(page_link)
                    web_url = ''
                else:
                    web_title = ''
                    web_url = ''
                
                contenido = item.get('content', {}).get('rendered', '')
                
                todas_tiendas.append({
                    'titulo': item.get('title', {}).get('rendered', ''),
                    'content': contenido.replace('<p>&#8230;', '').replace('<p>Tienda&#8230;', ''),
                    'link': item.get('link', ''),
                    'rss': rss,
                    'horario': info.get('schedule', '') if info else '',
                    'web': web_title,
                    'url_web': web_url,
                    'lugar': info.get('place', '') if info else '',
                    'nivel': info.get('level', '') if info else '',
                    'local': info.get('local', '') if info else '',
                    'telefono': info.get('phone', '') if info else '',
                    'mail': info.get('mail', '') if info else '',
                    'tipo': 'Tienda'
                })
                
        except Exception as e:
            print(f"   Error en página {i}: {str(e)}")
            break
    
    df = pd.DataFrame(todas_tiendas)
    print(f"   ✓ Total tiendas extraídas: {len(df)}")
    return df


def extraer_restaurantes():
    """Extrae restaurantes desde API de WordPress"""
    todos_restaurantes = []
    
    for i in range(1, 101):
        url = f"{API_BASE_URL}/restaurant?per_page=100&page={i}"
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if len(data) == 0:
                print(f"   No hay más datos en página {i}")
                break
            
            print(f"   Procesando página {i}: {len(data)} restaurantes")
            
            for item in data:
                info_t = item.get('acf', {}).get('informacion_tienda', [{}])
                
                if not info_t or not isinstance(info_t, list):
                    info_t = [{}]
                
                info = info_t[0].get('info', {}) if info_t[0] else {}
                
                # Redes sociales
                rss_list = info_t[0].get('rrss', []) if info_t[0] else []
                rss_urls = []
                if rss_list and isinstance(rss_list, list):
                    for r in rss_list:
                        if isinstance(r, dict):
                            url = r.get('url') or r.get('link') or r.get('value') or ''
                            if url:
                                rss_urls.append(str(url))
                        elif isinstance(r, str):
                            rss_urls.append(r)
                
                rss = '; '.join(rss_urls) if rss_urls else ''
                
                # Web
                page_link = info.get('page_link') if info else None
                if isinstance(page_link, dict):
                    web_title = page_link.get('title', '')
                    web_url = page_link.get('url', '')
                elif page_link:
                    web_title = str(page_link)
                    web_url = ''
                else:
                    web_title = ''
                    web_url = ''
                
                contenido = item.get('content', {}).get('rendered', '')
                
                todos_restaurantes.append({
                    'titulo': item.get('title', {}).get('rendered', ''),
                    'content': contenido.replace('<p>&#8230;', '').replace('<p>Restaurante&#8230;', ''),
                    'link': item.get('link', ''),
                    'rss': rss,
                    'horario': info.get('schedule', '') if info else '',
                    'web': web_title,
                    'url_web': web_url,
                    'lugar': info.get('place', '') if info else '',
                    'nivel': info.get('level', '') if info else '',
                    'local': info.get('local', '') if info else '',
                    'telefono': info.get('phone', '') if info else '',
                    'mail': info.get('mail', '') if info else '',
                    'tipo': 'Restaurante'
                })
                
        except Exception as e:
            print(f"   Error en página {i}: {str(e)}")
            break
    
    df = pd.DataFrame(todos_restaurantes)
    print(f"   ✓ Total restaurantes extraídos: {len(df)}")
    return df


def upload_to_s3(df, tipo):
    """Sube DataFrame a S3 como CSV - Nombre constante para reemplazo"""
    csv_buffer = StringIO()
    df.to_csv(csv_buffer, index=False, encoding='utf-8')
    
    # Nombre constante - siempre se reemplaza el archivo
    key = f"{S3_RAW_PREFIX}{tipo}.csv"
    
    s3_client.put_object(
        Bucket=S3_BUCKET_NAME,
        Key=key,
        Body=csv_buffer.getvalue(),
        ContentType='text/csv'
    )
    
    print(f"   ✓ Subido a s3://{S3_BUCKET_NAME}/{key} (reemplazado)")
    
    return {
        'records': len(df),
        's3_key': key,
        'size_bytes': len(csv_buffer.getvalue())
    }


def limpiar_texto(texto):
    """Limpia y normaliza texto para embeddings"""
    if pd.isna(texto) or texto == '':
        return ''
    
    texto = str(texto).strip()
    texto = unicodedata.normalize('NFKD', texto)
    texto = texto.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ')
    texto = re.sub(r'\s+', ' ', texto)
    texto = re.sub(r'<[^>]+>', '', texto)
    
    return texto.strip()


def preparar_datos_vectoriales(eventos_df, tiendas_df, restaurantes_df):
    """Prepara datos vectoriales y sube a S3 - Nombres constantes"""
    
    # Procesar eventos
    if not eventos_df.empty:
        eventos_df['texto_embedding'] = eventos_df.apply(crear_texto_embedding_evento, axis=1)
        eventos_df['document_type'] = 'evento'
        eventos_df['search_category'] = 'eventos_y_actividades'
        eventos_vectorial = eventos_df[eventos_df['texto_embedding'].str.len() > 30]
        
        csv_buffer = StringIO()
        eventos_vectorial.to_csv(csv_buffer, index=False, encoding='utf-8')
        key = f"{S3_VECTORIAL_PREFIX}eventos_vectorial.csv"
        s3_client.put_object(Bucket=S3_BUCKET_NAME, Key=key, Body=csv_buffer.getvalue())
        print(f"   ✓ Eventos vectoriales: s3://{S3_BUCKET_NAME}/{key} (reemplazado)")
    
    # Procesar tiendas
    if not tiendas_df.empty:
        tiendas_df['texto_embedding'] = tiendas_df.apply(crear_texto_embedding_tienda, axis=1)
        tiendas_df['document_type'] = 'tienda'
        tiendas_df['search_category'] = 'comercios_y_tiendas'
        tiendas_vectorial = tiendas_df[tiendas_df['texto_embedding'].str.len() > 30]
        
        csv_buffer = StringIO()
        tiendas_vectorial.to_csv(csv_buffer, index=False, encoding='utf-8')
        key = f"{S3_VECTORIAL_PREFIX}stores_vectorial.csv"
        s3_client.put_object(Bucket=S3_BUCKET_NAME, Key=key, Body=csv_buffer.getvalue())
        print(f"   ✓ Tiendas vectoriales: s3://{S3_BUCKET_NAME}/{key} (reemplazado)")
    
    # Procesar restaurantes
    if not restaurantes_df.empty:
        restaurantes_df['texto_embedding'] = restaurantes_df.apply(crear_texto_embedding_restaurante, axis=1)
        restaurantes_df['document_type'] = 'restaurante'
        restaurantes_df['search_category'] = 'gastronomia'
        restaurantes_vectorial = restaurantes_df[restaurantes_df['texto_embedding'].str.len() > 30]
        
        csv_buffer = StringIO()
        restaurantes_vectorial.to_csv(csv_buffer, index=False, encoding='utf-8')
        key = f"{S3_VECTORIAL_PREFIX}restaurantes_vectorial.csv"
        s3_client.put_object(Bucket=S3_BUCKET_NAME, Key=key, Body=csv_buffer.getvalue())
        print(f"   ✓ Restaurantes vectoriales: s3://{S3_BUCKET_NAME}/{key} (reemplazado)")


def crear_texto_embedding_evento(row):
    """Crea texto optimizado para embedding de eventos"""
    partes = []
    
    if row.get('tipo'):
        partes.append(f"Tipo: {limpiar_texto(row['tipo'])}")
    if row.get('titulo'):
        partes.append(f"Evento: {limpiar_texto(row['titulo'])}")
    if row.get('fecha_texto'):
        partes.append(f"Fecha: {limpiar_texto(row['fecha_texto'])}")
    if row.get('hora_texto'):
        partes.append(f"Hora: {limpiar_texto(row['hora_texto'])}")
    if row.get('lugar'):
        partes.append(f"Lugar: {limpiar_texto(row['lugar'])}")
    if row.get('descripcion'):
        partes.append(f"Descripción: {limpiar_texto(row['descripcion'])}")
    if row.get('contenido'):
        partes.append(f"Detalles: {limpiar_texto(row['contenido'])}")
    if row.get('organizador'):
        partes.append(f"Organizador: {limpiar_texto(row['organizador'])}")
    if row.get('link'):
        partes.append(f"Más información: {row['link']}")
    
    return " | ".join(partes)


def crear_texto_embedding_tienda(row):
    """Crea texto optimizado para embedding de tiendas"""
    partes = []
    
    if row.get('tipo'):
        partes.append(f"Tipo: {limpiar_texto(row['tipo'])}")
    if row.get('titulo'):
        partes.append(f"Tienda: {limpiar_texto(row['titulo'])}")
    if row.get('nivel'):
        partes.append(f"Nivel: {limpiar_texto(row['nivel'])}")
    if row.get('local'):
        partes.append(f"Local: {limpiar_texto(row['local'])}")
    if row.get('lugar'):
        partes.append(f"Ubicación: {limpiar_texto(row['lugar'])}")
    if row.get('horario'):
        partes.append(f"Horario: {limpiar_texto(row['horario'])}")
    if row.get('content'):
        partes.append(f"Descripción: {limpiar_texto(row['content'])}")
    if row.get('telefono'):
        partes.append(f"Teléfono: {limpiar_texto(row['telefono'])}")
    if row.get('web'):
        partes.append(f"Web: {limpiar_texto(row['web'])}")
    if row.get('link'):
        partes.append(f"Más información: {row['link']}")
    
    return " | ".join(partes)


def crear_texto_embedding_restaurante(row):
    """Crea texto optimizado para embedding de restaurantes"""
    partes = []
    
    if row.get('tipo'):
        partes.append(f"Tipo: {limpiar_texto(row['tipo'])}")
    if row.get('titulo'):
        partes.append(f"Restaurante: {limpiar_texto(row['titulo'])}")
    if row.get('nivel'):
        partes.append(f"Nivel: {limpiar_texto(row['nivel'])}")
    if row.get('local'):
        partes.append(f"Local: {limpiar_texto(row['local'])}")
    if row.get('lugar'):
        partes.append(f"Ubicación: {limpiar_texto(row['lugar'])}")
    if row.get('horario'):
        partes.append(f"Horario: {limpiar_texto(row['horario'])}")
    if row.get('content'):
        partes.append(f"Descripción: {limpiar_texto(row['content'])}")
    if row.get('telefono'):
        partes.append(f"Teléfono: {limpiar_texto(row['telefono'])}")
    if row.get('web'):
        partes.append(f"Web: {limpiar_texto(row['web'])}")
    if row.get('link'):
        partes.append(f"Más información: {row['link']}")
    
    return " | ".join(partes)
