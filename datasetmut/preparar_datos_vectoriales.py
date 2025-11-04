"""
Script para preparar datasets optimizados para Base de Datos Vectorial
Genera CSVs listos para carga en S3 y posterior procesamiento ETL

OBJETIVO:
- Leer datos de dataset/optimizar/
- Limpiar y estructurar información
- Crear texto optimizado para embeddings vectoriales
- Generar CSVs de salida en dataset/vectorial/

SALIDA: 4 archivos CSV optimizados para vectorización
"""

import pandas as pd
import re
from pathlib import Path
from datetime import datetime
import unicodedata


# ============================================================================
# CONFIGURACIÓN
# ============================================================================

INPUT_DIR = Path("dataset/optimizar")
OUTPUT_DIR = Path("dataset/vectorial")
OUTPUT_DIR.mkdir(exist_ok=True)

# Configuración de encoding
ENCODING = 'utf-8'


# ============================================================================
# FUNCIONES DE LIMPIEZA
# ============================================================================

def limpiar_texto(texto):
    """Limpia y normaliza texto para embeddings"""
    if pd.isna(texto) or texto == '':
        return ''
    
    texto = str(texto).strip()
    
    # Normalizar caracteres unicode
    texto = unicodedata.normalize('NFKD', texto)
    
    # Remover caracteres especiales problemáticos
    texto = texto.replace('\r', ' ')
    texto = texto.replace('\n', ' ')
    texto = texto.replace('\t', ' ')
    
    # Remover espacios múltiples
    texto = re.sub(r'\s+', ' ', texto)
    
    # Remover HTML tags si existen
    texto = re.sub(r'<[^>]+>', '', texto)
    
    return texto.strip()


def limpiar_columna(df, columna):
    """Limpia una columna específica del dataframe"""
    if columna in df.columns:
        df[columna] = df[columna].apply(limpiar_texto)
        df[columna] = df[columna].replace(['nan', 'None', 'NaN', ''], '')
    return df


# ============================================================================
# PROCESAMIENTO: PREGUNTAS FRECUENTES
# ============================================================================

def procesar_preguntas():
    """
    Procesa archivo de preguntas frecuentes (FAQs)
    
    INPUT: preguntas.csv
    - Preguntas tipo
    - Respuesta
    - Categoria
    
    OUTPUT: preguntas_vectorial.csv
    - pregunta (limpia)
    - respuesta (limpia)
    - texto_embedding (optimizado para vectorización)
    - categoria_nombre (corta)
    - categoria_completa (detallada)
    """
    
    print("\n" + "="*80)
    print("📋 PROCESANDO: PREGUNTAS FRECUENTES")
    print("="*80)
    
    # Leer CSV
    df = pd.read_csv(
        INPUT_DIR / "preguntas.csv",
        sep=';',
        encoding='latin-1'  # El archivo tiene problemas de encoding
    )
    
    print(f"✅ {len(df)} preguntas cargadas")
    print(f"   Columnas originales: {list(df.columns)}")
    
    # Renombrar columnas
    df.columns = ['pregunta', 'respuesta', 'categoria_completa']
    
    # Limpiar textos
    df = limpiar_columna(df, 'pregunta')
    df = limpiar_columna(df, 'respuesta')
    df = limpiar_columna(df, 'categoria_completa')
    
    # Extraer número de categoría
    df['categoria_id'] = df['categoria_completa'].str.extract(r'^(\d+)')[0]
    
    # Crear nombre corto de categoría
    df['categoria_nombre'] = df['categoria_completa'].str.replace(r'^\d+\s+', '', regex=True)
    
    # Crear texto optimizado para embeddings
    def crear_texto_embedding(row):
        """Estructura: Categoría + Pregunta + Respuesta completa"""
        partes = []
        
        if row['categoria_nombre']:
            partes.append(f"CATEGORIA: {row['categoria_nombre']}")
        
        if row['pregunta']:
            partes.append(f"PREGUNTA: {row['pregunta']}")
        
        if row['respuesta']:
            partes.append(f"RESPUESTA: {row['respuesta']}")
        
        return " | ".join(partes)
    
    df['texto_embedding'] = df.apply(crear_texto_embedding, axis=1)
    
    # Seleccionar columnas finales
    df_final = df[[
        'pregunta',
        'respuesta',
        'texto_embedding',
        'categoria_nombre',
        'categoria_completa'
    ]]
    
    # Filtrar registros vacíos
    df_final = df_final[df_final['texto_embedding'].str.len() > 20]
    
    # Guardar
    output_file = OUTPUT_DIR / "preguntas_vectorial.csv"
    df_final.to_csv(output_file, index=False, encoding=ENCODING, sep=';')
    
    print(f"✅ {len(df_final)} preguntas procesadas")
    print(f"   Archivo: {output_file}")
    print(f"   Texto promedio: {df_final['texto_embedding'].str.len().mean():.0f} caracteres")
    print(f"   Categorías únicas: {df_final['categoria_nombre'].nunique()}")
    
    return df_final


# ============================================================================
# PROCESAMIENTO: EVENTOS
# ============================================================================

