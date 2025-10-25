aws secretsmanager create-secret --name pinecone/mut-kb-api-key --secret-string '{"apiKey":"YOUR_API_KEY"}' --region us-east-1
# Crear con: aws secretsmanager create-secret --name pinecone/mut-kb-api-key --secret-string '{"apiKey":"YOUR_API_KEY"}' --region us-east-1
PINECONE_SECRET_ARN=arn:aws:secretsmanager:us-east-1:529928147458:secret:pinecone/mut-kb-api-key-XXXXXX
PINECONE_INDEX_URL=https://agente-3memz7m.svc.aped-4627-b74a.pinecone.io