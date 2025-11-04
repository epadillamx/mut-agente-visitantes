import requests
import pandas as pd

# Lista para acumular todas las tiendas
todas_tiendas = []

for i in range(1, 101):
    url = f"https://mut.cl/wp-json/wp/v2/stores?per_page=100&page={i}"
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

        print(f"Procesando página {i} con {len(data)} tiendas...")

        for item in data:
            info_t = item.get('acf', {}).get('informacion_tienda', [{}])

            # Verificar que info_t sea una lista y tenga elementos
            if not info_t or not isinstance(info_t, list):
                info_t = [{}]

            info = info_t[0].get('info', {}) if info_t[0] else {}

            # Obtener la lista de redes sociales (puede ser lista de dicts o strings)
            rss_list = info_t[0].get('rrss', []) if info_t[0] else []

            # Construir un valor único con todas las URLs encontradas en rss_list
            rss_urls = []
            if rss_list and isinstance(rss_list, list):
                for r in rss_list:
                    if isinstance(r, dict):
                        # intentar varias claves comunes
                        url = r.get('url') or r.get('link') or r.get('value') or ''
                        if url:
                            rss_urls.append(str(url))
                    elif isinstance(r, str):
                        rss_urls.append(r)

            # 'rss' será una cadena con las URLs separadas por '; ' (vacía si no hay nada)
            rss = '; '.join(rss_urls) if rss_urls else ''

            # Manejar page_link que puede ser dict o string o None
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
                'tipo':"Tienda"
            })

    except requests.exceptions.RequestException as e:
        print(f"Error en la página {i}: {e}")
        break
    except Exception as e:
        print(f"Error procesando página {i}: {e}")
        continue

# Crear DataFrame con TODAS las tiendas y guardar UN SOLO archivo
if todas_tiendas:
    df = pd.DataFrame(todas_tiendas)
    df.to_csv(r"C:\gitkraken\SISGEST\AGENTE-AWS\stores.csv", index=False, encoding='utf-8-sig')

    print(f"\n{'=' * 60}")
    print(f"✓ TOTAL: {len(df)} tiendas guardadas en stores.csv")
    print(f"{'=' * 60}")
    print(f"\nPrimeras 5 tiendas:")
else:
    print("No se encontraron tiendas")