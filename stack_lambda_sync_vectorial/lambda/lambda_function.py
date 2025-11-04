"""
Lambda Function: Bedrock Knowledge Base Sync
Sincroniza los 4 data sources del Knowledge Base de Bedrock SECUENCIALMENTE
(eventos, restaurantes, preguntas, stores)
"""
import os
import json
import boto3
import time
from datetime import datetime

s3_client = boto3.client('s3')
bedrock_agent_client = boto3.client('bedrock-agent')

# Variables de entorno
S3_BUCKET_NAME = os.environ['S3_BUCKET_NAME']
S3_VECTORIAL_PREFIX = os.environ.get('S3_VECTORIAL_PREFIX', 'vectorial/')
KNOWLEDGE_BASE_ID = os.environ['KNOWLEDGE_BASE_ID']
AGENT_ID = os.environ['AGENT_ID']

def lambda_handler(event, context):
    """
    Main handler - Sincroniza base de datos vectorial y actualiza Knowledge Base
    Los ingestion jobs se ejecutan SECUENCIALMENTE para evitar el límite de concurrencia
    """
    print("=" * 80)
    print("🔄 Iniciando sincronización SECUENCIAL de base de datos vectorial")
    print("=" * 80)
    print(f"📥 Event recibido: {json.dumps(event, indent=2)}")
    
    results = {
        'timestamp': datetime.now().isoformat(),
        'knowledge_base_id': KNOWLEDGE_BASE_ID,
        'agent_id': AGENT_ID,
        'steps': {}
    }
    
    try:
        # 1. Verificar archivos vectoriales en S3
        print(f"\n📦 Verificando archivos en s3://{S3_BUCKET_NAME}/{S3_VECTORIAL_PREFIX}")
        archivos = listar_archivos_vectoriales()
        results['steps']['archivos_encontrados'] = len(archivos)
        print(f"   ✓ Encontrados {len(archivos)} archivos vectoriales")
        
        if len(archivos) == 0:
            print("   ⚠️  No hay archivos para sincronizar")
            results['status'] = 'no_data'
            results['message'] = 'No hay archivos vectoriales para sincronizar'
            return {
                'statusCode': 200,
                'body': json.dumps(results)
            }
        
        # 2. Iniciar ingestion jobs SECUENCIALMENTE
        print(f"\n🚀 Iniciando ingestion jobs SECUENCIALES en Knowledge Base: {KNOWLEDGE_BASE_ID}")
        print("   ⏱️  Límite AWS: 1 job concurrente por Knowledge Base")
        
        # Obtener TODOS los Data Source IDs del Knowledge Base
        print("\n   📋 Consultando data sources del Knowledge Base...")
        data_source_ids = obtener_data_source_ids()
        
        if not data_source_ids or len(data_source_ids) == 0:
            raise Exception("No se encontraron Data Sources en el Knowledge Base")
        
        print(f"   ✅ Se sincronizarán {len(data_source_ids)} data sources SECUENCIALMENTE")
        
        # Ejecutar ingestion jobs UNO POR UNO
        ingestion_jobs = sincronizar_data_sources_secuencialmente(data_source_ids)
        
        results['steps']['ingestion_jobs'] = {
            'total': len(data_source_ids),
            'completed': sum(1 for job in ingestion_jobs if job.get('status') == 'COMPLETE'),
            'failed': sum(1 for job in ingestion_jobs if job.get('status') == 'error'),
            'jobs': ingestion_jobs
        }
        
        # 3. Preparar el agente para usar los datos actualizados
        print(f"\n🤖 Preparando agente: {AGENT_ID}")
        
        try:
            prepare_response = bedrock_agent_client.prepare_agent(
                agentId=AGENT_ID
            )
            
            agent_status = prepare_response.get('agentStatus', 'UNKNOWN')
            print(f"   ✓ Agente preparado")
            print(f"   Status: {agent_status}")
            
            results['steps']['agent_preparation'] = {
                'status': agent_status,
                'prepared_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"   ⚠️  Error al preparar agente: {str(e)}")
            results['steps']['agent_preparation'] = {
                'status': 'error',
                'error': str(e)
            }
        
        results['status'] = 'success'
        results['message'] = f'Sincronización completada: {results["steps"]["ingestion_jobs"]["completed"]} exitosos, {results["steps"]["ingestion_jobs"]["failed"]} fallidos'
        
        print("\n" + "=" * 80)
        print("✅ Sincronización completada")
        print("=" * 80)
        print(f"   ✓ Jobs completados: {results['steps']['ingestion_jobs']['completed']}/{len(ingestion_jobs)}")
        print(f"   ✗ Jobs fallidos: {results['steps']['ingestion_jobs']['failed']}/{len(ingestion_jobs)}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(results)
        }
        
    except Exception as e:
        print(f"\n❌ Error en la sincronización: {str(e)}")
        results['status'] = 'error'
        results['error'] = str(e)
        
        return {
            'statusCode': 500,
            'body': json.dumps(results)
        }


def sincronizar_data_sources_secuencialmente(data_sources):
    """
    Sincroniza cada data source UNO POR UNO esperando que complete
    AWS Bedrock solo permite 1 ingestion job concurrente por Knowledge Base
    """
    ingestion_jobs = []
    
    for idx, ds in enumerate(data_sources, 1):
        print(f"\n{'='*60}")
        print(f"📥 [{idx}/{len(data_sources)}] Sincronizando: {ds['name']}")
        print(f"{'='*60}")
        
        try:
            # Iniciar ingestion job
            print(f"   🚀 Iniciando job para data source: {ds['id']}")
            ingestion_response = bedrock_agent_client.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=ds['id'],
                description=f"Sincronización automática secuencial - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            job_id = ingestion_response['ingestionJob']['ingestionJobId']
            job_status = ingestion_response['ingestionJob']['status']
            
            print(f"   ✓ Job iniciado: {job_id}")
            print(f"   ⏱️  Status inicial: {job_status}")
            
            # Esperar a que el job complete
            print(f"   ⏳ Esperando completación del job...")
            final_status = esperar_completacion_job(ds['id'], job_id)
            
            ingestion_jobs.append({
                'data_source_id': ds['id'],
                'data_source_name': ds['name'],
                'job_id': job_id,
                'status': final_status,
                'completed_at': datetime.now().isoformat()
            })
            
            print(f"   ✅ Job completado con status: {final_status}")
            
        except Exception as e:
            error_msg = str(e)
            print(f"   ❌ Error al sincronizar {ds['name']}: {error_msg}")
            
            ingestion_jobs.append({
                'data_source_id': ds['id'],
                'data_source_name': ds['name'],
                'status': 'error',
                'error': error_msg
            })
    
    return ingestion_jobs


def esperar_completacion_job(data_source_id, job_id, timeout=600, check_interval=10):
    """
    Espera a que un ingestion job complete
    
    Args:
        data_source_id: ID del data source
        job_id: ID del job de ingestión
        timeout: Tiempo máximo de espera en segundos (default: 10 minutos)
        check_interval: Intervalo entre checks en segundos (default: 10 segundos)
    
    Returns:
        Status final del job
    """
    start_time = time.time()
    
    while True:
        # Verificar timeout
        elapsed = time.time() - start_time
        if elapsed > timeout:
            print(f"   ⚠️  Timeout alcanzado ({timeout}s), job aún en progreso")
            return 'TIMEOUT'
        
        try:
            # Consultar status del job
            response = bedrock_agent_client.get_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=data_source_id,
                ingestionJobId=job_id
            )
            
            job_status = response['ingestionJob']['status']
            
            # Estados terminales
            if job_status in ['COMPLETE', 'FAILED', 'STOPPED']:
                return job_status
            
            # Estados en progreso
            if job_status in ['STARTING', 'IN_PROGRESS']:
                print(f"      ⏳ Status: {job_status} (esperando {int(elapsed)}s)")
                time.sleep(check_interval)
                continue
            
            # Status desconocido
            print(f"      ⚠️  Status desconocido: {job_status}")
            return job_status
            
        except Exception as e:
            print(f"      ❌ Error al verificar status: {str(e)}")
            time.sleep(check_interval)


