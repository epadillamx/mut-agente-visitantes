from typing import List
from dataclasses import dataclass
from cdklabs.generative_ai_cdk_constructs import bedrock
from aws_cdk import (
    Stack,
    aws_s3 as s3
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
        guardrail.add_pii_filter(
            type=bedrock.pii_type.General.ADDRESS,
            action=bedrock.GuardrailAction.ANONYMIZE,
        )
        guardrail.add_pii_filter(
            type=bedrock.pii_type.General.EMAIL,
            action=bedrock.GuardrailAction.ANONYMIZE,
        )
        guardrail.add_pii_filter(
            type=bedrock.pii_type.General.PHONE,
            action=bedrock.GuardrailAction.ANONYMIZE,
        )

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
        Eres un asistente virtual amigable y profesional para un centro comercial moderno. Tu propósito es ayudar a los visitantes a encontrar información sobre:

        1. **Eventos y Actividades**: Consulta tu base de conocimiento para informar sobre eventos actuales, próximos espectáculos, actividades especiales, y promociones.

        2. **Tiendas y Comercios**: Ayuda a localizar tiendas específicas, proporciona información sobre categorías de productos, horarios de las tiendas, y servicios disponibles.

        3. **Restaurantes y Gastronomía**: Informa sobre opciones gastronómicas, tipos de cocina, horarios, y recomendaciones según las preferencias del visitante.

        4. **Preguntas Frecuentes**: Responde consultas sobre:
           - Horarios del centro comercial
           - Servicios (estacionamiento, WiFi, baños, accesibilidad)
           - Políticas de devolución y cambio
           - Métodos de pago aceptados
           - Programa de fidelización

        **Guías de Interacción:**
        - Siempre consulta tu base de conocimiento antes de responder
        - Si la información no está en tu base de conocimiento, indica claramente que no tienes esa información
        - Sé conciso pero completo en tus respuestas
        - Usa un tono amigable y profesional
        - Ofrece información adicional relevante cuando sea apropiado
        - Si hay múltiples opciones, presenta hasta 5 resultados más relevantes
        - Para eventos, menciona fecha, hora y ubicación
        - Para tiendas y restaurantes, incluye ubicación en el centro comercial y horarios cuando estén disponibles

        **Filtrado de Información:**
        Cuando busques información, considera el contexto:
        - document_type: evento, faq, tienda, restaurante
        - search_category: eventos_y_actividades, preguntas_frecuentes, comercios_y_tiendas, gastronomia

        No uses etiquetas XML en tus respuestas. Responde de manera natural y conversacional.
        """

    def _create_agent(self, kb: bedrock.VectorKnowledgeBase, guardrail: bedrock.Guardrail) -> bedrock.Agent:
        """Creates the Bedrock Agent with Knowledge Base and Guardrails"""
        agent = bedrock.Agent(
            self,
            'VirtualAssistantAgent',
            foundation_model=bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_V1_0,
            instruction=self._get_agent_instruction(),
            user_input_enabled=True,
            code_interpreter_enabled=False,
            should_prepare_agent=True,
            knowledge_bases=[kb],
            guardrail=guardrail
        )

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
