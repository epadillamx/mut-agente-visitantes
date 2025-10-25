from typing import List
from dataclasses import dataclass
from cdklabs.generative_ai_cdk_constructs import bedrock
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_s3 as s3,
    aws_iam as iam,
    aws_ssm as ssm
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
    """Configuration for the Knowledge Base"""
    name: str
    description: str
    embedding_model: bedrock.BedrockFoundationModel
    embedding_dimensions: int
    collection_description: str
    vector_index_name: str = "bedrock-knowledge-base-index"


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
        # Create Knowledge Base with multiple data sources
        kb = self._create_knowledge_base()
        self._create_data_sources(kb)

        # Configure open access permissions for Knowledge Base
        self._configure_kb_permissions(kb)

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
        """Returns the Knowledge Base configuration based on provided specifications"""
        return KnowledgeBaseConfig(
            name="VirtualAssistantKnowledgeBase",
            description="Knowledge base con eventos, FAQs, tiendas y restaurantes del centro comercial",
            embedding_model=bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
            embedding_dimensions=1024,
            collection_description="Almacenamiento S3 para vectores del asistente virtual del centro comercial",
            vector_index_name="bedrock-knowledge-base-s3-index"
        )

    def _get_data_source_configs(self) -> List[DataSourceConfig]:
        """
        Returns list of data source configurations for:
        - eventos (events)
        - preguntas (FAQs)
        - stores (shops)
        - restaurantes (restaurants)
        """
        base_path = "datasets/demo_kb/knowledge-base-ecommerce-s3-001/v1/"

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

    def _create_knowledge_base(self) -> bedrock.VectorKnowledgeBase:
        """Creates the Knowledge Base with Amazon Bedrock managed vector store (uses S3)"""
        # Get S3 bucket for data sources
        s3_bucket = s3.Bucket.from_bucket_attributes(
            self,
            "virtualAssistantS3Bucket",
            bucket_arn=self.s3_bucket_arn
        )

        # Create Knowledge Base without specifying vector_store
        # This uses Amazon Bedrock's default managed vector storage
        # which is backed by S3 and optimized for cost-effectiveness
        kb = bedrock.VectorKnowledgeBase(
            self,
            'VirtualAssistantKnowledgeBase',
            embeddings_model=self.kb_config.embedding_model,
            instruction="Base de conocimiento con información sobre eventos, FAQs, tiendas y restaurantes del centro comercial."
        )

        return kb

    def _create_data_sources(self, kb: bedrock.VectorKnowledgeBase) -> None:
        """Creates multiple S3 data sources with specific chunking configurations"""
        # Get S3 bucket reference
        s3_bucket = s3.Bucket.from_bucket_attributes(
            self,
            "dataSourceS3Bucket",
            bucket_arn=self.s3_bucket_arn
        )

        # Create a data source for each configuration
        for config in self.data_source_configs:
            bedrock.S3DataSource(
                self,
                config.name,
                bucket=s3_bucket,
                knowledge_base=kb,
                inclusion_prefixes=config.inclusion_prefixes,
                data_source_name=config.name,
                chunking_strategy=bedrock.ChunkingStrategy.fixed_size(
                    max_tokens=config.max_tokens,
                    overlap_percentage=config.overlap_percentage
                )
            )

    def _configure_kb_permissions(self, kb: bedrock.VectorKnowledgeBase) -> None:
        """
        Configures IAM permissions to allow access to the Knowledge Base.
        Adds necessary Bedrock permissions to the Knowledge Base role.
        """
        # Add Bedrock full access permissions to the Knowledge Base role
        if hasattr(kb, 'role') and kb.role:
            kb.role.add_managed_policy(
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonBedrockFullAccess")
            )

            # Add custom policy for Knowledge Base operations
            kb.role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:InvokeModel",
                        "bedrock:InvokeModelWithResponseStream",
                        "bedrock:Retrieve",
                        "bedrock:RetrieveAndGenerate"
                    ],
                    resources=["*"]
                )
            )

            # Grant S3 read permissions to Knowledge Base role
            kb.role.add_to_policy(
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

    def _configure_agent_permissions(self, agent: bedrock.Agent, kb: bedrock.VectorKnowledgeBase) -> None:
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

    def _create_agent(self, kb: bedrock.VectorKnowledgeBase, guardrail: bedrock.Guardrail) -> bedrock.Agent:
        """Creates the Bedrock Agent with Knowledge Base and Guardrails"""
        agent = bedrock.Agent(
            self,
            'VirtualAssistantAgent',
            foundation_model=bedrock.BedrockFoundationModel.AMAZON_NOVA_PRO_V1,
            instruction=self._get_agent_instruction(),
            user_input_enabled=True,
            code_interpreter_enabled=False,
            should_prepare_agent=True,
            knowledge_bases=[kb],
            guardrail=guardrail
        )

        # Configure agent permissions
        self._configure_agent_permissions(agent, kb)

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

    def _create_outputs(self, agent: bedrock.Agent, agent_alias: bedrock.AgentAlias, kb: bedrock.VectorKnowledgeBase) -> None:
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

        # Knowledge Base ID
        CfnOutput(
            self,
            "output-knowledge-base-id",
            value=kb.knowledge_base_id,
            description="Bedrock Knowledge Base ID",
            export_name=f"{Stack.of(self).stack_name}-KnowledgeBaseId"
        )
