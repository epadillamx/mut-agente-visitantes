"""
Script de Validación de Datos Vectoriales
Verifica la calidad y consistencia de los CSVs generados

USO:
    python validar_datos_vectoriales.py
"""

import pandas as pd
from pathlib import Path
import sys


VECTORIAL_DIR = Path("dataset/vectorial")
REQUIRED_FILES = [
    "preguntas_vectorial.csv",
    "eventos_vectorial.csv",
    "stores_vectorial.csv",
    "restaurantes_vectorial.csv"
]


def validar_archivo(filepath, nombre, separator=','):
    """Valida un archivo CSV vectorial"""
    
    print(f"\n{'='*80}")
    print(f"📄 Validando: {nombre}")
    print(f"{'='*80}")
    
    errores = []
    warnings = []
    
    # Verificar existencia
    if not filepath.exists():
        print(f"❌ Archivo no encontrado: {filepath}")
        return False, errores
    
    try:
        # Leer archivo
        df = pd.read_csv(filepath, sep=separator)
        
        print(f"✅ Archivo leído correctamente")
        print(f"   Registros: {len(df)}")
        print(f"   Columnas: {list(df.columns)}")
        
        # Validar columna texto_embedding
        if 'texto_embedding' not in df.columns:
            errores.append("Falta columna 'texto_embedding'")
            print(f"❌ Falta columna 'texto_embedding'")
        else:
            # Validar contenido
            vacios = df['texto_embedding'].isna().sum()
            if vacios > 0:
                errores.append(f"{vacios} registros con texto_embedding vacío")
                print(f"❌ {vacios} registros con texto_embedding vacío")
            
            # Estadísticas de longitud
            longitudes = df['texto_embedding'].str.len()
            print(f"\n📊 Estadísticas de texto_embedding:")
            print(f"   Min: {longitudes.min():.0f} caracteres")
            print(f"   Max: {longitudes.max():.0f} caracteres")
            print(f"   Promedio: {longitudes.mean():.0f} caracteres")
            print(f"   Mediana: {longitudes.median():.0f} caracteres")
            
            # Alertas
            if longitudes.min() < 20:
                warnings.append(f"Hay textos muy cortos (min: {longitudes.min():.0f})")
            
            if longitudes.max() > 2000:
                warnings.append(f"Hay textos muy largos (max: {longitudes.max():.0f})")
            
            # Mostrar ejemplos
            print(f"\n📝 Ejemplo de texto_embedding:")
            ejemplo = df['texto_embedding'].iloc[0][:200]
            print(f"   {ejemplo}...")
        
        # Validar otras columnas esperadas
        columnas_esperadas = ['document_type', 'search_category']
        for col in columnas_esperadas:
            if col not in df.columns:
                warnings.append(f"Falta columna recomendada: '{col}'")
                print(f"⚠️  Falta columna recomendada: '{col}'")
            else:
                valores_unicos = df[col].nunique()
                print(f"   {col}: {valores_unicos} valores únicos")
        
        # Validar duplicados
        if 'pregunta' in df.columns:
            duplicados = df['pregunta'].duplicated().sum()
            if duplicados > 0:
                warnings.append(f"{duplicados} preguntas duplicadas")
                print(f"⚠️  {duplicados} preguntas duplicadas")
        
        if 'titulo' in df.columns:
            duplicados = df['titulo'].duplicated().sum()
            if duplicados > 0:
                warnings.append(f"{duplicados} títulos duplicados")
                print(f"⚠️  {duplicados} títulos duplicados")
        
        # Resumen
        print(f"\n{'='*40}")
        if len(errores) == 0:
            print(f"✅ VALIDACIÓN EXITOSA")
        else:
            print(f"❌ {len(errores)} ERRORES ENCONTRADOS")
        
        if len(warnings) > 0:
            print(f"⚠️  {len(warnings)} ADVERTENCIAS")
        print(f"{'='*40}")
        
        return len(errores) == 0, errores
    
    except Exception as e:
        print(f"❌ Error leyendo archivo: {e}")
        return False, [str(e)]


def validar_todos():
    """Valida todos los archivos vectoriales"""
    
    print("\n" + "="*80)
    print("🔍 VALIDACIÓN DE DATOS VECTORIALES")
    print("="*80)
    print(f"📁 Directorio: {VECTORIAL_DIR.absolute()}")
    print("="*80)
    
    resultados = {}
    
    # Validar cada archivo
    validaciones = [
        ('preguntas_vectorial.csv', ';'),
        ('eventos_vectorial.csv', ','),
        ('stores_vectorial.csv', ','),
        ('restaurantes_vectorial.csv', ',')
    ]
    
    for filename, separator in validaciones:
        filepath = VECTORIAL_DIR / filename
        exito, errores = validar_archivo(filepath, filename, separator)
        resultados[filename] = {'exito': exito, 'errores': errores}
    
    # Resumen final
    print("\n" + "="*80)
    print("📊 RESUMEN DE VALIDACIÓN")
    print("="*80)
    
    total_archivos = len(resultados)
    archivos_exitosos = sum(1 for r in resultados.values() if r['exito'])
    
    print(f"\n📁 Archivos validados: {total_archivos}")
    print(f"✅ Exitosos: {archivos_exitosos}")
    print(f"❌ Con errores: {total_archivos - archivos_exitosos}")
    
    print(f"\n📋 Detalle:")
    for filename, resultado in resultados.items():
        estado = "✅" if resultado['exito'] else "❌"
        print(f"   {estado} {filename}")
        if resultado['errores']:
            for error in resultado['errores']:
                print(f"      - {error}")
    
    print("\n" + "="*80)
    
    if archivos_exitosos == total_archivos:
        print("🎉 TODOS LOS ARCHIVOS VALIDADOS CORRECTAMENTE")
        print("✅ Los datos están listos para subir a S3")
        print("="*80 + "\n")
        return True
    else:
        print("⚠️  HAY ERRORES QUE CORREGIR")
        print("❌ Por favor, revisa los errores antes de continuar")
        print("="*80 + "\n")
        return False


def estadisticas_globales():
    """Muestra estadísticas globales de todos los archivos"""
    
    print("\n" + "="*80)
    print("📈 ESTADÍSTICAS GLOBALES")
    print("="*80)
    
    total_docs = 0
    total_chars = 0
    
    archivos = [
        ('preguntas_vectorial.csv', ';'),
        ('eventos_vectorial.csv', ','),
        ('stores_vectorial.csv', ','),
        ('restaurantes_vectorial.csv', ',')
    ]
    
    for filename, separator in archivos:
        filepath = VECTORIAL_DIR / filename
        if filepath.exists():
            try:
                df = pd.read_csv(filepath, sep=separator)
                if 'texto_embedding' in df.columns:
                    docs = len(df)
                    chars = df['texto_embedding'].str.len().sum()
                    total_docs += docs
                    total_chars += chars
                    
                    tipo = filename.replace('_vectorial.csv', '')
                    print(f"   {tipo:15s}: {docs:4d} documentos, {chars:8d} caracteres")
            except:
                pass
    
    print(f"\n   {'TOTAL':15s}: {total_docs:4d} documentos, {total_chars:8d} caracteres")
    
    if total_docs > 0:
        print(f"\n   Promedio: {total_chars/total_docs:.0f} caracteres por documento")
    
    print("="*80 + "\n")


if __name__ == "__main__":
    # Validar todos los archivos
    exito = validar_todos()
    
    # Mostrar estadísticas si todo OK
    if exito:
        estadisticas_globales()
        sys.exit(0)
    else:
        sys.exit(1)
