# Curso de Generative AI en AWS

2. Cree un entorno virtual:
```
python -m venv venv
source venv/Scripts/activate

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
cdk bootstrap aws://948270077717/us-east-1
cd stack_frontend_vpc_ecs_streamlit/streamlit_apps
streamlit run app-chat-with-agent.py

cdk destroy GenAiVirtualAssistantBedrockStack
cdk deploy GenAiVirtualAssistantBedrockStack --require-approval never


cdk deploy ChatLambdaNodeStack --require-approval never
cdk destroy ChatLambdaNodeStack
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