def procesar_eventos():
    """
    Procesa archivo de eventos
    
    INPUT: eventos.csv
    OUTPUT: eventos_vectorial.csv con texto optimizado
    """
    
    print("\n" + "="*80)
    print("📅 PROCESANDO: EVENTOS")
    print("="*80)
    
    df = pd.read_csv(INPUT_DIR / "eventos.csv", encoding=ENCODING)
    
    print(f"✅ {len(df)} eventos cargados")
    
    # Limpiar columnas
    for col in df.columns:
        df = limpiar_columna(df, col)
    
    # Crear texto optimizado para embeddings
    def crear_texto_embedding(row):
        partes = []
        
        # Tipo de evento
        if row.get('tipo'):
            partes.append(f"TIPO: {row['tipo']}")
        
        # Título principal
        if row.get('titulo'):
            partes.append(f"EVENTO: {row['titulo']}")
        
        # Descripción
        if row.get('descripcion'):
            partes.append(f"DESCRIPCION: {row['descripcion']}")
        
        # Contenido detallado
        if row.get('contenido') and len(str(row['contenido'])) > 50:
            contenido = str(row['contenido'])[:800]  # Limitar tamaño
            partes.append(contenido)
        
        # Información práctica
        info_practica = []
        if row.get('fecha_texto'):
            info_practica.append(f"FECHA: {row['fecha_texto']}")
        if row.get('hora_texto'):
            info_practica.append(f"HORA: {row['hora_texto']}")
        if row.get('lugar'):
            info_practica.append(f"LUGAR: {row['lugar']}")
        if row.get('horas'):
            info_practica.append(f"HORARIO: {row['horas']}")
        
        if info_practica:
            partes.append(" | ".join(info_practica))
        
        # Organizador
        if row.get('organizador'):
            partes.append(f"ORGANIZADOR: {row['organizador']}")
        
        return " | ".join(partes)
    
    df['texto_embedding'] = df.apply(crear_texto_embedding, axis=1)
    df['document_type'] = 'evento'
    df['search_category'] = 'eventos_y_actividades'
    
    # Filtrar vacíos
    df = df[df['texto_embedding'].str.len() > 30]
    
    # Guardar
    output_file = OUTPUT_DIR / "eventos_vectorial.csv"
    df.to_csv(output_file, index=False, encoding=ENCODING)
    
    print(f"✅ {len(df)} eventos procesados")
    print(f"   Archivo: {output_file}")
    print(f"   Texto promedio: {df['texto_embedding'].str.len().mean():.0f} caracteres")
    
    return df


# ============================================================================
# PROCESAMIENTO: TIENDAS
# ============================================================================

def procesar_tiendas():
    """
    Procesa archivo de tiendas
    
    INPUT: stores.csv
    OUTPUT: stores_vectorial.csv con texto optimizado
    """
    
    print("\n" + "="*80)
    print("🏪 PROCESANDO: TIENDAS")
    print("="*80)
    
    df = pd.read_csv(INPUT_DIR / "stores.csv", encoding=ENCODING)
    
    print(f"✅ {len(df)} tiendas cargadas")
    
    # Limpiar columnas
    for col in df.columns:
        df = limpiar_columna(df, col)
    
    # Crear texto optimizado para embeddings
    def crear_texto_embedding(row):
        partes = []
        
        # Tipo y nombre
        if row.get('tipo'):
            partes.append(f"TIPO: {row['tipo']}")
        
        if row.get('titulo'):
            partes.append(f"TIENDA: {row['titulo']}")
        
        # Contenido/descripción
        if row.get('content') and len(str(row['content'])) > 30:
            content = str(row['content'])[:700]
            partes.append(content)
        
        # Ubicación
        ubicacion = []
        if row.get('lugar'):
            ubicacion.append(row['lugar'])
        if row.get('nivel'):
            ubicacion.append(f"Nivel {row['nivel']}")
        if row.get('local'):
            ubicacion.append(f"Local {row['local']}")
        
        if ubicacion:
            partes.append(f"UBICACION: {' - '.join(ubicacion)}")
        
        # Horario
        if row.get('horario'):
            partes.append(f"HORARIO: {row['horario']}")
        
        # Contacto
        contacto = []
        if row.get('telefono') and str(row['telefono']) not in ['nan', '', 'None']:
            contacto.append(f"Tel: {row['telefono']}")
        if row.get('mail'):
            contacto.append(f"Email: {row['mail']}")
        if row.get('web'):
            contacto.append(f"Web: {row['web']}")
        
        if contacto:
            partes.append(f"CONTACTO: {' | '.join(contacto)}")
        
        return " | ".join(partes)
    
    df['texto_embedding'] = df.apply(crear_texto_embedding, axis=1)
    df['document_type'] = 'tienda'
    df['search_category'] = 'comercios_y_tiendas'
    
    # Filtrar vacíos
    df = df[df['texto_embedding'].str.len() > 30]
    
    # Guardar
    output_file = OUTPUT_DIR / "stores_vectorial.csv"
    df.to_csv(output_file, index=False, encoding=ENCODING)
    
    print(f"✅ {len(df)} tiendas procesadas")
    print(f"   Archivo: {output_file}")
    print(f"   Texto promedio: {df['texto_embedding'].str.len().mean():.0f} caracteres")
    
    return df


