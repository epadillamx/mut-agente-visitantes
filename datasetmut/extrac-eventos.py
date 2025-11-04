import requests
import pandas as pd

# Lista para acumular todos los eventos
todos_eventos = []

for i in range(1, 101):
    url = f"https://mut.cl/wp-json/wp/v2/event?per_page=100&page={i}"
    payload = {}
    headers = {}

    try:
        response = requests.request("GET", url, headers=headers, data=payload)
        response.raise_for_status()  # Verifica errores HTTP
        data = response.json()

        # Si no hay datos, terminar el loop
        if len(data) == 0:
            print(f"No hay más datos en la página {i}")
            break

        print(f"Procesando página {i} con {len(data)} eventos...")

        for item in data:
            # Obtener información ACF
            acf = item.get('acf', {})
            info_destacada = acf.get('informacion_destacada', {})
            info_tienda = acf.get('informacion_tienda', [])

            # Extraer horas (puede ser una lista)
            hours_list = info_destacada.get('hours', [])
            hours = ', '.join([h.get('hour', '') for h in hours_list if h.get('hour')]) if hours_list else ''

            # Extraer información del primer card si existe
            date_text = ''
            hour_text = ''
            place_text = ''
            description = ''
            button_url = ''
            button_title = ''

            if info_tienda and len(info_tienda) > 0:
                cards = info_tienda[0].get('cards', [])
                if cards and len(cards) > 0:
                    card = cards[0]
                    data_card = card.get('data', {})

                    date_text = data_card.get('date', '')
                    hour_text = data_card.get('hour', '')
                    place_text = data_card.get('place', '')
                    description = data_card.get('description', '')

                    # Extraer botón
                    button = card.get('button', {})
                    if button and button.get('is_active'):
                        anchor = button.get('anchor', {})
                        button_url = anchor.get('url', '')
                        button_title = anchor.get('title', '')

            # Limpiar contenido
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

    except requests.exceptions.RequestException as e:
        print(f"Error en la página {i}: {e}")
        break
    except Exception as e:
        print(f"Error procesando página {i}: {e}")
        continue

# Crear DataFrame con TODOS los eventos y guardar
if todos_eventos:
    df = pd.DataFrame(todos_eventos)
    df.to_csv(r"C:\gitkraken\SISGEST\AGENTE-AWS\eventos.csv", index=False, encoding='utf-8-sig')

    print(f"\n{'=' * 60}")
    print(f"✓ TOTAL: {len(df)} eventos guardados en eventos.csv")
    print(f"{'=' * 60}")
    print(f"\nPrimeras 5 eventos:")
    print(df.head())
    print(f"\nColumnas extraídas:")
    print(list(df.columns))
else:
    print("No se encontraron eventos")