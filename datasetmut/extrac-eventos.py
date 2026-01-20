"""
Extractor de eventos desde la API de MUT
Genera CSV con los mismos campos que usa eventos.service.js
"""
import requests
import pandas as pd
import re
from datetime import datetime

def limpiar_texto(texto):
    """Limpia texto HTML y caracteres especiales"""
    if not texto:
        return ''
    texto = str(texto)
    # Remover tags HTML
    texto = re.sub(r'<[^>]*>', '', texto)
    # Reemplazar entidades HTML
    texto = texto.replace('&#8220;', '"')
    texto = texto.replace('&#8221;', '"')
    texto = texto.replace('&#8230;', '...')
    texto = texto.replace('&amp;', '&')
    texto = texto.replace('&nbsp;', ' ')
    texto = texto.replace('\xa0', ' ')
    return texto.strip()

def formatear_fecha_legible(date_str):
    """Convierte YYYYMMDD a texto legible"""
    if not date_str or len(str(date_str)) != 8:
        return ''
    try:
        date_str = str(date_str)
        year = int(date_str[0:4])
        month = int(date_str[4:6])
        day = int(date_str[6:8])
        
        meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
        
        return f"{day} de {meses[month-1]} de {year}"
    except:
        return ''

# Lista para acumular todos los eventos
todos_eventos = []
page = 1
max_pages = 10

print("=" * 60)
print("🎭 EXTRACTOR DE EVENTOS MUT")
print("=" * 60)

while page <= max_pages:
    url = f"https://mut.cl/wp-json/wp/v2/event?per_page=100&page={page}"
    
    print(f"\n📡 Consultando página {page}: {url}")

    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 400:
            print(f"   ⚠️ API respondió 400 en página {page} - fin de datos")
            break
            
        response.raise_for_status()
        data = response.json()

        if not data or len(data) == 0:
            print(f"   ℹ️ No hay más datos en página {page}")
            break

        print(f"   ✅ Procesando {len(data)} eventos...")

        for item in data:
            # Obtener información ACF
            acf = item.get('acf', {}) or {}
            info_destacada = acf.get('informacion_destacada', {}) or {}
            info_tienda = acf.get('informacion_tienda', []) or []

            # ⭐ CAMPO CRÍTICO: event_date (formato YYYYMMDD)
            event_date = info_destacada.get('event_date', None)
            
            # Extraer horas de info_destacada (puede ser una lista)
            hours_list = info_destacada.get('hours', []) or []
            horas = ', '.join([
                limpiar_texto(h.get('hour', '')) 
                for h in hours_list 
                if h.get('hour')
            ])

            # Extraer información del primer card si existe
            fecha_texto = ''
            hora_texto = ''
            lugar = ''
            descripcion = ''

            if info_tienda and len(info_tienda) > 0:
                cards = info_tienda[0].get('cards', []) or []
                if cards and len(cards) > 0:
                    card_data = cards[0].get('data', {}) or {}
                    fecha_texto = card_data.get('date', '')
                    hora_texto = limpiar_texto(card_data.get('hour', ''))
                    lugar = card_data.get('place', '')
                    descripcion = card_data.get('description', '')

            # Si no hay hora del card, usar la de info_destacada
            if not hora_texto and horas:
                hora_texto = horas

            # Calcular fecha legible desde event_date
            fecha_exacta = formatear_fecha_legible(event_date) if event_date else ''
            
            # Si no hay fecha_texto, usar fecha_exacta
            if not fecha_texto and fecha_exacta:
                fecha_texto = fecha_exacta

            # Crear registro del evento (mismos campos que eventos.service.js)
            evento = {
                'titulo': limpiar_texto(item.get('title', {}).get('rendered', '')),
                'event_date': event_date,  # YYYYMMDD - campo crítico para filtrar
                'fecha': fecha_texto,       # Texto del card (puede tener rangos)
                'fecha_exacta': fecha_exacta,  # Fecha legible desde event_date
                'hora': hora_texto,
                'lugar': lugar,
                'descripcion': limpiar_texto(descripcion)[:200] if descripcion else '',
                'organizador': info_destacada.get('organizer', ''),
                'link': item.get('link', '')
            }

            # Solo agregar si tiene título
            if evento['titulo']:
                todos_eventos.append(evento)

        page += 1

    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error de conexión en página {page}: {e}")
        break
    except Exception as e:
        print(f"   ❌ Error procesando página {page}: {e}")
        continue

# Crear DataFrame y guardar
print("\n" + "=" * 60)

if todos_eventos:
    df = pd.DataFrame(todos_eventos)
    
    # Ordenar por event_date (eventos con fecha primero, luego por fecha)
    df['sort_key'] = df['event_date'].fillna('99999999')
    df = df.sort_values('sort_key').drop('sort_key', axis=1)
    
    # Guardar CSV
    output_path = r"C:\Users\gusta\Documents\apylink\repositorios\mut\mut-agente-visitantes\datasetmut\eventos.csv"
    df.to_csv(output_path, index=False, encoding='utf-8-sig')

    print(f"✅ TOTAL: {len(df)} eventos guardados")
    print(f"📁 Archivo: eventos.csv")
    print("=" * 60)
    
    # Resumen de campos
    print(f"\n📊 RESUMEN:")
    print(f"   • Con event_date: {df['event_date'].notna().sum()}")
    print(f"   • Sin event_date: {df['event_date'].isna().sum()}")
    print(f"   • Con fecha texto: {(df['fecha'] != '').sum()}")
    print(f"   • Con hora: {(df['hora'] != '').sum()}")
    print(f"   • Con lugar: {(df['lugar'] != '').sum()}")
    print(f"   • Con link: {(df['link'] != '').sum()}")
    
    print(f"\n📋 COLUMNAS:")
    print(f"   {list(df.columns)}")
    
    print(f"\n🔍 PRIMEROS 5 EVENTOS:")
    print(df[['titulo', 'event_date', 'fecha', 'hora']].head().to_string())
    
else:
    print("❌ No se encontraron eventos")