# ============================================================================
# PROCESAMIENTO: RESTAURANTES
# ============================================================================

def procesar_restaurantes():
    """
    Procesa archivo de restaurantes
    
    INPUT: todas_restaurantes.csv
    OUTPUT: restaurantes_vectorial.csv con texto optimizado
    """
    
    print("\n" + "="*80)
    print("🍽️ PROCESANDO: RESTAURANTES")
    print("="*80)
    
    df = pd.read_csv(INPUT_DIR / "todas_restaurantes.csv", encoding=ENCODING)
    
    print(f"✅ {len(df)} restaurantes cargados")
    
    # Limpiar columnas
    for col in df.columns:
        df = limpiar_columna(df, col)
    
    # Crear texto optimizado para embeddings
    def crear_texto_embedding(row):
        partes = []
        
        # Tipo de cocina y nombre
        if row.get('tipo'):
            partes.append(f"COCINA: {row['tipo']}")
        
        if row.get('titulo'):
            partes.append(f"RESTAURANTE: {row['titulo']}")
        
        # Descripción
        if row.get('content') and len(str(row['content'])) > 30:
            content = str(row['content'])[:700]
            partes.append(content)
        
        # Ubicación
        ubicacion = []
        if row.get('lugar'):
            ubicacion.append(row['lugar'])
        if row.get('nivel'):
            ubicacion.append(f"Nivel {row['nivel']}")
        if row.get('local'):
            ubicacion.append(f"Local {row['local']}")
        
        if ubicacion:
            partes.append(f"UBICACION: {' - '.join(ubicacion)}")
        
        # Horario
        if row.get('horario'):
            partes.append(f"HORARIO: {row['horario']}")
        
        # Contacto
        contacto = []
        telefono = str(row.get('telefono', ''))
        if telefono and telefono not in ['nan', '', 'None', '0']:
            contacto.append(f"Tel: {telefono}")
        if row.get('mail'):
            contacto.append(f"Email: {row['mail']}")
        if row.get('web'):
            contacto.append(f"Web: {row['web']}")
        
        if contacto:
            partes.append(f"CONTACTO: {' | '.join(contacto)}")
        
        return " | ".join(partes)
    
    df['texto_embedding'] = df.apply(crear_texto_embedding, axis=1)
    df['document_type'] = 'restaurante'
    df['search_category'] = 'gastronomia'
    
    # Filtrar vacíos
    df = df[df['texto_embedding'].str.len() > 30]
    
    # Guardar
    output_file = OUTPUT_DIR / "restaurantes_vectorial.csv"
    df.to_csv(output_file, index=False, encoding=ENCODING)
    
    print(f"✅ {len(df)} restaurantes procesados")
    print(f"   Archivo: {output_file}")
    print(f"   Texto promedio: {df['texto_embedding'].str.len().mean():.0f} caracteres")
    
    return df


# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """Ejecuta el procesamiento completo de todos los datasets"""
    
    print("\n" + "="*80)
    print("🚀 PREPARACIÓN DE DATOS PARA BASE VECTORIAL")
    print("="*80)
    print(f"📁 Entrada:  {INPUT_DIR.absolute()}")
    print(f"📁 Salida:   {OUTPUT_DIR.absolute()}")
    print(f"🕐 Inicio:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    resultados = {}
    
    # Procesar cada dataset
    try:
        resultados['preguntas'] = procesar_preguntas()
    except Exception as e:
        print(f"❌ Error procesando preguntas: {e}")
    
    try:
        resultados['eventos'] = procesar_eventos()
    except Exception as e:
        print(f"❌ Error procesando eventos: {e}")
    
    try:
        resultados['tiendas'] = procesar_tiendas()
    except Exception as e:
        print(f"❌ Error procesando tiendas: {e}")
    
    try:
        resultados['restaurantes'] = procesar_restaurantes()
    except Exception as e:
        print(f"❌ Error procesando restaurantes: {e}")
    
    # Resumen final
    print("\n" + "="*80)
    print("✅ PROCESAMIENTO COMPLETADO")
    print("="*80)
    print(f"🕐 Finalizado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n📊 Resumen:")
    
    total_docs = 0
    for tipo, df in resultados.items():
        if df is not None and len(df) > 0:
            print(f"   • {tipo.capitalize()}: {len(df)} documentos")
            total_docs += len(df)
    
    print(f"\n   TOTAL: {total_docs} documentos listos para vectorización")
    print("="*80)
    
    print(f"\n📦 Archivos generados en: {OUTPUT_DIR.absolute()}")
    print("   ✓ preguntas_vectorial.csv")
    print("   ✓ eventos_vectorial.csv")
    print("   ✓ stores_vectorial.csv")
    print("   ✓ restaurantes_vectorial.csv")
    print("\n💡 Próximo paso: Subir estos archivos a S3 bucket")
    print("="*80 + "\n")


if __name__ == "__main__":
    main()
