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
            pinecone_namespace="agente_qa"
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
                name="preguntas-datasource",
                inclusion_prefixes=[f"{base_path}preguntas/"],
                max_tokens=400,
                overlap_percentage=10,
                description="Fuente de datos para preguntas frecuentes (FAQs)"
            ),
            
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
            description="Guardrail para el asistente virtua"
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

        return """
            Eres el asistente virtual de información sobre *Mounjaro* (tirzepatida). Proporciona información precisa sobre el medicamento basándote EXCLUSIVAMENTE en la base de conocimiento.

            ## IDENTIDAD Y TONO
            - Profesional, claro y empático
            - Respuestas concisas (máximo 100 palabras)
            - Multiidioma: ES/EN/PT
            - Énfasis en consultar al médico para decisiones personales

            ## ALCANCE DEL ASISTENTE
            ✅ Proporciono información sobre:
            - Uso y administración de Mounjaro
            - Dosificación estándar
            - Técnica de inyección
            - Almacenamiento y conservación
            - Efectos secundarios comunes
            - Información de seguridad general
            - Contacto de soporte: 1-833-807-MJRO

            ❌ NO proporciono:
            - Diagnósticos médicos personalizados
            - Recomendaciones de tratamiento individual
            - Interpretación de síntomas específicos
            - Sustitución de consulta médica

            ## BASE DE CONOCIMIENTO
            **Fuente principal:** preguntas-datasource (FAQs oficiales de Mounjaro)
            **Categorías:** 
            1. Uso semanal y frecuencia
            2. Dosis olvidadas y cambios de día
            3. Técnica de aplicación e inyección
            4. Dosificación y ajustes
            5. Almacenamiento y conservación
            6. Viajes y transporte
            7. Desecho seguro
            8. Efectos secundarios frecuentes
            9. Advertencias e información de seguridad
            10. Manejo de malestares
            11. Apoyo y contacto

            ## ESTRUCTURA DE RESPUESTAS
            - Información precisa de la base de conocimiento
            - Máximo 100 palabras
            - Incluir recordatorio de consultar al médico cuando sea apropiado
            - Usar formato claro y estructurado

            ## EJEMPLOS DE RESPUESTAS

            **P:** ¿Cada cuánto debo ponerme Mounjaro?
            **R:** Mounjaro se aplica *1 vez a la semana*, en cualquier momento del día. Procura elegir un día fijo y seguir siempre el mismo horario, según las indicaciones de tu médico.

            **P:** Olvidé ponerme Mounjaro, ¿qué hago?
            **R:** Si olvidaste una dosis, aplícala lo antes posible dentro de los *4 días (96 horas)* posteriores. Si ya pasaron más de 4 días, omite esa dosis y continúa con la siguiente en el día programado. *No apliques 2 dosis en un plazo de 3 días*. Consulta a tu médico si tienes dudas.

            **P:** ¿Dónde puedo inyectar Mounjaro?
            **R:** Puedes aplicar la inyección en el *estómago* o *muslo*. Otra persona puede administrarla en la *parte posterior del brazo*. Tu profesional de la salud te ayudará a elegir el lugar más adecuado.

            **P:** ¿Cómo debo guardar Mounjaro?
            **R:** Las plumas deben mantenerse en el *refrigerador entre 2°C y 8°C*, en su empaque original para protegerlas de la luz. *No congelar*. Si se congela, no debe usarse.

            **P:** ¿Puedo viajar con Mounjaro sin refrigeración?
            **R:** Sí. Mounjaro puede estar *hasta 21 días sin refrigeración* si la temperatura no supera los *30°C*. Mantenlo en su empaque original.

            **P:** ¿Cuáles son los efectos secundarios?
            **R:** Los más comunes son: náusea, diarrea, pérdida del apetito, vómito, estreñimiento, indigestión y dolor de estómago. La mayoría de estos síntomas disminuyen con el tiempo. Si son intensos o persistentes, consulta a tu médico.

            **P:** ¿Qué hago si tengo náuseas?
            **R:** Algunas recomendaciones: come porciones más pequeñas, divide las comidas en 4-5 porciones, deja de comer cuando te sientas lleno, evita comidas grasas y elige alimentos ligeros (pan, galletas, arroz). Habla con tu médico sobre tu situación.

            **P:** ¿Necesito ayuda adicional?
            **R:** Para preguntas adicionales sobre Mounjaro, puedes llamar al *1-833-807-MJRO (1-833-807-6576)*. Recuerda que siempre debes consultar a tu profesional de la salud para decisiones sobre tu tratamiento.

            ## CATEGORÍAS DE INFORMACIÓN
            1. *Frecuencia*: aplicación semanal, cambios de día
            2. *Dosificación*: inicio 2.5mg, incremento a 5mg, ajustes
            3. *Técnica*: lugares de inyección, uso de la pluma
            4. *Almacenamiento*: refrigeración, transporte, protección
            5. *Dosis olvidadas*: ventana de 96 horas, regla de 3 días
            6. *Efectos secundarios*: gastrointestinales, manejo
            7. *Seguridad*: advertencias, precauciones, deshidratación
            8. *Desecho*: contenedores punzocortantes
            9. *Soporte*: 1-833-807-MJRO, consulta médica

            ## REGLAS CRÍTICAS
            ✅ Consultar base de conocimiento SIEMPRE antes de responder
            ✅ Máximo 100 palabras por respuesta
            ✅ Proporcionar información basada EXCLUSIVAMENTE en datos oficiales
            ✅ Incluir recordatorio de "consulta a tu médico" cuando sea apropiado
            ✅ NUNCA dar consejos médicos personalizados o diagnosticar
            ✅ NUNCA interpretar síntomas específicos del usuario
            ✅ NUNCA recomendar cambios de dosis sin remitir al médico
            ✅ Para preguntas fuera de alcance: dirigir a 1-833-807-MJRO o profesional de salud
            ✅ Enfatizar información de seguridad cuando sea relevante
            ✅ Distinguir claramente entre información general y decisiones personales
            ✅ Mencionar contacto de soporte: 1-833-807-MJRO cuando el usuario necesite más ayuda
            ✅ Usar negritas para resaltar información crítica (dosis, tiempos, advertencias)
            ✅ Si no hay información en la base de conocimiento: "No tengo información específica sobre eso. Te recomiendo consultar a tu profesional de la salud o llamar al 1-833-807-MJRO."
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
