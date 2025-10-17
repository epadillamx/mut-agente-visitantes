# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Generative AI project built with AWS CDK (Python) that implements a virtual shopping assistant using Amazon Bedrock Agents, Knowledge Bases, and Guardrails. The project demonstrates a complete e-commerce assistant that can answer product questions and place orders.

**Key AWS Services:**
- Amazon Bedrock (Agents, Knowledge Bases, Guardrails)
- Amazon OpenSearch Serverless (vector store)
- Amazon S3 (knowledge base data storage)
- AWS Lambda (ETL processing and order management)
- Amazon DynamoDB (order storage)
- Amazon Secrets Manager (credentials)

## Architecture

The project uses a **multi-stack CDK architecture** with clear separation of concerns:

1. **S3 Stack** (`stack_backend_s3/`) - Creates or imports S3 bucket for knowledge base data
2. **ETL Lambda Stack** (`stack_backend_lambda_light_etl/`) - Processes and transforms incoming inventory data for the knowledge base
3. **DDB Lambda Stack** (`stack_frontend_ddb_lambda/`) - DynamoDB table and Lambda function for storing product orders
4. **Bedrock Stack** (`stack_backend_bedrock/`) - Core AI components:
   - Vector Knowledge Base with Titan embeddings
   - OpenSearch Serverless collection (with standby replicas disabled)
   - Bedrock Agent with Claude Sonnet foundation model
   - Guardrails for content filtering (PII anonymization, denied topics, word filters)
   - Agent Action Group for order placement (integrated with DynamoDB Lambda)
5. **API Gateway Lambda Stack** (`stack_api_gateway_lambda/`) - REST API for chatting with the agent:
   - API Gateway REST API with CORS enabled
   - Lambda function to invoke Bedrock Agent
   - Endpoints: POST /chat, GET /health
6. **Frontend** (`frontend_docker_app/`) - Streamlit app for interacting with the agent

**Stack Dependencies:**
- Bedrock stack depends on S3 and DDB stacks
- ETL stack depends on S3 stack
- API Gateway stack depends on Bedrock stack
- Dependencies are explicitly defined in [app.py](app.py) lines 58-63

**Configuration:**
- Environment-specific settings are in [cdk.json](cdk.json) under context keys
- Current environment: `env-virtual-assistant-dev01`
- Change environment by modifying `env_name` in [app.py](app.py:14)

## Common Commands

### CDK Operations
```bash
# Synthesize CloudFormation templates
cdk synth

# List all stacks
cdk ls

# Deploy all stacks
cdk deploy --all --require-approval never

# Deploy specific stack
cdk deploy GenAiVirtualAssistantBedrockStack --require-approval never

# Compare deployed vs current state
cdk diff

# Destroy stack
cdk destroy GenAiVirtualAssistantBedrockStack

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT_ID/REGION
```

### Environment Setup
```bash
# Create virtual environment (Windows)
python -m venv venv
.venv\Scripts\activate.bat

# Create virtual environment (MacOS/Linux)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install dev dependencies
pip install -r requirements-dev.txt
```

### Testing
```bash
# Run tests
pytest

# Run specific test file
pytest tests/unit/test_src_asistente_virtual_ecommerce_stack.py
```

### Local Frontend Development
```bash
# Navigate to frontend directory
cd frontend_docker_app

# Run Streamlit app locally
streamlit run app.py

# Alternative (as documented in README)
cd stack_frontend_vpc_ecs_streamlit/streamlit_apps
streamlit run app-chat-with-agent.py
```

### API REST Usage
```bash
# Get API URL from stack outputs after deployment
export API_URL="https://xxxxxxxxxx.execute-api.REGION.amazonaws.com/prod"

# Health check
curl -X GET $API_URL/health

# Chat with agent
curl -X POST $API_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What toys do you have?"}'

# Chat with session continuity
curl -X POST $API_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me more", "sessionId": "session-id-from-previous-response"}'
```

See [stack_api_gateway_lambda/README.md](stack_api_gateway_lambda/README.md) for detailed API documentation and examples.

## Important Implementation Details

### Agent Instructions and Action Groups
- Agent instructions are hardcoded in [stack_backend_bedrock.py](stack_backend_bedrock/stack_backend_bedrock.py:119-134)
- **IMPORTANT:** This is not best practice. Instructions should be pulled from a database, Bedrock Prompt Management, or similar dynamic source
- Action groups use OpenAPI schema from [stack_backend_bedrock/openapi/schema.json](stack_backend_bedrock/openapi/schema.json)
- The `upsertOrder` function requires: `product_id` (string), `product_name` (string), `price` (float), `quantity` (integer), `order_notes` (string)

### Knowledge Base Configuration
- Uses **CHUNKING_STRATEGY.NONE** (chunking disabled) - see [stack_backend_bedrock.py](stack_backend_bedrock/stack_backend_bedrock.py:47)
- Embeddings model: Titan Embed Text V2 (1024 dimensions)
- Data sources configured via `s3_knowledge_base_prefixes` in [cdk.json](cdk.json:20)
- Dataset is toy products from Amazon (see [dataset/README.md](dataset/README.md))

