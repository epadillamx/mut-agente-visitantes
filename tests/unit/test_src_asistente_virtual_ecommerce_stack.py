import aws_cdk as core
import aws_cdk.assertions as assertions

from src_asistente_virtual_ecommerce.src_asistente_virtual_ecommerce_stack import SrcAsistenteVirtualEcommerceStack

# example tests. To run these tests, uncomment this file along with the example
# resource in src_asistente_virtual_ecommerce/src_asistente_virtual_ecommerce_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = SrcAsistenteVirtualEcommerceStack(app, "src-asistente-virtual-ecommerce")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
