#!/bin/bash
#
# Script para subir archivos vectoriales a S3
# Uso: bash subir_datos_s3.sh
#

set -e  # Detener en caso de error

# Configuración
S3_BUCKET="raw-virtual-assistant-data-948270077717-us-east-1"
VECTORIAL_DIR="dataset/vectorial"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo "================================================================================"
echo "📦 SUBIDA DE DATOS VECTORIALES A S3"
echo "================================================================================"
echo "🪣  Bucket: ${S3_BUCKET}"
echo "📁 Carpeta local: ${VECTORIAL_DIR}"
echo "🕐 Timestamp: ${TIMESTAMP}"
echo "================================================================================"
echo ""

# Verificar que existen los archivos
echo "🔍 Verificando archivos locales..."
FILES=(
    "preguntas_vectorial.csv"
    "eventos_vectorial.csv"
    "stores_vectorial.csv"
    "restaurantes_vectorial.csv"
)

MISSING=0
for file in "${FILES[@]}"; do
    if [ -f "${VECTORIAL_DIR}/${file}" ]; then
        SIZE=$(stat -c%s "${VECTORIAL_DIR}/${file}" 2>/dev/null || stat -f%z "${VECTORIAL_DIR}/${file}" 2>/dev/null)
        echo "   ✅ ${file} (${SIZE} bytes)"
    else
        echo "   ❌ ${file} NO ENCONTRADO"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    echo ""
    echo "❌ Faltan ${MISSING} archivo(s). Ejecuta primero: python preparar_datos_vectoriales.py"
    exit 1
fi

echo ""
echo "================================================================================"
echo "📤 Subiendo archivos a S3..."
echo "================================================================================"
echo ""

# Subir cada archivo
SUCCESS=0
for file in "${FILES[@]}"; do
    echo "📤 Subiendo ${file}..."
    
    if aws s3 cp "${VECTORIAL_DIR}/${file}" "s3://${S3_BUCKET}/${file}" \
        --metadata "timestamp=${TIMESTAMP},version=3.0,type=vectorial"; then
        echo "   ✅ ${file} subido correctamente"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "   ❌ Error subiendo ${file}"
    fi
    echo ""
done

echo "================================================================================"
echo "📊 RESUMEN"
echo "================================================================================"
echo "✅ Archivos subidos: ${SUCCESS}/${#FILES[@]}"
echo ""

# Verificar en S3
echo "🔍 Verificando archivos en S3..."
echo ""
aws s3 ls "s3://${S3_BUCKET}/" | grep vectorial || echo "⚠️  No se encontraron archivos vectoriales"

echo ""
echo "================================================================================"
if [ $SUCCESS -eq ${#FILES[@]} ]; then
    echo "🎉 ¡TODOS LOS ARCHIVOS SUBIDOS CORRECTAMENTE!"
    echo ""
    echo "📋 Próximos pasos:"
    echo "   1. Verificar archivos en consola AWS S3"
    echo "   2. Invocar Lambda ETL para procesar datos"
    echo "   3. Sincronizar Bedrock Knowledge Base"
else
    echo "⚠️  ALGUNOS ARCHIVOS NO SE SUBIERON CORRECTAMENTE"
    echo "   Por favor, revisa los errores e intenta nuevamente"
fi
echo "================================================================================"
echo ""
