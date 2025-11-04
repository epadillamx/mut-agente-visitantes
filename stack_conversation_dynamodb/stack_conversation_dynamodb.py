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

        # Propiedades públicas para uso en otros stacks
        self.conversations_table_name = self.conversations_table.table_name
        self.sessions_table_name = self.sessions_table.table_name