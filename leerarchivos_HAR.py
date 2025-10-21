import json
import csv
import os
from datetime import datetime
from pathlib import Path


def procesar_archivo_har(archivo_har):
    """
    Procesa un archivo HAR y devuelve las peticiones filtradas.

    Args:
        archivo_har: Ruta al archivo HAR

    Returns:
        Lista de diccionarios con las peticiones
    """
    peticiones = []
    peticiones_descartadas = 0

    # Tipos MIME a descartar
    tipos_descartados = [
        'image/', 'text/css', 'font/', 'application/font',
        'application/x-font', 'application/octet-stream'
    ]

    try:
        with open(archivo_har, 'r', encoding='utf-8') as f:
            har_data = json.load(f)

        entries = har_data['log']['entries']
        nombre_archivo = os.path.basename(archivo_har)

        for entry in entries:
            request = entry['request']
            response = entry['response']

            # Obtener tipo de contenido
            mime_type = response.get('content', {}).get('mimeType', '')

            # Descartar imágenes, CSS y fuentes
            if any(mime_type.startswith(tipo) for tipo in tipos_descartados):
                peticiones_descartadas += 1
                continue

            # Extraer información relevante
            peticion = {
                'archivo_origen': nombre_archivo,
                'fecha_hora': entry.get('startedDateTime', ''),
                'metodo': request.get('method', ''),
                'url': request.get('url', ''),
                'status_code': response.get('status', ''),
                'status_text': response.get('statusText', ''),
                'tipo_contenido': mime_type,
                'tamaño_respuesta': response.get('content', {}).get('size', 0),
                'tiempo_ms': entry.get('time', 0),
                'ip_servidor': entry.get('serverIPAddress', ''),
                'headers_count': len(request.get('headers', [])),
                'query_params': len(request.get('queryString', []))
            }

            peticiones.append(peticion)

        return peticiones, peticiones_descartadas

    except Exception as e:
        print(f"  ✗ Error procesando '{archivo_har}': {e}")
        return [], 0


def procesar_carpeta_har(carpeta, archivo_csv='peticiones_http_consolidado.csv'):
    """
    Lee todos los archivos HAR de una carpeta y los consolida en un CSV.

    Args:
        carpeta: Ruta a la carpeta con archivos HAR
        archivo_csv: Nombre del archivo CSV de salida
    """

    # Buscar todos los archivos .har en la carpeta
    carpeta_path = Path(carpeta)
    archivos_har = list(carpeta_path.glob('*.har'))

    if not archivos_har:
        print(f"⚠ No se encontraron archivos .har en la carpeta '{carpeta}'")
        return

    print(f"📂 Se encontraron {len(archivos_har)} archivos HAR")
    print(f"{'=' * 60}")

    todas_peticiones = []
    total_descartadas = 0
    archivos_procesados = 0

    # Procesar cada archivo HAR
    for archivo in archivos_har:
        print(f"\n📄 Procesando: {archivo.name}")
        peticiones, descartadas = procesar_archivo_har(archivo)

        if peticiones:
            todas_peticiones.extend(peticiones)
            total_descartadas += descartadas
            archivos_procesados += 1
            print(f"  ✓ {len(peticiones)} peticiones extraídas, {descartadas} descartadas")

    # Escribir al CSV consolidado
    if todas_peticiones:
        campos = todas_peticiones[0].keys()

        with open(archivo_csv, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=campos)
            writer.writeheader()
            writer.writerows(todas_peticiones)

        print(f"\n{'=' * 60}")
        print(f"✓ Exportación completada: '{archivo_csv}'")
        print(f"\n📊 Resumen General:")
        print(f"  - Archivos HAR procesados: {archivos_procesados}/{len(archivos_har)}")
        print(f"  - Peticiones exportadas: {len(todas_peticiones)}")
        print(f"  - Peticiones descartadas (imágenes/CSS/fuentes): {total_descartadas}")

        # Estadísticas por método
        metodos = {}
        for p in todas_peticiones:
            metodo = p['metodo']
            metodos[metodo] = metodos.get(metodo, 0) + 1

        print(f"\n  - Distribución por método HTTP:")
        for metodo, count in sorted(metodos.items(), key=lambda x: x[1], reverse=True):
            print(f"    • {metodo}: {count}")

        # Estadísticas por archivo origen
        archivos_origen = {}
        for p in todas_peticiones:
            archivo = p['archivo_origen']
            archivos_origen[archivo] = archivos_origen.get(archivo, 0) + 1

        print(f"\n  - Peticiones por archivo:")
        for archivo, count in sorted(archivos_origen.items()):
            print(f"    • {archivo}: {count}")
    else:
        print("\n⚠ No se encontraron peticiones válidas en los archivos HAR")


# Ejemplo de uso
if __name__ == "__main__":
    carpeta = "C:\\gitkraken\\ARKHO\\enap\\ENAP\\"
    archivo_csv = 'peticiones_http_consolidado.csv'

    if not os.path.exists(carpeta):
        print(f"✗ Error: La carpeta '{carpeta}' no existe")
    elif not os.path.isdir(carpeta):
        print(f"✗ Error: '{carpeta}' no es una carpeta")
    else:
        procesar_carpeta_har(carpeta, archivo_csv)
