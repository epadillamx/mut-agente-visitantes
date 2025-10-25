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

        # Expose agent and alias IDs as properties for other stacks
        self.agent_id = agent.agent_id
        self.agent_alias_id = agent_alias.alias_id

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
            description="Knowledge base con eventos, FAQs, tiendas y restaurantes del centro comercial",
            embedding_model_arn=f"arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
            embedding_dimensions=1024,
            pinecone_connection_string="https://agente-3memz7m.svc.aped-4627-b74a.pinecone.io",
            pinecone_secret_arn="arn:aws:secretsmanager:us-east-1:529928147458:secret:pinecone/mut-kb-api-key-G0Ksk9",  # TODO: Actualizar con ARN real
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
        base_path = "datasets/prod_kb/knowledge-base-mut-s3-001/v1/"

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
                        f"arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
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
            name='guardrail-virtual-assistant-mall',
            description="Guardrail para el asistente virtual del centro comercial. Previene respuestas inapropiadas y protege información sensible."
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
        guardrail.add_managed_word_list_filter(bedrock.ManagedWordFilterType.PROFANITY)

        return guardrail

    def _get_agent_instruction(self) -> str:
        """
        Returns the agent instruction prompt.
        Best practice: Load this from external configuration (DynamoDB, Bedrock Prompt Management, etc.)
        """
        return """
        Eres un asistente virtual amigable y profesional para MUT, un centro comercial moderno. Tu propósito es ayudar a los visitantes brindando información precisa y útil.

        **MENSAJE DE BIENVENIDA:**
        Cuando un usuario te salude o inicie la conversación (ej: "hola", "buenos días", "hi", etc.), responde con:

        "¡Bienvenid@ a MUT! 🛍️ Cuéntanos cómo podemos ayudarte =)

        A continuación, selecciona el tipo de asistencia que necesitas:

        1️⃣ Preguntas sobre búsqueda de tiendas
        2️⃣ Preguntas sobre ubicación de baños
        3️⃣ Búsqueda de sectores para sentarse a comer
        4️⃣ Dónde está el jardín de MUT
        5️⃣ Cómo llegar al metro desde MUT
        6️⃣ Información sobre salidas de MUT
        7️⃣ Información sobre ubicación de oficinas MUT
        8️⃣ Información sobre estacionamientos
        9️⃣ Emergencias
        🔟 Otras preguntas

        💬 Puedes escribir el número o describir directamente tu consulta.
        🌐 Te atiendo en español, inglés y portugués."

        **ÁREAS DE ASISTENCIA:**

        1. **Tiendas y Comercios**: Localización de tiendas específicas, categorías de productos, horarios y servicios disponibles.

        2. **Navegación y Orientación**: 
        - Ubicación de baños
        - Zonas de comida y descanso
        - Jardín de MUT
        - Rutas al metro
        - Salidas del centro comercial
        - Ubicación de oficinas administrativas

        3. **Gastronomía**: Opciones de restaurantes, tipos de cocina, zonas de food court, horarios y recomendaciones.

        4. **Estacionamiento**: Información sobre accesos, tarifas, disponibilidad y ubicaciones de estacionamiento.

        5. **Eventos y Actividades**: Eventos actuales, próximos espectáculos, actividades especiales y promociones.

        6. **Servicios Generales**: 
        - Horarios del centro comercial
        - WiFi gratuito
        - Accesibilidad
        - Políticas de devolución
        - Métodos de pago
        - Programa de fidelización

        7. **Emergencias**: Protocolo claro para situaciones urgentes, ubicación de puntos de información y seguridad.

        **GUÍAS DE INTERACCIÓN:**

        - Siempre consulta tu base de conocimiento antes de responder
        - Si no tienes la información, indícalo claramente y ofrece alternativas (contactar con información, ir a punto de atención)
        - Sé conciso pero completo
        - Usa un tono amigable, cálido y profesional
        - Adapta tu idioma según el usuario (español, inglés o portugués)
        - Ofrece información adicional relevante cuando sea apropiado
        - Para ubicaciones, sé específico (piso, zona, referencias cercanas)
        - Si hay múltiples opciones, presenta hasta 5 resultados más relevantes
        - Para eventos: menciona fecha, hora y ubicación
        - Para tiendas/restaurantes: incluye ubicación y horarios disponibles

        **FILTRADO DE INFORMACIÓN:**
        Considera el contexto usando:
        - document_type: evento, faq, tienda, restaurante, navegacion, servicios
        - search_category: eventos_y_actividades, preguntas_frecuentes, comercios_y_tiendas, gastronomia, navegacion_interna, estacionamiento

        **IMPORTANTE:** 
        - Responde de manera natural y conversacional, sin usar etiquetas XML
        - Detecta saludos en los tres idiomas para mostrar el mensaje de bienvenida
        - Si el usuario menciona un número del menú, responde según esa categoría específica
        - En emergencias (opción 9), prioriza información de contacto directo con seguridad
        """

    def _create_agent(self, kb: bedrock_l1.CfnKnowledgeBase, guardrail: bedrock.Guardrail) -> bedrock.Agent:
        """Creates the Bedrock Agent with Knowledge Base and Guardrails

        Note: We use L2 Agent construct but need to manually associate the L1 Knowledge Base.
        The L2 construct doesn't directly support L1 KB, so we create the agent without KB
        and rely on the AgentKnowledgeBase association created separately if needed.
        For now, we'll create the agent and the KB association will be handled by Bedrock
        when properly configured.
        """
        agent = bedrock.Agent(
            self,
            'VirtualAssistantAgent',
            foundation_model=bedrock.BedrockFoundationModel.AMAZON_NOVA_PRO_V1,
            instruction=self._get_agent_instruction(),
            user_input_enabled=True,
            code_interpreter_enabled=False,
            should_prepare_agent=True,
            # NOTE: Cannot pass L1 CfnKnowledgeBase to L2 Agent constructor
            # Knowledge base association will be created via custom resource below
            guardrail=guardrail
        )

        # Configure agent permissions
        self._configure_agent_permissions(agent, kb)

        # Manually associate Knowledge Base with Agent using Custom Resource
        # since CfnAgentKnowledgeBase is not available in current CDK version
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
                    "description": "Knowledge base del centro comercial MUT",
                    "knowledgeBaseState": "ENABLED"
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
                        "bedrock:DisassociateAgentKnowledgeBase"
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
            alias_name='virtual-assistant-mall-v1',
            description='Alias del agente para el asistente virtual del centro comercial (versión 1)'
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
