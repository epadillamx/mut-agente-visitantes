from typing import List
from dataclasses import dataclass
from cdklabs.generative_ai_cdk_constructs import bedrock
from aws_cdk import (
    Stack,
    CfnOutput,
    Aws,
    Duration,
    aws_iam as iam,
    aws_ssm as ssm,
    aws_bedrock as bedrock_l1,
    custom_resources as cr
)
from constructs import Construct


@dataclass
class DataSourceConfig:
    """Configuration for a Knowledge Base data source"""
    name: str
    inclusion_prefixes: List[str]
    max_tokens: int
    overlap_percentage: int
    description: str = ""


@dataclass
class KnowledgeBaseConfig:
    """Configuration for the Knowledge Base with Pinecone"""
    name: str
    description: str
    embedding_model_arn: str
    embedding_dimensions: int
    # Pinecone configuration
    pinecone_connection_string: str
    pinecone_secret_arn: str
    pinecone_namespace: str = "mut-kb-prod"


class GenAiVirtualAssistantBedrockStack(Stack):
    """
    Stack for Virtual Assistant with Bedrock Agent, Knowledge Base and Guardrails.
    Optimized for shopping mall/e-commerce use case with multiple data sources.
    """

    def __init__(self, scope: Construct, construct_id: str, input_metadata, input_s3_bucket_arn, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Configuration constants
        self.input_metadata = input_metadata
        self.kb_config = self._get_knowledge_base_config()
        self.data_source_configs = self._get_data_source_configs()
        self.s3_bucket_arn = input_s3_bucket_arn

        """
        @ Knowledge Base Setup
        """
        # Create Knowledge Base with Pinecone vector store and multiple data sources
        kb = self._create_knowledge_base()
        self._create_data_sources(kb)
        # Note: KB permissions are now configured within _create_knowledge_base()

        """
        @ Guardrails Setup
        """
        guardrail = self._create_guardrails()

        """
        @ Bedrock Agent Setup
        """
        agent = self._create_agent(kb, guardrail)

        """
        @ Agent Alias
        """
        agent_alias = self._create_agent_alias(agent)

        # Expose agent, alias and KB as properties for other stacks
        self.agent_id = agent.agent_id
        self.agent_alias_id = agent_alias.alias_id
        self.kb = kb  # Expose Knowledge Base for sync lambda

        """
        @ Outputs
        """
        self._create_outputs(agent, agent_alias, kb)

    def _get_knowledge_base_config(self) -> KnowledgeBaseConfig:
        """Returns the Knowledge Base configuration for Pinecone integration"""
        # IMPORTANTE: Actualizar estos valores según tu configuración
        # 1. Crear secret en Secrets Manager: aws secretsmanager create-secret --name pinecone/mut-kb-api-key --secret-string '{"apiKey":"YOUR_KEY"}'
        # 2. Obtener ARN del secret y actualizar pinecone_secret_arn
        return KnowledgeBaseConfig(
            name="VirtualAssistantKnowledgeBase",
            description="Knowledge base de MUT (Mercado Urbano Tobalaba): eventos, FAQs, tiendas, restaurantes y espacios de colaboración",
            embedding_model_arn=f"arn:aws:bedrock:{Aws.REGION}::foundation-model/amazon.titan-embed-text-v2:0",
            embedding_dimensions=1024,
            pinecone_connection_string=self.input_metadata['pinecone_connection_string'],
            pinecone_secret_arn=f"arn:aws:secretsmanager:{Aws.REGION}:{Aws.ACCOUNT_ID}:secret:pinecone/{self.input_metadata['pinecone_secret_arn']}",
            pinecone_namespace="mut-kb-prod"
        )

    def _get_data_source_configs(self) -> List[DataSourceConfig]:
        """
        Returns list of data source configurations for:
        - eventos (events)
        - preguntas (FAQs)
        - stores (shops)
        - restaurantes (restaurants)
        """
        base_path = self.input_metadata['s3_knowledge_base_prefixes'][0].rstrip('/')+"/"

        return [
            DataSourceConfig(
                name="eventos-datasource",
                inclusion_prefixes=[f"{base_path}eventos/"],
                max_tokens=300,
                overlap_percentage=20,
                description="Fuente de datos para eventos y actividades del centro comercial"
            ),
            DataSourceConfig(
                name="preguntas-datasource",
                inclusion_prefixes=[f"{base_path}preguntas/"],
                max_tokens=400,
                overlap_percentage=10,
                description="Fuente de datos para preguntas frecuentes (FAQs)"
            ),
            DataSourceConfig(
                name="stores-datasource",
                inclusion_prefixes=[f"{base_path}stores/"],
                max_tokens=300,
                overlap_percentage=15,
                description="Fuente de datos para tiendas y comercios"
            ),
            DataSourceConfig(
                name="restaurantes-datasource",
                inclusion_prefixes=[f"{base_path}restaurantes/"],
                max_tokens=300,
                overlap_percentage=15,
                description="Fuente de datos para restaurantes y gastronomía"
            )
        ]

    def _create_knowledge_base(self) -> bedrock_l1.CfnKnowledgeBase:
        """Creates the Knowledge Base with Pinecone Serverless vector store"""

        # 1. Create IAM Role for Knowledge Base with inline policies
        # Using inline_policies ensures they're created atomically with the role
        kb_role = iam.Role(
            self,
            "KnowledgeBaseRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
            description="IAM Role for Bedrock Knowledge Base to access Pinecone and S3",
            inline_policies={
                "BedrockKnowledgeBasePolicy": iam.PolicyDocument(
                    statements=[
                        # Bedrock embedding model permissions
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "bedrock:InvokeModel",
                                "bedrock:InvokeModelWithResponseStream"
                            ],
                            resources=[
                                self.kb_config.embedding_model_arn
                            ]
                        ),
                        # Secrets Manager permissions (for Pinecone API key)
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "secretsmanager:GetSecretValue",
                                "secretsmanager:DescribeSecret"
                            ],
                            resources=[
                                self.kb_config.pinecone_secret_arn
                            ]
                        ),
                        # S3 permissions (for data sources)
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "s3:GetObject",
                                "s3:ListBucket"
                            ],
                            resources=[
                                self.s3_bucket_arn,
                                f"{self.s3_bucket_arn}/*"
                            ]
                        )
                    ]
                )
            }
        )

        # 5. Create Knowledge Base with Pinecone configuration
        kb = bedrock_l1.CfnKnowledgeBase(
            self,
            "VirtualAssistantKnowledgeBase",
            name=self.kb_config.name,
            description=self.kb_config.description,
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock_l1.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock_l1.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=self.kb_config.embedding_model_arn
                )
            ),
            storage_configuration=bedrock_l1.CfnKnowledgeBase.StorageConfigurationProperty(
                type="PINECONE",
                pinecone_configuration=bedrock_l1.CfnKnowledgeBase.PineconeConfigurationProperty(
                    connection_string=self.kb_config.pinecone_connection_string,
                    credentials_secret_arn=self.kb_config.pinecone_secret_arn,
                    namespace=self.kb_config.pinecone_namespace,
                    field_mapping=bedrock_l1.CfnKnowledgeBase.PineconeFieldMappingProperty(
                        text_field="text",
                        metadata_field="metadata"
                    )
                )
            )
        )

        # CRITICAL: Ensure KB waits for the IAM role policy to be fully created
        # This prevents the "not authorized to perform: secretsmanager:GetSecretValue" error
        kb.node.add_dependency(kb_role)

        # Store role for potential later use
        self.kb_role = kb_role

        return kb

    def _create_data_sources(self, kb: bedrock_l1.CfnKnowledgeBase) -> None:
        """Creates multiple S3 data sources with specific chunking configurations using L1 constructs"""

        # Create a data source for each configuration
        for config in self.data_source_configs:
            data_source = bedrock_l1.CfnDataSource(
                self,
                config.name,
                name=config.name,
                description=config.description,
                knowledge_base_id=kb.attr_knowledge_base_id,
                data_source_configuration=bedrock_l1.CfnDataSource.DataSourceConfigurationProperty(
                    type="S3",
                    s3_configuration=bedrock_l1.CfnDataSource.S3DataSourceConfigurationProperty(
                        bucket_arn=self.s3_bucket_arn,
                        inclusion_prefixes=config.inclusion_prefixes
                    )
                ),
                vector_ingestion_configuration=bedrock_l1.CfnDataSource.VectorIngestionConfigurationProperty(
                    chunking_configuration=bedrock_l1.CfnDataSource.ChunkingConfigurationProperty(
                        chunking_strategy="FIXED_SIZE",
                        fixed_size_chunking_configuration=bedrock_l1.CfnDataSource.FixedSizeChunkingConfigurationProperty(
                            max_tokens=config.max_tokens,
                            overlap_percentage=config.overlap_percentage
                        )
                    )
                )
            )

            # Ensure data source waits for Knowledge Base to be created
            data_source.add_dependency(kb)


    def _configure_agent_permissions(self, agent: bedrock.Agent, kb: bedrock_l1.CfnKnowledgeBase) -> None:
        """
        Configures IAM permissions for the Bedrock Agent.
        Grants access to invoke models, access knowledge base, and read from S3.
        """
        # Add permissions to agent role
        if hasattr(agent, 'role') and agent.role:
            # Grant Bedrock model invocation permissions
            agent.role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:InvokeModel",
                        "bedrock:InvokeModelWithResponseStream",
                        "bedrock:GetFoundationModel",
                        "bedrock:ListFoundationModels"
                    ],
                    resources=[
                        f"arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
                        f"arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0"
                    ]
                )
            )

            # Grant Knowledge Base access permissions
            agent.role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:Retrieve",
                        "bedrock:RetrieveAndGenerate",
                        "bedrock:GetKnowledgeBase",
                        "bedrock:ListKnowledgeBases"
                    ],
                    resources=["*"]  # Knowledge Base ARN will be resolved at runtime
                )
            )

            # Grant S3 read permissions to agent
            agent.role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "s3:GetObject",
                        "s3:ListBucket"
                    ],
                    resources=[
                        self.s3_bucket_arn,
                        f"{self.s3_bucket_arn}/*"
                    ]
                )
            )

            # Grant permissions to use guardrails
            agent.role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:ApplyGuardrail"
                    ],
                    resources=["*"]
                )
            )

    def _create_guardrails(self) -> bedrock.Guardrail:
        """
        Creates guardrails for the agent with:
        - PII filtering
        - Contextual grounding
        - Denied topics
        - Word filters
        """
        guardrail = bedrock.Guardrail(
            self,
            'virtualAssistantGuardrail',
            name='guardrail-virtual-assistant-mut',
            description="Guardrail para el asistente virtual de MUT (Mercado Urbano Tobalaba). Previene respuestas inapropiadas y protege información sensible."
        )

        # PII Protection - Anonymize sensitive information
        # Note: ADDRESS filter removed to allow displaying store/restaurant addresses
        #guardrail.add_pii_filter(
            #type=bedrock.pii_type.General.EMAIL,
            #action=bedrock.GuardrailAction.ANONYMIZE,
        #)
        #guardrail.add_pii_filter(
           # type=bedrock.pii_type.General.PHONE,
           # action=bedrock.GuardrailAction.ANONYMIZE,
        #)

        # Contextual grounding - Ensure responses are grounded in knowledge base
        guardrail.add_contextual_grounding_filter(
            type=bedrock.ContextualGroundingFilterType.GROUNDING,
            threshold=0.70,
        )
        guardrail.add_contextual_grounding_filter(
            type=bedrock.ContextualGroundingFilterType.RELEVANCE,
            threshold=0.70,
        )

        # Denied Topics - Prevent inappropriate conversations
        guardrail.add_denied_topic_filter(
            bedrock.Topic.custom(
                name="Legal_Financial_Advice",
                definition="Ofrecer asesoramiento legal o financiero, interpretación de leyes, recomendaciones de inversión o consejos fiscales.",
                examples=[
                    "¿Puedo demandar a una tienda por este producto?",
                    "¿Qué acciones legales puedo tomar?",
                    "¿Cómo puedo invertir mi dinero?",
                    "¿Qué tipo de tarjeta de crédito debería usar?",
                    "Dame consejos fiscales para mis compras"
                ]
            )
        )

        guardrail.add_denied_topic_filter(
            bedrock.Topic.custom(
                name="Medical_Health_Advice",
                definition="Proporcionar diagnósticos médicos, recomendaciones de tratamiento o consejos de salud profesional.",
                examples=[
                    "¿Qué medicina debo tomar para este dolor?",
                    "¿Este producto es bueno para mi condición médica?",
                    "¿Puedo automedicarme con esto?",
                    "¿Qué síntomas indican que debo ir al doctor?",
                    "Dame un diagnóstico de mi problema de salud"
                ]
            )
        )

        guardrail.add_denied_topic_filter(
            bedrock.Topic.custom(
                name="Inappropriate_Content",
                definition="Solicitudes relacionadas con contenido violento, ilegal, peligroso o inapropiado.",
                examples=[
                    "¿Venden armas en el centro comercial?",
                    "¿Dónde puedo conseguir productos ilegales?",
                    "¿Tienen artículos para actividades peligrosas?",
                    "Productos para hacer daño a alguien"
                ]
            )
        )

        # Word Filters - Block specific inappropriate words
        guardrail.add_managed_word_list_filter(type=bedrock.ManagedWordFilterType.PROFANITY)

        return guardrail

    def _get_agent_instruction(self) -> str:
        """
        Returns the agent instruction prompt.
        Best practice: Load this from external configuration (DynamoDB, Bedrock Prompt Management, etc.)

        This prompt is designed to work with:
        - Knowledge Base: Multiple data sources (eventos, preguntas, stores, restaurantes)
        - Guardrails: PII protection, contextual grounding, denied topics, profanity filter
        - DataSourceConfig: Optimized chunking for different content types
        """
        return """
        Eres un asistente virtual amigable y profesional para MUT (Mercado Urbano Tobalaba), un espacio abierto a las ideas, a los intercambios, a los sabores, a la colaboración, a la co-creación, a pasear entre jardines. Un espacio único que invita a la comunidad a ser parte e involucrarse con el proyecto.

        **IDENTIDAD Y TONO:**
        - Eres el asistente oficial de MUT, reflejando su espíritu de apertura, colaboración y comunidad
        - Transmite la esencia de MUT como un espacio de encuentro e intercambio, no solo un lugar comercial
        - Usa un tono amigable, cálido, cercano y acogedor que invite a la participación
        - NUNCA uses disculpas innecesarias o frases como "lo siento" o "disculpa"
        - Sé directo, confiado y servicial en tus respuestas
        - Adapta tu idioma según el usuario (español, inglés o portugués)
        - Refleja los valores de MUT: ideas, intercambios, sabores, colaboración, co-creación y conexión con la comunidad

        **MENSAJE DE BIENVENIDA:**
        Cuando un usuario te salude o inicie la conversación (ej: "hola", "buenos días", "hi", "hello", "olá", etc.), responde EXACTAMENTE con:

        "Bienvenido a MUT (Mercado Urbano Tobalaba), un espacio abierto a las ideas, los intercambios, los sabores y la colaboración. Soy tu asistente virtual. Cuéntanos en qué podemos ayudarte.

        Selecciona el tipo de asistencia que necesitas:

        1️⃣ Preguntas sobre búsqueda de tiendas
        2️⃣ Preguntas sobre ubicación de baños
        3️⃣ Búsqueda de sectores para sentarse a comer
        4️⃣ Dónde está el jardín de MUT
        5️⃣ Cómo llegar al metro desde MUT
        6️⃣ Información sobre salidas de MUT
        7️⃣ Información sobre ubicación de oficinas MUT
        8️⃣ Bicihub
        9️⃣ Otras preguntas

        💬 Puedes escribir el número o describir directamente tu consulta.
        🌐 Te atiendo en español, inglés y portugués."

        **RESTRICCIONES TERMINOLÓGICAS CRÍTICAS:**
        ⚠️ PROHIBIDO usar las siguientes palabras o frases:
        - "Mall" / "shopping mall"
        - "Food court" / "food-court" / "foodcourt"
        - "Centro comercial"

        ✅ Usa en su lugar:
        - "MUT" o "Mercado Urbano Tobalaba"
        - "Espacio de encuentro y colaboración"
        - "Espacio de tiendas, restaurantes y jardines"
        - "El Mercado" (para referirse a las zonas de comida en pisos -3 y -2)
        - "Lugares para sentarse a comer"
        - "Sectores de comida"
        - "Restaurantes" (para pisos 3, 4 y 5)
        - Cuando hables de MUT, enfatiza que es un espacio abierto a la comunidad, no solo un lugar de compras

        **USO DE LA BASE DE CONOCIMIENTO:**
        Tienes acceso a 4 fuentes de datos especializadas:

        1. **eventos-datasource**: Información sobre eventos, actividades y promociones en MUT
        2. **preguntas-datasource**: Preguntas frecuentes (FAQs) sobre servicios, horarios y políticas
        3. **stores-datasource**: Catálogo de tiendas con ubicaciones, categorías y horarios
        4. **restaurantes-datasource**: Información de restaurantes, tipos de cocina y ubicaciones

        SIEMPRE consulta la base de conocimiento antes de responder. La información está organizada por:
        - document_type: evento, faq, tienda, restaurante, navegacion, servicios
        - search_category: eventos_y_actividades, preguntas_frecuentes, comercios_y_tiendas, gastronomia, navegacion_interna, estacionamiento

        **MANEJO DE INFORMACIÓN NO DISPONIBLE:**
        Si la información NO está en tu base de conocimiento:
        - Para preguntas generales de MUT: "Para obtener esa información específica, te recomiendo acercarte al módulo de Servicio al Cliente en el piso -3 o consultar nuestro sitio web."
        - Para consultas de tiendas específicas: "No tengo información actualizada sobre ese detalle. Te sugiero contactar directamente a la tienda en el piso [X] o consultar en el módulo de Servicio al Cliente."
        - NUNCA inventes información si no está en la base de conocimiento, especialmente sobre horarios, ubicaciones o servicios específicos

        **PRINCIPIO DE JUSTIFICACIÓN:**
        Todas tus respuestas deben incluir contexto y justificación, no solo datos aislados.

        ❌ Mal ejemplo: "La comida está en el piso 2"
        ✅ Buen ejemplo: "Hay varios pisos de comida en MUT. Los pisos -3 y -2 conforman 'El Mercado', con una amplia variedad de opciones gastronómicas. Los pisos 3, 4 y 5 también cuentan con restaurantes."

        ❌ Mal ejemplo: "El horario es 10:00 - 22:00"
        ✅ Buen ejemplo: "MUT abre de lunes a domingo de 10:00 a 22:00 hrs. Te recomiendo verificar horarios específicos de tiendas ya que algunos locales pueden tener horarios extendidos."

        **ÁREAS DE ASISTENCIA:**

        1. **Tiendas y Comercios**:
        - Localización exacta (piso, sector, referencias)
        - Categorías de productos disponibles
        - Horarios de operación
        - Contacto o servicios especiales
        - Incluye siempre el piso y zona en tus respuestas

        2. **Navegación y Orientación**:
        - Ubicación de baños (especifica piso y zona cercana)
        - Lugares para sentarse a comer en "El Mercado" (pisos -3 y -2)
        - Jardín de MUT (ubicación y accesos)
        - Rutas al metro (indica salidas más convenientes)
        - Salidas del edificio (especifica hacia qué calle o dirección)
        - Oficinas administrativas y módulos de atención

        3. **Gastronomía**:
        - "El Mercado": pisos -3 y -2 (variedad de opciones para comer)
        - Restaurantes: pisos 3, 4 y 5
        - Tipos de cocina disponibles
        - Horarios y ubicaciones específicas
        - NUNCA uses "food court", di "El Mercado" o "lugares para sentarse a comer"

        4. **Estacionamiento**:
        - Accesos desde diferentes calles
        - Tarifas vigentes
        - Niveles disponibles
        - Convenios o descuentos
        - Indica siempre el acceso más conveniente según la consulta

        5. **Eventos y Actividades**:
        - Eventos en curso (fecha, hora exacta, ubicación en MUT)
        - Próximos eventos y actividades
        - Promociones especiales
        - Actividades para niños o familias
        - Incluye siempre: fecha, hora y lugar específico

        6. **Servicios Generales**:
        - Horarios de MUT
        - WiFi gratuito y cómo conectarse
        - Accesibilidad y facilidades
        - Servicios financieros (cajeros, bancos)
        - Métodos de pago aceptados
        - Programas de fidelización o beneficios

        7. **Bicihub **:
        - Información sobre estacionamiento de bicicletas
        - Ubicación del Bicihub en MUT
        - Espacio al interior de MUT dedicado exclusivamente al uso de la bicicleta, scooters y otras formas de electro movilidad
        - 2.000 estacionamientos de bicicletas.

        8. **Emergencias y Seguridad**:
        - Para número de seguridad: "Te recomiendo acercarte al módulo de SAC (Servicio al Cliente) para obtener información de contacto de seguridad."
        - Para emergencias reales: Indica ubicación del módulo de SAC en piso -3
        - Nunca proporciones números telefónicos inventados
        - Protocolo: Dirigir al módulo de atención más cercano

        **GUÍAS DE FORMATO DE RESPUESTA:**

        - Sé específico con ubicaciones: "Piso 2, sector norte, cerca de la entrada principal"
        - Si hay múltiples opciones, presenta hasta 5 resultados relevantes con detalles
        - Para eventos: fecha completa, hora de inicio y término, ubicación exacta en MUT
        - Para tiendas: nombre, piso, categoría, y si está disponible, horario específico
        - Para restaurantes: nombre, tipo de cocina, piso, y horario si aplica
        - Incluye contexto adicional útil sin ser solicitado (ej: "cerca del ascensor central")

        **RESPUESTAS CONTEXTUALIZADAS:**

        Ejemplos de respuestas correctas:

        Pregunta: "¿Dónde hay comida?"
        Respuesta: "En MUT tenemos varios espacios dedicados a los sabores y la gastronomía. Los pisos -3 y -2 conforman 'El Mercado', donde encontrarás una gran variedad de opciones gastronómicas con lugares para sentarse a comer en un ambiente de encuentro e intercambio. Los pisos 3, 4 y 5 también cuentan con restaurantes de diferentes tipos de cocina. ¿Buscas algo en particular?"

        Pregunta: "¿Cuál es el número de seguridad?"
        Respuesta: "Para obtener el contacto de seguridad de MUT, acércate al módulo de SAC (Servicio al Cliente) ubicado en el piso -3. Ellos te proporcionarán la información de contacto que necesitas."

        Pregunta: "¿Dónde está Nike?"
        Respuesta: "Nike se encuentra en el piso 2, sector deportes, cerca del acceso norte del edificio. Su horario es de lunes a domingo de 10:00 a 22:00 hrs."

        **GUARDRAILS Y LÍMITES:**

        Tu comportamiento está protegido por guardrails que:
        - Filtran contenido inapropiado y lenguaje ofensivo
        - Verifican que tus respuestas estén fundamentadas en la base de conocimiento (contextual grounding)
        - Previenen que ofrezcas asesoramiento legal, médico o financiero
        - Protegen información sensible de usuarios

        Si una pregunta activa los guardrails:
        - Redirige cortésmente hacia tu área de especialidad (información de MUT)
        - Sugiere contactar al módulo de SAC para consultas fuera de tu alcance
        - Mantén siempre un tono profesional y servicial

        **IMPORTANTE - REGLAS FINALES:**
        Responde de manera natural y conversacional
        Detecta saludos en español, inglés y portugués para mostrar el mensaje de bienvenida
        Si el usuario menciona un número del menú (1-10), responde según esa categoría específica
        Siempre justifica y contextualiza tus respuestas
        NUNCA uses "mall", "food court" o "centro comercial"
        NUNCA digas "lo siento" o "disculpa" innecesariamente
        Cuando no sepas algo de MUT, dirige al módulo de SAC en piso -3 o al sitio web
        Para seguridad, indica "acercarse al módulo de SAC"
        Todos los mensajes deben tener formato , con saltos de linea entre parrafos, listas, etc.
        """

    def _create_agent(self, kb: bedrock_l1.CfnKnowledgeBase, guardrail: bedrock.Guardrail) -> bedrock.Agent:
        """Creates the Bedrock Agent with Knowledge Base and Guardrails with Citations enabled

        Note: We use L2 Agent construct but need to manually associate the L1 Knowledge Base.
        The L2 construct doesn't directly support L1 KB, so we create the agent without KB
        and manually configure the association with retrieval configuration to enable citations.
        """
        agent = bedrock.Agent(
            self,
            'VirtualAssistantAgent',
            foundation_model=bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V1_0,
            instruction=self._get_agent_instruction(),
            user_input_enabled=True,
            code_interpreter_enabled=False,
            should_prepare_agent=True,
            guardrail=guardrail
        )

        # Configure agent permissions
        self._configure_agent_permissions(agent, kb)

        # Manually associate Knowledge Base with Agent using Custom Resource
        # WITH CITATIONS ENABLED via retrieval configuration
        kb_association = cr.AwsCustomResource(
            self,
            "AgentKnowledgeBaseAssociation",
            on_create=cr.AwsSdkCall(
                service="bedrock-agent",
                action="associateAgentKnowledgeBase",
                parameters={
                    "agentId": agent.agent_id,
                    "agentVersion": "DRAFT",
                    "knowledgeBaseId": kb.attr_knowledge_base_id,
                    "description": "Knowledge base del centro comercial MUT con citations habilitadas",
                    "knowledgeBaseState": "ENABLED",
                    # ⭐ CRITICAL: Enable citations/attributions with retrieval configuration
                    "knowledgeBaseConfiguration": {
                        "type": "VECTOR",
                        "vectorKnowledgeBaseConfiguration": {
                            "retrievalConfiguration": {
                                "vectorSearchConfiguration": {
                                    "numberOfResults": 10,
                                    "overrideSearchType": "HYBRID"  # HYBRID for better retrieval in Pinecone
                                }
                            }
                        }
                    }
                },
                physical_resource_id=cr.PhysicalResourceId.of(f"kb-assoc-{agent.agent_id}")
            ),
            on_update=cr.AwsSdkCall(
                service="bedrock-agent",
                action="associateAgentKnowledgeBase",
                parameters={
                    "agentId": agent.agent_id,
                    "agentVersion": "DRAFT",
                    "knowledgeBaseId": kb.attr_knowledge_base_id,
                    "description": "Knowledge base del centro comercial MUT con citations habilitadas",
                    "knowledgeBaseState": "ENABLED",
                    "knowledgeBaseConfiguration": {
                        "type": "VECTOR",
                        "vectorKnowledgeBaseConfiguration": {
                            "retrievalConfiguration": {
                                "vectorSearchConfiguration": {
                                    "numberOfResults": 10,
                                    "overrideSearchType": "HYBRID"
                                }
                            }
                        }
                    }
                },
                physical_resource_id=cr.PhysicalResourceId.of(f"kb-assoc-{agent.agent_id}")
            ),
            on_delete=cr.AwsSdkCall(
                service="bedrock-agent",
                action="disassociateAgentKnowledgeBase",
                parameters={
                    "agentId": agent.agent_id,
                    "agentVersion": "DRAFT",
                    "knowledgeBaseId": kb.attr_knowledge_base_id
                }
            ),
            policy=cr.AwsCustomResourcePolicy.from_statements([
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:AssociateAgentKnowledgeBase",
                        "bedrock:DisassociateAgentKnowledgeBase",
                        "bedrock:UpdateAgentKnowledgeBase",
                        "bedrock:GetAgentKnowledgeBase"
                    ],
                    resources=["*"]
                )
            ]),
            timeout=Duration.minutes(5),
            install_latest_aws_sdk=True
        )

        # Ensure association waits for both agent and KB to be created
        kb_association.node.add_dependency(agent)
        kb_association.node.add_dependency(kb)

        return agent

    def _create_agent_alias(self, agent: bedrock.Agent) -> bedrock.AgentAlias:
        """Creates an alias for the agent to enable versioning"""
        agent_alias = bedrock.AgentAlias(
            self,
            'VirtualAssistantAgentAlias',
            agent=agent,
            alias_name='virtual-assistant',
            description='Alias del agente para el asistente virtual de MUT - Mercado Urbano Tobalaba'
        )

        return agent_alias

    def _create_outputs(self, agent: bedrock.Agent, agent_alias: bedrock.AgentAlias, kb: bedrock_l1.CfnKnowledgeBase) -> None:
        """Creates CloudFormation outputs for the stack resources"""
        # Agent ID
        CfnOutput(
            self,
            "output-agent-id",
            value=agent.agent_id,
            description="Bedrock Agent ID",
            export_name=f"{Stack.of(self).stack_name}-AgentId"
        )

        # Agent Alias ID
        CfnOutput(
            self,
            "output-agent-alias-id",
            value=agent_alias.alias_id,
            description="Bedrock Agent Alias ID",
            export_name=f"{Stack.of(self).stack_name}-AgentAliasId"
        )

        # Knowledge Base ID (using L1 construct attribute)
        CfnOutput(
            self,
            "output-knowledge-base-id",
            value=kb.attr_knowledge_base_id,
            description="Bedrock Knowledge Base ID (Pinecone)",
            export_name=f"{Stack.of(self).stack_name}-KnowledgeBaseId"
        )

        # Pinecone Configuration Info
        CfnOutput(
            self,
            "output-pinecone-index-url",
            value=self.kb_config.pinecone_connection_string,
            description="Pinecone Index URL",
            export_name=f"{Stack.of(self).stack_name}-PineconeIndexUrl"
        )

        CfnOutput(
            self,
            "output-pinecone-namespace",
            value=self.kb_config.pinecone_namespace,
            description="Pinecone Namespace",
            export_name=f"{Stack.of(self).stack_name}-PineconeNamespace"
        )
