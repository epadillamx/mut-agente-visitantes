FROM public.ecr.aws/lambda/nodejs:22

# Copiar package.json primero para aprovechar cache de Docker
COPY lambda/package.json ${LAMBDA_TASK_ROOT}/

# Instalar dependencias (incluyendo @xenova/transformers)
RUN npm install --production

# Copiar el código fuente de la lambda
COPY lambda/*.js ${LAMBDA_TASK_ROOT}/
COPY lambda/bedrock/ ${LAMBDA_TASK_ROOT}/bedrock/
COPY lambda/plantillas/ ${LAMBDA_TASK_ROOT}/plantillas/

# Establecer el handler
CMD [ "index.handler" ]
