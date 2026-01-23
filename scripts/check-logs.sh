#!/bin/bash
# Script para revisar logs de las Lambdas de mut-agente-visitantes

PROFILE="mut-prod"
REGION="us-east-1"

# Nombres de las lambdas
FLOW_LAMBDA="ChatLambdaNodeStack-whatsappflowlambdafn206B5CAF-BimFJ9YCoWNo"
CHAT_LAMBDA="ChatLambdaNodeStack-chatlambdafn506D116E-3OHOsXkWPk2I"

echo "========================================"
echo "📋 Logs de WhatsApp Flow Lambda"
echo "========================================"
aws logs filter-log-events \
    --log-group-name "/aws/lambda/$FLOW_LAMBDA" \
    --start-time $(($(date +%s) * 1000 - 300000)) \
    --profile $PROFILE \
    --region $REGION \
    --query 'events[*].message' \
    --output text 2>&1 | tail -50

echo ""
echo "========================================"
echo "📋 Logs de Chat Lambda"  
echo "========================================"
aws logs filter-log-events \
    --log-group-name "/aws/lambda/$CHAT_LAMBDA" \
    --start-time $(($(date +%s) * 1000 - 300000)) \
    --profile $PROFILE \
    --region $REGION \
    --query 'events[*].message' \
    --output text 2>&1 | tail -50
