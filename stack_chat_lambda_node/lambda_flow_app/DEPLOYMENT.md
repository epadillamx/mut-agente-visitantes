# Guía de Despliegue

## Opciones de Despliegue

1. [Local / Desarrollo](#1-local--desarrollo)
2. [AWS EC2](#2-aws-ec2)
3. [AWS ECS (Fargate)](#3-aws-ecs-fargate)
4. [AWS Lambda + API Gateway](#4-aws-lambda--api-gateway)

---

## 1. Local / Desarrollo

### Requisitos
- Node.js 18+
- Docker (opcional)

### Pasos

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd whatsapp-flow

# 2. Instalar dependencias
npm install

# 3. Configurar .env
cp .env.example .env
# Editar .env con tus credenciales

# 4. Crear tabla DynamoDB
npm run db:create

# 5. Iniciar servidor
npm start
```

### Con Docker

```bash
# Construir y ejecutar
docker-compose up --build

# En background
docker-compose up -d
```

---

## 2. AWS EC2

### Paso 1: Crear instancia EC2

```bash
# Configuración recomendada
AMI: Amazon Linux 2023
Instance Type: t3.micro (free tier eligible)
Storage: 8 GB gp3
Security Group:
  - SSH (22) desde tu IP
  - HTTP (80) desde 0.0.0.0/0
  - HTTPS (443) desde 0.0.0.0/0
  - Custom TCP (3000) desde 0.0.0.0/0
```

### Paso 2: Conectar y configurar

```bash
# Conectar vía SSH
ssh -i your-key.pem ec2-user@your-ec2-ip

# Instalar Docker
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reiniciar sesión
exit
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### Paso 3: Desplegar aplicación

```bash
# Clonar repositorio
git clone <repo-url>
cd whatsapp-flow

# Crear .env
cat > .env << EOF
PORT=3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
DYNAMODB_TABLE_INCIDENCIAS=incidencias
NODE_ENV=production
EOF

# Copiar clave privada
cp private_key.pem /path/to/project/

# Construir y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Paso 4: Configurar dominio (opcional)

```bash
# Instalar nginx
sudo yum install -y nginx

# Configurar reverse proxy
sudo cat > /etc/nginx/conf.d/whatsapp-flow.conf << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Iniciar nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Configurar SSL con Let's Encrypt
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Paso 5: Auto-restart con systemd

```bash
# Crear servicio systemd
sudo cat > /etc/systemd/system/whatsapp-flow.service << EOF
[Unit]
Description=WhatsApp Flow Incidencias
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/whatsapp-flow
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

# Habilitar servicio
sudo systemctl enable whatsapp-flow
sudo systemctl start whatsapp-flow
```

---

## 3. AWS ECS (Fargate)

### Paso 1: Crear repositorio ECR

```bash
# Crear repositorio
aws ecr create-repository --repository-name whatsapp-flow-incidencias

# Obtener URI del repositorio
aws ecr describe-repositories --repository-names whatsapp-flow-incidencias
```

### Paso 2: Construir y push imagen

```bash
# Autenticar Docker con ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Construir imagen
docker build -t whatsapp-flow-incidencias .

# Tag imagen
docker tag whatsapp-flow-incidencias:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/whatsapp-flow-incidencias:latest

# Push imagen
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/whatsapp-flow-incidencias:latest
```

### Paso 3: Crear Task Definition

```json
{
  "family": "whatsapp-flow-incidencias",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "whatsapp-flow",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/whatsapp-flow-incidencias:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "PORT", "value": "3000"},
        {"name": "AWS_REGION", "value": "us-east-1"},
        {"name": "DYNAMODB_TABLE_INCIDENCIAS", "value": "incidencias"},
        {"name": "NODE_ENV", "value": "production"}
      ],
      "secrets": [
        {"name": "AWS_ACCESS_KEY_ID", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "AWS_SECRET_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:..."}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/whatsapp-flow",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Paso 4: Crear Cluster y Service

```bash
# Crear cluster
aws ecs create-cluster --cluster-name whatsapp-flow-cluster

# Crear service
aws ecs create-service \
  --cluster whatsapp-flow-cluster \
  --service-name whatsapp-flow-service \
  --task-definition whatsapp-flow-incidencias \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

### Paso 5: Configurar Application Load Balancer

```bash
# Crear ALB
aws elbv2 create-load-balancer \
  --name whatsapp-flow-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx

# Crear Target Group
aws elbv2 create-target-group \
  --name whatsapp-flow-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxx \
  --target-type ip

# Crear Listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...
```

---

## 4. AWS Lambda + API Gateway

### Paso 1: Adaptar código para Lambda

Crear `lambda.js`:

```javascript
const serverless = require('serverless-http');
const app = require('./src/index');

module.exports.handler = serverless(app);
```

Actualizar `package.json`:

```json
{
  "dependencies": {
    "serverless-http": "^3.2.0"
  }
}
```

### Paso 2: Configurar serverless.yml

```yaml
service: whatsapp-flow-incidencias

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    PORT: 3000
    AWS_REGION: ${self:provider.region}
    DYNAMODB_TABLE_INCIDENCIAS: incidencias-${self:provider.stage}
    NODE_ENV: production
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:PutItem
        - dynamodb:GetItem
        - dynamodb:Query
        - dynamodb:UpdateItem
      Resource:
        - arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_INCIDENCIAS}
        - arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_INCIDENCIAS}/index/*

functions:
  api:
    handler: lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true

resources:
  Resources:
    IncidenciasTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:provider.environment.DYNAMODB_TABLE_INCIDENCIAS}
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
          - AttributeName: local_id
            AttributeType: S
          - AttributeName: fecha_creacion
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        GlobalSecondaryIndexes:
          - IndexName: local_id-fecha_creacion-index
            KeySchema:
              - AttributeName: local_id
                KeyType: HASH
              - AttributeName: fecha_creacion
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
            ProvisionedThroughput:
              ReadCapacityUnits: 5
              WriteCapacityUnits: 5
        ProvisionedThroughput:
          ReadCapacityUnits: 5
          WriteCapacityUnits: 5
```

### Paso 3: Desplegar

```bash
# Instalar Serverless Framework
npm install -g serverless

# Instalar dependencias
npm install

# Desplegar
serverless deploy

# Desplegar en producción
serverless deploy --stage prod
```

---

## Configuración de Secrets en AWS

### Opción 1: AWS Secrets Manager

```bash
# Crear secret
aws secretsmanager create-secret \
  --name whatsapp-flow/credentials \
  --secret-string '{
    "AWS_ACCESS_KEY_ID": "your_key",
    "AWS_SECRET_ACCESS_KEY": "your_secret"
  }'

# Obtener secret
aws secretsmanager get-secret-value \
  --secret-id whatsapp-flow/credentials
```

### Opción 2: AWS Systems Manager Parameter Store

```bash
# Crear parámetros
aws ssm put-parameter \
  --name /whatsapp-flow/aws-access-key \
  --value "your_key" \
  --type SecureString

aws ssm put-parameter \
  --name /whatsapp-flow/aws-secret-key \
  --value "your_secret" \
  --type SecureString

# Obtener parámetro
aws ssm get-parameter \
  --name /whatsapp-flow/aws-access-key \
  --with-decryption
```

---

## Monitoreo y Logs

### CloudWatch Logs

```bash
# Ver logs en tiempo real
aws logs tail /ecs/whatsapp-flow --follow

# Buscar errores
aws logs filter-log-events \
  --log-group-name /ecs/whatsapp-flow \
  --filter-pattern "ERROR"
```

### CloudWatch Alarms

```bash
# Crear alarma para errores
aws cloudwatch put-metric-alarm \
  --alarm-name whatsapp-flow-errors \
  --alarm-description "Alert on errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

---

## Backup y Recuperación

### Backup DynamoDB

```bash
# Habilitar Point-in-Time Recovery
aws dynamodb update-continuous-backups \
  --table-name incidencias \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Crear backup on-demand
aws dynamodb create-backup \
  --table-name incidencias \
  --backup-name incidencias-backup-$(date +%Y%m%d)
```

### Restaurar desde backup

```bash
# Listar backups
aws dynamodb list-backups --table-name incidencias

# Restaurar
aws dynamodb restore-table-from-backup \
  --target-table-name incidencias-restored \
  --backup-arn arn:aws:dynamodb:...
```

---

## Checklist Pre-Producción

- [ ] Variables de entorno configuradas
- [ ] Tabla DynamoDB creada
- [ ] Secrets almacenados en Secrets Manager
- [ ] IAM roles con mínimos privilegios
- [ ] Security groups configurados
- [ ] SSL/TLS configurado
- [ ] Health checks funcionando
- [ ] Logs configurados en CloudWatch
- [ ] Alarmas configuradas
- [ ] Backup habilitado en DynamoDB
- [ ] Rate limiting implementado (opcional)
- [ ] Dominio personalizado configurado
- [ ] Webhook URL configurada en WhatsApp Business

---

## Troubleshooting

### Problema: Container no inicia

```bash
# Ver logs de Docker
docker logs <container-id>

# Ver logs de ECS
aws ecs describe-tasks --cluster <cluster> --tasks <task-arn>
```

### Problema: No se puede conectar a DynamoDB

```bash
# Verificar credenciales
aws sts get-caller-identity

# Verificar permisos
aws iam get-user-policy --user-name <user> --policy-name <policy>

# Test conexión
aws dynamodb describe-table --table-name incidencias
```

### Problema: Error de cifrado WhatsApp

- Verificar que el archivo `private_key.pem` exista en la raíz del proyecto
- Verificar que WhatsApp tenga la clave pública correcta
- Revisar logs para detalles del error de descifrado

---

## Costos Estimados

| Opción | Costo Mensual (bajo uso) |
|--------|--------------------------|
| EC2 t3.micro | ~$7.50 |
| ECS Fargate | ~$15.00 |
| Lambda | ~$0.20 - $5.00 |
| DynamoDB | ~$2.50 |

**Nota:** Usar Lambda es más económico para bajo volumen (<10k requests/mes)
