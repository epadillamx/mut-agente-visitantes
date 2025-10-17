# Curso de Generative AI en AWS

Este repositorio contiene el material de Carlos Contreras, con conceptos básicos y avanzados sobre Generative AI en AWS. El proyecto inluye notebooks, aplicaciones de ejemplo y recursos necesarios para aprender a construir aplicaciones de IA Generativa usando servicios de AWS.

## 🎯 Descripción

El contenido está diseñado para proporcionar una comprensión práctica de cómo desarrollar aplicaciones de IA Generativa en AWS, cubriendo desde conceptos básicos hasta implementaciones avanzadas. Se centra en el uso de Amazon Bedrock y su integración con otros servicios AWS. Este repositorio usa Código como Infraestructura con Amazon CDK.

## 🛠️ Estructura del Repositorio

La estructura se explica durante el curso de Generative AI con Carlos Contreras.
```
├── app.py
├── cdk.context.json
├── cdk.json
├── cdk.out
├── dataset
├── frontend_docker_app
├── notebooks
├── README.md
├── requirements-dev.txt
├── requirements.txt
├── source.bat
├── stack_backend_bedrock
├── stack_backend_lambda_light_etl
├── stack_backend_s3
├── stack_frontend_ddb_lambda
├── stack_frontend_vpc_ecs_streamlit
└── tests
```

## 📋 Requisitos Previos

- Cuenta AWS con acceso a Amazon Bedrock
- Acceso a cuenta AWS con permisos administrativos
- Python 3.12+
- AWS CLI configurado
- Visual Studio Code (recomendado)
- Git

## 🚀 Inicio Rápido

1. Clone el repositorio:
```bash
git clone [URL_DEL_REPOSITORIO]
```

2. Cree un entorno virtual:
```
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
```

3. Instale las dependencias:
```
python -m pip install -r requirements.txt
```

> Nota: Para entornos windows, es posible que el ejecutable (sinónimo) de Python sea "py"

⚠️ Importante
Revise los costes asociados con el uso de los modelos en Amazon Bedrock y asegúrese de limpiar los recursos después de las prácticas.

## Proyecto en Amazon CDK

Este proyecto está configurado como un proyecto estándar de Python. El proceso de inicialización también crea un entorno virtual dentro de este proyecto, almacenado en el directorio .venv. Para crear el entorno virtual, se asume que hay un ejecutable python3 (o python para Windows) en tu ruta con acceso al paquete venv. Si por alguna razón la creación automática del entorno virtual falla, puedes crearlo manualmente.

Para crear manualmente un entorno virtual en MacOS y Linux:
```
$ python3 -m venv .venv
```

Después de que el proceso de inicialización se completa y el entorno virtual es creado, puedes usar el siguiente paso para activar tu entorno virtual.

```
$ source .venv/bin/activate
```

Si estás en una plataforma Windows, activarías el entorno virtual de esta manera:
```
% .venv\Scripts\activate.bat
```

Una vez que el entorno virtual está activado, puedes instalar las dependencias requeridas.
```
$ pip install -r requirements.txt
```

En este punto, ya puedes sintetizar la plantilla de CloudFormation para este código.
```
$ cdk synth
```

Para agregar dependencias adicionales, por ejemplo, otras bibliotecas CDK, simplemente agrégalas a tu archivo setup.py y vuelve a ejecutar el comando pip install -r requirements.txt.

## Comandos Útiles

 * `cdk ls`          list all stacks in the app
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk docs`        open CDK documentation

## Instalacion
```
cdk bootstrap aws://948270077717/us-east-1
```