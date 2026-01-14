# Curso de Generative AI en AWS

2. Cree un entorno virtual:
```
python -m venv venv
source venv/Scripts/activate && cdk deploy ChatLambdaNodeStack --require-approval never --profile mut-prod-territoria
source venv/Scripts/activate && cdk destroy ChatLambdaNodeStack --require-approval never --profile mut-prod-territoria

3. Instale las dependencias:
```
python -m pip install -r requirements.txt
```

## Comandos Útiles

 * `cdk ls`          list all stacks in the app
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk docs`        open CDK documentation

## Instalacion
```
cdk bootstrap aws://529928147458/us-east-1 --profile mut-prod
cd stack_frontend_vpc_ecs_streamlit/streamlit_apps
streamlit run app-chat-with-agent.py

cdk destroy GenAiVirtualAssistantBedrockStack -require-approval never
cdk deploy GenAiVirtualAssistantBedrockStack --require-approval never

cdk deploy ChatLambdaNodeStack --require-approval never

cdk deploy GenAiVirtualAssistantEtlLambdaStack --require-approval never
cdk deploy ChatRunnerNodeStack --require-approval never
cdk destroy ChatLambdaNodeStack --require-approval never

cdk deploy MutConversationStack --require-approval never

aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn506D116E-odHi5ezTx8dv --follow --format short
```

## UPDATE
```
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "TU_TOKEN_REAL_DE_WHATSAPP" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/phone-id" \
  --value "TU_PHONE_ID_REAL" \
  --type "SecureString" \
  --overwrite

  ```

  lambda
  https://idzi04z9sh.execute-api.us-east-1.amazonaws.com/prod/webhook

  source venv/Scripts/activate && cdk deploy ChatRunnerNodeStack --require-approval never --profile mut-prod-territoria


  deploy:

  cd /c/Users/gusta/Documents/apylink/repositorios/mut/mut-agente-visitantes && source venv/Scripts/activate && AWS_PROFILE=mut-prod cdk deploy ChatLambdaNodeStack --require-approval never 2>&1


  cd /c/Users/gusta/Documents/apylink/repositorios/mut/mut-agente-visitantes && source venv/Scripts/activate && AWS_PROFILE=mut-prod cdk deploy ChatRunnerNodeStack --require-approval never 2>&1


  cd /c/Users/gusta/Documents/apylink/repositorios/mut/mut-agente-visitantes && source venv/Scripts/activate && AWS_PROFILE=mut-prod cdk bootstrap aws://529928147458/us-east-1 2>&1




stack_chat_lambda_node pertenece a incidencias de los locatarios
stack_chat_runner pertenece a visitantes