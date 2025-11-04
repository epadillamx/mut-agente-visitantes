from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    aws_lambda as _lambda,
    aws_events as events,
    aws_events_targets as targets,
    aws_iam as iam,
)
from constructs import Construct

class DataPipelineOrchestratorStack(Stack):
    """
    Stack que orquesta el pipeline completo de datos mediante Step Functions:
    1. Extracción de datos (Lambda de extracción)
    2. Procesamiento ETL (Lambda ETL existente)
    3. Sincronización vectorial (Lambda de sincronización)
    
    Incluye EventBridge para ejecución automática diaria a las 12 AM
    """

    def __init__(
        self, 
        scope: Construct, 
        construct_id: str,
        extraction_lambda: _lambda.Function,
        etl_lambda: _lambda.Function,
        sync_lambda: _lambda.Function,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Step Functions Tasks
        """
        
        # Task 1: Extracción de datos
        extraction_task = tasks.LambdaInvoke(
            self,
            "ExtractionTask",
            lambda_function=extraction_lambda,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
            comment="Extrae eventos, tiendas y restaurantes desde mut.cl API"
        )
        
        # Task 2: Procesamiento ETL
        etl_task = tasks.LambdaInvoke(
            self,
            "ETLTask",
            lambda_function=etl_lambda,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
            comment="Procesa y transforma datos para Knowledge Base"
        )
        
        # Task 3: Sincronización vectorial
        sync_task = tasks.LambdaInvoke(
            self,
            "VectorialSyncTask",
            lambda_function=sync_lambda,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
            comment="Sincroniza base de datos vectorial y actualiza agente Bedrock"
        )
        
        # Task de éxito
        success_task = sfn.Succeed(
            self,
            "PipelineSuccess",
            comment="Pipeline completado exitosamente"
        )
        
        # Task de fallo
        failure_task = sfn.Fail(
            self,
            "PipelineFailure",
            comment="Pipeline falló durante la ejecución"
        )

        """
        @ Step Functions Definition
        """
        
        # Agregar manejo de errores a cada tarea
        extraction_task.add_catch(failure_task, errors=["States.ALL"], result_path="$.error")
        etl_task.add_catch(failure_task, errors=["States.ALL"], result_path="$.error")
        sync_task.add_catch(failure_task, errors=["States.ALL"], result_path="$.error")
        
        # Definir el flujo: extracción -> ETL -> sincronización -> éxito
        definition = extraction_task.next(etl_task).next(sync_task).next(success_task)
        
        # Crear State Machine
        self.state_machine = sfn.StateMachine(
            self,
            "DataPipelineStateMachine",
            definition=definition,
            timeout=Duration.minutes(60),  # Timeout de 1 hora
            comment="Orquesta el pipeline de extracción, ETL y sincronización de datos"
        )

        """
        @ EventBridge Rule - Ejecución diaria a las 12 AM
        """
        
        # Crear regla de EventBridge para ejecución diaria
        # cron(0 0 * * ? *) = todos los días a las 00:00 UTC
        # Para 12 AM hora de Chile (UTC-3), usar cron(0 3 * * ? *)
        self.daily_rule = events.Rule(
            self,
            "DailyExecutionRule",
            description="Ejecuta el pipeline de datos todos los días a las 12 AM (hora Chile)",
            schedule=events.Schedule.cron(
                minute="0",
                hour="3",  # 3 AM UTC = 12 AM Chile (UTC-3)
                month="*",
                week_day="*",
                year="*"
            )
        )
        
        # Agregar la State Machine como target del evento
        self.daily_rule.add_target(
            targets.SfnStateMachine(
                self.state_machine,
                input=events.RuleTargetInput.from_object({
                    "triggered_by": "eventbridge_daily",
                    "execution_time": events.EventField.time
                })
            )
        )

        """
        @ Outputs
        """
        
        CfnOutput(
            self,
            "output-state-machine-arn",
            value=self.state_machine.state_machine_arn,
            description="ARN de la State Machine del pipeline de datos"
        )
        
        CfnOutput(
            self,
            "output-state-machine-name",
            value=self.state_machine.state_machine_name,
            description="Nombre de la State Machine"
        )
        
        CfnOutput(
            self,
            "output-eventbridge-rule-name",
            value=self.daily_rule.rule_name,
            description="Nombre de la regla EventBridge para ejecución diaria"
        )
        
        CfnOutput(
            self,
            "output-execution-schedule",
            value="Todos los días a las 12:00 AM (hora Chile)",
            description="Horario de ejecución automática"
        )
