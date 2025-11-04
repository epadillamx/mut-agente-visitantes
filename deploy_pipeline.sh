#!/bin/bash

# Script de despliegue rápido para los nuevos stacks del pipeline
# Uso: ./deploy_pipeline.sh

set -e

echo "=================================="
echo "🚀 Pipeline Automation Deployment"
echo "=================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir con color
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar prerequisites
echo "📋 Verificando prerequisites..."

if ! command -v aws &> /dev/null; then
    print_error "AWS CLI no está instalado"
    exit 1
fi
print_success "AWS CLI instalado"

if ! command -v cdk &> /dev/null; then
    print_error "AWS CDK no está instalado"
    exit 1
fi
print_success "AWS CDK instalado"

if ! command -v python &> /dev/null; then
    print_error "Python no está instalado"
    exit 1
fi
print_success "Python instalado"

# Verificar credenciales AWS
echo ""
echo "🔐 Verificando credenciales AWS..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "Credenciales AWS no configuradas"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_success "Credenciales configuradas (Account: $ACCOUNT_ID)"

# Sintetizar stacks
echo ""
echo "🔨 Sintetizando CloudFormation templates..."
if ! cdk synth &> /dev/null; then
    print_error "Error al sintetizar stacks"
    exit 1
fi
print_success "Templates sintetizados"

# Mostrar diferencias
echo ""
echo "📊 Verificando diferencias..."
echo ""
cdk diff DataExtractionLambdaStack || true
cdk diff VectorialSyncLambdaStack || true
cdk diff DataPipelineOrchestratorStack || true

# Confirmar deployment
echo ""
read -p "¿Continuar con el deployment? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelado"
    exit 0
fi

# Deploy stacks
echo ""
echo "🚀 Desplegando stacks..."
echo ""

echo "1/3 - Desplegando DataExtractionLambdaStack..."
if cdk deploy DataExtractionLambdaStack --require-approval never; then
    print_success "DataExtractionLambdaStack desplegado"
else
    print_error "Error al desplegar DataExtractionLambdaStack"
    exit 1
fi

echo ""
echo "2/3 - Desplegando VectorialSyncLambdaStack..."
if cdk deploy VectorialSyncLambdaStack --require-approval never; then
    print_success "VectorialSyncLambdaStack desplegado"
else
    print_error "Error al desplegar VectorialSyncLambdaStack"
    exit 1
fi

echo ""
echo "3/3 - Desplegando DataPipelineOrchestratorStack..."
if cdk deploy DataPipelineOrchestratorStack --require-approval never; then
    print_success "DataPipelineOrchestratorStack desplegado"
else
    print_error "Error al desplegar DataPipelineOrchestratorStack"
    exit 1
fi

# Obtener outputs
echo ""
echo "📋 Outputs de los stacks:"
echo ""

echo "=== DataExtractionLambdaStack ==="
aws cloudformation describe-stacks \
    --stack-name DataExtractionLambdaStack \
    --query 'Stacks[0].Outputs' \
    --output table || true

echo ""
echo "=== VectorialSyncLambdaStack ==="
aws cloudformation describe-stacks \
    --stack-name VectorialSyncLambdaStack \
    --query 'Stacks[0].Outputs' \
    --output table || true

echo ""
echo "=== DataPipelineOrchestratorStack ==="
aws cloudformation describe-stacks \
    --stack-name DataPipelineOrchestratorStack \
    --query 'Stacks[0].Outputs' \
    --output table || true

# Información de EventBridge
echo ""
echo "⏰ EventBridge Rule:"
RULE_NAME=$(aws events list-rules --query 'Rules[?starts_with(Name, `DataPipelineOrchestrator`)].Name' --output text)
if [ -n "$RULE_NAME" ]; then
    print_success "Regla creada: $RULE_NAME"
    print_success "Horario: Todos los días a las 12:00 AM (hora Chile)"
else
    print_warning "No se encontró la regla de EventBridge"
fi

# Test opcional
echo ""
read -p "¿Deseas ejecutar un test del pipeline? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🧪 Ejecutando test del pipeline..."
    
    STATE_MACHINE_ARN=$(aws stepfunctions list-state-machines \
        --query 'stateMachines[?starts_with(name, `DataPipeline`)].stateMachineArn' \
        --output text)
    
    if [ -n "$STATE_MACHINE_ARN" ]; then
        EXECUTION_ARN=$(aws stepfunctions start-execution \
            --state-machine-arn "$STATE_MACHINE_ARN" \
            --input '{"test": true}' \
            --query 'executionArn' \
            --output text)
        
        print_success "Ejecución iniciada: $EXECUTION_ARN"
        echo ""
        echo "Monitorear en: https://console.aws.amazon.com/states/home?region=us-east-1#/executions/details/$EXECUTION_ARN"
    else
        print_error "No se encontró la State Machine"
    fi
fi

# Resumen final
echo ""
echo "=================================="
echo "✅ DEPLOYMENT COMPLETADO"
echo "=================================="
echo ""
print_success "3 stacks desplegados exitosamente"
print_success "Pipeline configurado para ejecutar diariamente a las 12 AM"
echo ""
echo "📚 Documentación:"
echo "   - PIPELINE_AUTOMATION.md"
echo "   - DEPLOYMENT_GUIDE.md"
echo ""
echo "🔍 Monitoreo:"
echo "   - Step Functions: https://console.aws.amazon.com/states/"
echo "   - Lambda: https://console.aws.amazon.com/lambda/"
echo "   - CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups"
echo ""
print_success "¡Todo listo!"