### Guardrails
The Bedrock Agent includes comprehensive guardrails:
- **PII filtering:** Anonymizes addresses
- **Contextual grounding:** 0.70 threshold for grounding and relevance
- **Denied topics:** Legal advice, dangerous products (guns, drugs, weapons)
- **Word filters:** "drugs", "gun", "bomb" + managed profanity filter
- Configured in [stack_backend_bedrock.py](stack_backend_bedrock/stack_backend_bedrock.py:55-112)

### Lambda Layers
- **DDB Lambda:** Uses AWS Lambda Powertools Python V3 (Python 3.12) - [stack_frontend_ddb_lambda.py](stack_frontend_ddb_lambda/stack_frontend_ddb_lambda.py:35)
- **ETL Lambda:** Uses AWS SDK for Pandas (Python 3.12) - [stack_backend_lambda_light_etl.py](stack_backend_lambda_light_etl/stack_backend_lambda_light_etl.py:22)
- **API Gateway Lambda:** Uses AWS Lambda Powertools Python V3 (Python 3.12) - [stack_api_gateway_lambda.py](stack_api_gateway_lambda/stack_api_gateway_lambda.py:21)
- **Layer ARNs are region-specific** - do not change account IDs (they are AWS-managed public layers)

### Frontend Authentication
- Streamlit app in [frontend_docker_app/app.py](frontend_docker_app/app.py) has basic authentication
- **WARNING:** Auth mechanism is NOT secure - demo purposes only. Does not use Cognito, WAF, or SSO
- Credentials stored in AWS Secrets Manager (secret name hardcoded: `dev/ecomm/appServerDev01Credentials`)
- Region hardcoded: `us-west-2`

### Data Processing Notebooks
The [notebooks/](notebooks/) directory contains Jupyter notebooks for:
1. `1.Data_Preparation.ipynb` - Prepares toy product dataset
2. `2.Data_Upserts_on_DDB.ipynb` - Populates DynamoDB with sample data
3. `3.Query_Agent.ipynb` - Tests agent interactions
4. `4.Query_KB_Stream.ipynb` - Tests knowledge base queries with streaming

## Python Version and Dependencies

- **Python 3.12+** required
- Windows users: Python executable may be `py` instead of `python`
- Key dependencies:
  - `aws-cdk-lib==2.177.0`
  - `cdklabs.generative-ai-cdk-constructs==0.1.292`
  - `boto3>=1.36.16,<1.37.0`
  - `streamlit==1.43.0`
  - `pandas==2.2.3`

## Cost Considerations

**WARNING:** Review costs associated with:
- Amazon Bedrock model invocations (Claude Sonnet)
- Bedrock Knowledge Base queries
- OpenSearch Serverless collection
- Lambda function executions
- API Gateway requests
- S3 storage
- CloudWatch Logs

Always clean up resources after demos/practices using `cdk destroy`.

## Working with the Codebase

### When modifying stacks:
1. Stack files are located in `stack_*/` directories
2. Each stack inherits from `aws_cdk.Stack`
3. Update context parameters in [cdk.json](cdk.json) for environment-specific changes
4. Run `cdk diff` before deploying to see what will change

### When modifying the agent:
1. Agent configuration is in [stack_backend_bedrock/stack_backend_bedrock.py](stack_backend_bedrock/stack_backend_bedrock.py)
2. Modify instructions starting at line 119
3. Change OpenAPI schema in [stack_backend_bedrock/openapi/schema.json](stack_backend_bedrock/openapi/schema.json) for new actions
4. Update Lambda handler in [stack_frontend_ddb_lambda/lambda_function.py](stack_frontend_ddb_lambda/lambda_function.py) to implement new actions

### When updating knowledge base data:
1. Upload files to S3 bucket at prefix specified in [cdk.json](cdk.json:20)
2. Trigger Knowledge Base sync via AWS Console or API
3. ETL Lambda can process new inventory - see [stack_backend_lambda_light_etl/lambda_function.py](stack_backend_lambda_light_etl/lambda_function.py)

### When working with the REST API:
1. API configuration is in [stack_api_gateway_lambda/stack_api_gateway_lambda.py](stack_api_gateway_lambda/stack_api_gateway_lambda.py)
2. Lambda handler for API is in [stack_api_gateway_lambda/lambda_function.py](stack_api_gateway_lambda/lambda_function.py)
3. API receives Agent ID and Alias ID from Bedrock stack via [app.py](app.py:48-49)
4. Lambda has IAM permissions to invoke Bedrock Agent - see [stack_api_gateway_lambda.py](stack_api_gateway_lambda/stack_api_gateway_lambda.py:52-62)
5. API includes throttling (100 req/s, burst 200), logging, and CORS enabled
6. After deployment, get API URL from stack outputs: `output-api-gateway-chat-url`

### Git Status Note:
The project shows several deleted streamlit apps in git status. The main app is now [frontend_docker_app/app.py](frontend_docker_app/app.py).
