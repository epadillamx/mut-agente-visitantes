from aws_cdk import (
    Stack,
    aws_dynamodb as dynamodb,
    RemovalPolicy,
    Duration,
    CfnOutput
)
from constructs import Construct


class StackConversationDynamoDB(Stack):
    """
    Stack para el almacenamiento de conversaciones del asistente virtual MUT.
    Incluye tablas para conversaciones completas y sesiones activas.
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Tabla principal de conversaciones
        self.conversations_table = dynamodb.Table(
            self, "ConversationsTable",
            table_name="mut-conversations",
            partition_key=dynamodb.Attribute(
                name="conversation_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp",
                type=dynamodb.AttributeType.NUMBER
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True,
            time_to_live_attribute="ttl"
        )

        # GSI para consultar por usuario
        self.conversations_table.add_global_secondary_index(
            index_name="user-index",
            partition_key=dynamodb.Attribute(
                name="user_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        self.conversations_table.add_global_secondary_index(
            index_name="message-id-index",
            partition_key=dynamodb.Attribute(
                name="message_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        # GSI para consultar conversaciones por incidencia_session_id
        # Permite vincular tickets con su historial de conversaciones
        self.conversations_table.add_global_secondary_index(
            index_name="incidencia-session-index",
            partition_key=dynamodb.Attribute(
                name="incidencia_session_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        # Tabla de sesiones activas
        self.sessions_table = dynamodb.Table(
            self, "SessionsTable",
            table_name="mut-sessions",
            partition_key=dynamodb.Attribute(
                name="user_id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            time_to_live_attribute="ttl"
        )

        # ============================================================================
        # TABLAS PARA REEMPLAZO DE POSTGRESQL (whatsapp_usuarios, whatsapp_tickets)
        # ============================================================================

        # Tabla de usuarios WhatsApp (reemplaza public.whatsapp_usuarios)
        # PK: phone (único identificador del usuario)
        self.whatsapp_usuarios_table = dynamodb.Table(
            self, "WhatsAppUsuariosTable",
            table_name="mut-whatsapp-usuarios",
            partition_key=dynamodb.Attribute(
                name="phone",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True
        )

        # GSI para buscar usuarios por email
        self.whatsapp_usuarios_table.add_global_secondary_index(
            index_name="email-index",
            partition_key=dynamodb.Attribute(
                name="email",
                type=dynamodb.AttributeType.STRING
            )
        )

        # GSI para buscar usuarios por local_id
        self.whatsapp_usuarios_table.add_global_secondary_index(
            index_name="local_id-index",
            partition_key=dynamodb.Attribute(
                name="local_id",
                type=dynamodb.AttributeType.STRING
            )
        )

        # Tabla de tickets WhatsApp (reemplaza public.whatsapp_tickets)
        # PK: phone (agrupa tickets por usuario)
        # SK: created_at (timestamp para ordenar tickets)
        # TTL: 90 días (3 meses) para limpieza automática
        self.whatsapp_tickets_table = dynamodb.Table(
            self, "WhatsAppTicketsTable",
            table_name="mut-whatsapp-tickets",
            partition_key=dynamodb.Attribute(
                name="phone",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.NUMBER
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True,
            time_to_live_attribute="ttl"
        )

        # GSI para buscar tickets por estado
        self.whatsapp_tickets_table.add_global_secondary_index(
            index_name="estado-index",
            partition_key=dynamodb.Attribute(
                name="estado",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        # GSI para buscar tickets por destino (zendesk/fracttal)
        self.whatsapp_tickets_table.add_global_secondary_index(
            index_name="destino-index",
            partition_key=dynamodb.Attribute(
                name="destino",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        # GSI para paginar todos los tickets del día actual sin filtro de usuario
        # PK: date_partition (formato: "2025-12-17")
        # SK: created_at (timestamp para ordenar)
        self.whatsapp_tickets_table.add_global_secondary_index(
            index_name="date-index",
            partition_key=dynamodb.Attribute(
                name="date_partition",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.NUMBER
            )
        )

        # GSI para buscar tickets por ID unificado (Fracttal o Zendesk)
        # PK: ticket_id (formato: "260", "12345", etc. - sin prefijo)
        # Permite búsqueda directa sin importar el sistema de origen
        self.whatsapp_tickets_table.add_global_secondary_index(
            index_name="ticket-id-index",
            partition_key=dynamodb.Attribute(
                name="ticket_id",
                type=dynamodb.AttributeType.STRING
            )
        )

        # ============================================================================
        # TABLA DE SESIONES DE INCIDENCIA (para vincular logs con tickets)
        # ============================================================================
        # Esta tabla NO tiene TTL - la sesión persiste hasta que el usuario
        # complete el formulario y cree un ticket. Solo entonces se elimina.
        self.incidencia_sessions_table = dynamodb.Table(
            self, "IncidenciaSessionsTable",
            table_name="mut-incidencia-sessions",
            partition_key=dynamodb.Attribute(
                name="phone",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN
            # SIN time_to_live_attribute - se elimina manualmente al crear ticket
        )

        # Outputs para uso en otros stacks
        CfnOutput(
            self, "ConversationsTableName",
            value=self.conversations_table.table_name,
            description="Nombre de la tabla de conversaciones",
            export_name=f"{construct_id}-conversations-table-name"
        )

        CfnOutput(
            self, "ConversationsTableArn",
            value=self.conversations_table.table_arn,
            description="ARN de la tabla de conversaciones",
            export_name=f"{construct_id}-conversations-table-arn"
        )

        CfnOutput(
            self, "SessionsTableName",
            value=self.sessions_table.table_name,
            description="Nombre de la tabla de sesiones",
            export_name=f"{construct_id}-sessions-table-name"
        )

        CfnOutput(
            self, "SessionsTableArn",
            value=self.sessions_table.table_arn,
            description="ARN de la tabla de sesiones",
            export_name=f"{construct_id}-sessions-table-arn"
        )

        # Outputs para tablas WhatsApp
        CfnOutput(
            self, "WhatsAppUsuariosTableName",
            value=self.whatsapp_usuarios_table.table_name,
            description="Nombre de la tabla de usuarios WhatsApp",
            export_name=f"{construct_id}-whatsapp-usuarios-table-name"
        )

        CfnOutput(
            self, "WhatsAppUsuariosTableArn",
            value=self.whatsapp_usuarios_table.table_arn,
            description="ARN de la tabla de usuarios WhatsApp",
            export_name=f"{construct_id}-whatsapp-usuarios-table-arn"
        )

        CfnOutput(
            self, "WhatsAppTicketsTableName",
            value=self.whatsapp_tickets_table.table_name,
            description="Nombre de la tabla de tickets WhatsApp",
            export_name=f"{construct_id}-whatsapp-tickets-table-name"
        )

        CfnOutput(
            self, "WhatsAppTicketsTableArn",
            value=self.whatsapp_tickets_table.table_arn,
            description="ARN de la tabla de tickets WhatsApp",
            export_name=f"{construct_id}-whatsapp-tickets-table-arn"
        )

        CfnOutput(
            self, "IncidenciaSessionsTableName",
            value=self.incidencia_sessions_table.table_name,
            description="Nombre de la tabla de sesiones de incidencia",
            export_name=f"{construct_id}-incidencia-sessions-table-name"
        )

        CfnOutput(
            self, "IncidenciaSessionsTableArn",
            value=self.incidencia_sessions_table.table_arn,
            description="ARN de la tabla de sesiones de incidencia",
            export_name=f"{construct_id}-incidencia-sessions-table-arn"
        )

        # Propiedades públicas para uso en otros stacks
        self.conversations_table_name = self.conversations_table.table_name
        self.sessions_table_name = self.sessions_table.table_name
        self.whatsapp_usuarios_table_name = self.whatsapp_usuarios_table.table_name
        self.whatsapp_tickets_table_name = self.whatsapp_tickets_table.table_name
        self.incidencia_sessions_table_name = self.incidencia_sessions_table.table_name