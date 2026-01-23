#!/bin/bash

# Script para validar la clave pública registrada en WhatsApp Business Platform
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

echo "Consultando clave pública registrada en WhatsApp Business Platform..."
echo "WABA ID: $PHONE_NUMBER_ID"
echo ""

# Realizar la petición a la API de WhatsApp
curl -X GET "https://graph.facebook.com/v17.0/$PHONE_NUMBER_ID/whatsapp_business_encryption" \
  -H "Authorization: Bearer $TOKEN_WHATS"

echo ""
echo "Proceso completado"