def listar_archivos_vectoriales():
    """Lista archivos vectoriales en S3"""
    archivos = []
    
    try:
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET_NAME,
            Prefix=S3_VECTORIAL_PREFIX
        )
        
        if 'Contents' in response:
            for obj in response['Contents']:
                if obj['Key'].endswith('.csv'):
                    archivos.append({
                        'key': obj['Key'],
                        'size': obj['Size'],
                        'last_modified': obj['LastModified'].isoformat()
                    })
                    print(f"   - {obj['Key']} ({obj['Size']} bytes)")
        
    except Exception as e:
        print(f"   Error al listar archivos: {str(e)}")
    
    return archivos


def obtener_data_source_ids():
    """Obtiene TODOS los Data Source IDs del Knowledge Base"""
    try:
        # Listar data sources del Knowledge Base
        response = bedrock_agent_client.list_data_sources(
            knowledgeBaseId=KNOWLEDGE_BASE_ID
        )
        
        data_source_ids = []
        if 'dataSourceSummaries' in response and len(response['dataSourceSummaries']) > 0:
            for ds in response['dataSourceSummaries']:
                data_source_ids.append({
                    'id': ds['dataSourceId'],
                    'name': ds.get('name', 'unknown'),
                    'status': ds.get('status', 'unknown')
                })
            
            print(f"   ℹ️  Encontrados {len(data_source_ids)} data sources:")
            for ds in data_source_ids:
                print(f"      • {ds['name']} ({ds['id']}) - Status: {ds['status']}")
        
        return data_source_ids
        
    except Exception as e:
        print(f"   ❌ Error al obtener Data Source IDs: {str(e)}")
        import traceback
        traceback.print_exc()
        return []
