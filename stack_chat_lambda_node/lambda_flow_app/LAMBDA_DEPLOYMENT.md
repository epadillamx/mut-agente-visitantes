# WhatsApp Flow Lambda Deployment Guide

This document explains the Lambda deployment configuration for the WhatsApp Flow incident reporting system.

## Overview

The WhatsApp Flow functionality has been integrated into the CDK stack as a separate Lambda function that handles encrypted WhatsApp Flow requests for incident reporting.

## Architecture

### Components

1. **Lambda Function**: `whatsapp-flow-lambda-fn`
   - Runtime: Node.js 22.x
   - Handler: `lambda-handler.handler`
   - Timeout: 30 seconds
   - Memory: 256 MB

2. **DynamoDB Table**: `IncidentsTable`
   - Partition Key: `id` (String)
   - GSI: `local_id-fecha_creacion-index`
   - Billing Mode: Pay per request
   - Point-in-time recovery: Enabled

3. **API Gateway Endpoint**: `POST /flow`
   - Integrates with WhatsApp Flow Lambda
   - Handles encrypted requests from Meta's WhatsApp Flow

## Environment Variables

The Lambda function uses the following environment variables (automatically configured by CDK):

- `NODE_ENV`: Set to "production"
- `AWS_REGION`: AWS region where resources are deployed
- `DYNAMODB_TABLE_INCIDENCIAS`: Name of the incidents DynamoDB table
- `WHATSAPP_PRIVATE_KEY_PASSPHRASE`: (Optional) Passphrase for WhatsApp private key

## Key Files

### Lambda Handler
- **File**: `lambda-handler.js`
- **Purpose**: AWS Lambda entry point that processes WhatsApp Flow requests
- **Key Features**:
  - Handles encrypted/unencrypted requests
  - Decrypts WhatsApp Flow data
  - Routes to flow controller
  - Encrypts responses

### Flow Controller
- **File**: `src/controllers/flowController.js`
- **Purpose**: Business logic for handling flow actions
- **Actions**:
  - `ping`: Health check
  - `INIT`: Initialize flow with empty search
  - `data_exchange`: Handle searches and navigation
  - `complete`: Save incident to DynamoDB

### Services
- **localService.js**: Searches and retrieves local (store) data from JSON
- **dynamoService.js**: Handles DynamoDB operations (now Lambda-compatible)

### Utilities
- **crypto.js**: Encryption/decryption for WhatsApp Flow requests

## Deployment Steps

### 1. Install Dependencies

```bash
cd stack_chat_lambda_node/whatsapp-flow
npm install
```

### 2. Configure CDK Context (Optional)

Add to `cdk.json` if you need to customize the private key passphrase:

```json
{
  "context": {
    "whatsapp_private_key_passphrase": "your-passphrase-here"
  }
}
```

### 3. Deploy the Stack

From the project root:

```bash
cdk synth
cdk deploy
```

### 4. Note the Outputs

After deployment, save these outputs:

- `output-whatsapp-flow-url`: The endpoint URL for WhatsApp Flow
- `output-whatsapp-flow-lambda-arn`: Lambda function ARN
- `output-incidents-table-name`: DynamoDB table name

### 5. Configure WhatsApp Flow

1. Go to Meta Developer Console
2. Navigate to your WhatsApp Business App
3. Configure the Flow endpoint with the `output-whatsapp-flow-url`
4. Upload your public key to Meta

## IAM Permissions

The Lambda function has the following permissions (automatically configured):

1. **DynamoDB**:
   - `dynamodb:GetItem`
   - `dynamodb:PutItem`
   - `dynamodb:Query`
   - `dynamodb:UpdateItem`
   - Access to the IncidentsTable

2. **CloudWatch Logs**:
   - `logs:CreateLogGroup`
   - `logs:CreateLogStream`
   - `logs:PutLogEvents`

## Testing

### Test with Unencrypted Request

```bash
curl -X POST https://your-api-gateway-url/flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ping",
    "version": "3.0"
  }'
```

Expected response:
```json
{
  "version": "3.0",
  "data": {
    "status": "active"
  }
}
```

### Test INIT Action

```bash
curl -X POST https://your-api-gateway-url/flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "INIT",
    "version": "3.0"
  }'
```

## Monitoring

### CloudWatch Logs

Logs are available at:
- Log Group: `/aws/lambda/whatsapp-flow-lambda-fn`

### Key Metrics to Monitor

1. **Lambda Metrics**:
   - Invocations
   - Errors
   - Duration
   - Throttles

2. **DynamoDB Metrics**:
   - Read/Write capacity units
   - Throttled requests
   - User errors

## Troubleshooting

### Issue: Lambda timeout
**Solution**: Increase timeout in [stack_chat_lambda.py](stack_chat_lambda.py:150)

### Issue: DynamoDB access denied
**Solution**: Check IAM role permissions in CloudWatch logs

### Issue: Private key not found
**Solution**: Ensure the private key file exists or configure environment variable `WHATSAPP_PRIVATE_KEY_BASE64`

### Issue: Encryption/Decryption errors
**Solution**: Verify the passphrase matches the one used to generate the private key

## Cost Considerations

- **Lambda**: Pay per request and execution time
- **DynamoDB**: Pay per request (on-demand mode)
- **API Gateway**: Pay per request

Estimated cost for 1,000 incident reports/month: < $1 USD

## Security Best Practices

1. Store private key passphrase in AWS Secrets Manager (not environment variables)
2. Enable AWS WAF on API Gateway for DDoS protection
3. Use VPC for Lambda if accessing private resources
4. Enable DynamoDB encryption at rest
5. Rotate private keys periodically

## Future Enhancements

- [ ] Store private key in AWS Secrets Manager
- [ ] Add SNS notifications for new incidents
- [ ] Implement incident status updates via Flow
- [ ] Add CloudWatch alarms for errors
- [ ] Implement request throttling
