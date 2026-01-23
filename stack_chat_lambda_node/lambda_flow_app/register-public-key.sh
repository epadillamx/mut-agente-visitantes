#!/bin/bash

# Script para registrar la clave pública en WhatsApp Business Platform
# Asegúrate de configurar las variables de entorno antes de ejecutar

# Cargar variables de entorno si existe un archivo .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Validar que las variables necesarias estén configuradas
if [ -z "$PHONE_NUMBER_ID" ]; then
    echo "Error: PHONE_NUMBER_ID no está configurado"
    echo "Por favor configura la variable de entorno PHONE_NUMBER_ID"
    exit 1
fi

if [ -z "$TOKEN_WHATS" ]; then
    echo "Error: TOKEN_WHATS no está configurado"
    echo "Por favor configura la variable de entorno TOKEN_WHATS"
    exit 1
fi

# Leer la clave pública desde el archivo .env_key
PUBLIC_KEY=$(sed -n '/^-----BEGIN PUBLIC KEY-----$/,/^-----END PUBLIC KEY-----$/p' .env_key)

if [ -z "$PUBLIC_KEY" ]; then
    echo "Error: No se pudo leer la clave pública desde .env_key"
    exit 1
fi

echo "Registrando clave pública en WhatsApp Business Platform..."
echo "Phone Number ID: $PHONE_NUMBER_ID"
echo ""

# Realizar la petición a la API de WhatsApp
curl -X POST \
  "https://graph.facebook.com/v24.0/$PHONE_NUMBER_ID/whatsapp_business_encryption" \
  -H "Authorization: Bearer $TOKEN_WHATS" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "business_public_key=$PUBLIC_KEY"

echo ""
echo "Proceso completado"
