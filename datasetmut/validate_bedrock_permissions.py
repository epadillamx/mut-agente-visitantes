#!/usr/bin/env python3
"""
Script para verificar que los permisos de Bedrock estén correctamente configurados
"""
import boto3
import json
import sys
from typing import Dict, List

class BedrockPermissionsValidator:
    def __init__(self, region: str = 'us-east-1'):
        self.bedrock_agent = boto3.client('bedrock-agent', region_name=region)
        self.iam = boto3.client('iam', region_name=region)
        self.bedrock = boto3.client('bedrock', region_name=region)
        
    def get_agent_role_arn(self, agent_id: str) -> str:
        """Obtiene el ARN del rol IAM del agente"""
        try:
            response = self.bedrock_agent.get_agent(agentId=agent_id)
            return response['agent']['agentResourceRoleArn']
        except Exception as e:
            print(f"❌ Error obteniendo información del agente: {e}")
            return None
    
    def get_kb_role_arn(self, kb_id: str) -> str:
        """Obtiene el ARN del rol IAM de la Knowledge Base"""
        try:
            response = self.bedrock_agent.get_knowledge_base(knowledgeBaseId=kb_id)
            return response['knowledgeBase']['roleArn']
        except Exception as e:
            print(f"❌ Error obteniendo información de KB: {e}")
            return None
    
    def check_role_policies(self, role_arn: str, required_actions: List[str]) -> Dict:
        """Verifica que un rol tenga los permisos requeridos"""
        role_name = role_arn.split('/')[-1]
        results = {
            'has_required_permissions': False,
            'found_actions': [],
            'missing_actions': [],
            'policies': []
        }
        
        try:
            # Obtener políticas inline
            inline_policies = self.iam.list_role_policies(RoleName=role_name)
            for policy_name in inline_policies['PolicyNames']:
                policy = self.iam.get_role_policy(
                    RoleName=role_name,
                    PolicyName=policy_name
                )
                results['policies'].append({
                    'name': policy_name,
                    'type': 'inline',
                    'document': policy['PolicyDocument']
                })
            
            # Obtener políticas administradas
            attached_policies = self.iam.list_attached_role_policies(RoleName=role_name)
            for policy in attached_policies['AttachedPolicies']:
                policy_arn = policy['PolicyArn']
                policy_version = self.iam.get_policy(PolicyArn=policy_arn)
                version_id = policy_version['Policy']['DefaultVersionId']
                policy_doc = self.iam.get_policy_version(
                    PolicyArn=policy_arn,
                    VersionId=version_id
                )
                results['policies'].append({
                    'name': policy['PolicyName'],
                    'type': 'managed',
                    'arn': policy_arn,
                    'document': policy_doc['PolicyVersion']['Document']
                })
            
            # Verificar acciones requeridas
            all_actions = set()
            for policy in results['policies']:
                doc = policy['document']
                if 'Statement' in doc:
                    for statement in doc['Statement']:
                        if statement.get('Effect') == 'Allow':
                            actions = statement.get('Action', [])
                            if isinstance(actions, str):
                                actions = [actions]
                            all_actions.update(actions)
            
            results['found_actions'] = list(all_actions)
            
            # Verificar acciones requeridas (con soporte para wildcards)
            for required in required_actions:
                found = False
                for action in all_actions:
                    if action == required or action == '*' or \
                       (action.endswith(':*') and required.startswith(action[:-1])):
                        found = True
                        break
                
                if not found:
                    results['missing_actions'].append(required)
            
            results['has_required_permissions'] = len(results['missing_actions']) == 0
            
        except Exception as e:
            print(f"❌ Error verificando políticas del rol {role_name}: {e}")
        
        return results
    
    def validate_agent_permissions(self, agent_id: str) -> bool:
        """Valida que el agente tenga todos los permisos necesarios"""
        print(f"\n🔍 Verificando permisos del Agente: {agent_id}")
        print("=" * 80)
        
        role_arn = self.get_agent_role_arn(agent_id)
        if not role_arn:
            return False
        
        print(f"📋 Rol IAM: {role_arn}")
        
        required_actions = [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:GetFoundationModel',
            'bedrock:ListFoundationModels',
            'bedrock:Retrieve',
            'bedrock:RetrieveAndGenerate',
            'bedrock:GetKnowledgeBase',
            'bedrock:ListKnowledgeBases',
            'bedrock:ApplyGuardrail',
            's3:GetObject',
            's3:ListBucket'
        ]
        
        results = self.check_role_policies(role_arn, required_actions)
        
        print(f"\n📦 Políticas encontradas: {len(results['policies'])}")
        for policy in results['policies']:
            print(f"  - {policy['name']} ({policy['type']})")
        
        if results['has_required_permissions']:
            print(f"\n✅ Todos los permisos requeridos están presentes")
        else:
            print(f"\n❌ Faltan los siguientes permisos:")
            for action in results['missing_actions']:
                print(f"  - {action}")
        
        return results['has_required_permissions']
    
    def validate_kb_permissions(self, kb_id: str) -> bool:
        """Valida que la Knowledge Base tenga todos los permisos necesarios"""
        print(f"\n🔍 Verificando permisos de Knowledge Base: {kb_id}")
        print("=" * 80)
        
        role_arn = self.get_kb_role_arn(kb_id)
        if not role_arn:
            return False
        
        print(f"📋 Rol IAM: {role_arn}")
        
        required_actions = [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:Retrieve',
            'bedrock:RetrieveAndGenerate',
            's3:GetObject',
            's3:ListBucket'
        ]
        
        results = self.check_role_policies(role_arn, required_actions)
        
        print(f"\n📦 Políticas encontradas: {len(results['policies'])}")
        for policy in results['policies']:
            print(f"  - {policy['name']} ({policy['type']})")
        
        if results['has_required_permissions']:
            print(f"\n✅ Todos los permisos requeridos están presentes")
        else:
            print(f"\n❌ Faltan los siguientes permisos:")
            for action in results['missing_actions']:
                print(f"  - {action}")
        
        return results['has_required_permissions']
    
    def list_available_models(self):
        """Lista los modelos disponibles en Bedrock"""
        print(f"\n🤖 Modelos de Bedrock disponibles:")
        print("=" * 80)
        try:
            response = self.bedrock.list_foundation_models()
            for model in response['modelSummaries']:
                if 'nova' in model['modelId'].lower() or 'titan' in model['modelId'].lower():
                    print(f"  ✓ {model['modelId']} - {model['modelName']}")
        except Exception as e:
            print(f"❌ Error listando modelos: {e}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Validador de permisos de Bedrock Agent y Knowledge Base'
    )
    parser.add_argument('--agent-id', help='ID del Agente de Bedrock')
    parser.add_argument('--kb-id', help='ID de la Knowledge Base')
    parser.add_argument('--region', default='us-east-1', help='Región AWS (default: us-east-1)')
    parser.add_argument('--list-models', action='store_true', help='Listar modelos disponibles')
    
    args = parser.parse_args()
    
    if not args.agent_id and not args.kb_id and not args.list_models:
        parser.print_help()
        print("\n❌ Debes proporcionar al menos --agent-id, --kb-id o --list-models")
        sys.exit(1)
    
    validator = BedrockPermissionsValidator(region=args.region)
    
    all_valid = True
    
    if args.list_models:
        validator.list_available_models()
    
    if args.agent_id:
        if not validator.validate_agent_permissions(args.agent_id):
            all_valid = False
    
    if args.kb_id:
        if not validator.validate_kb_permissions(args.kb_id):
            all_valid = False
    
    print("\n" + "=" * 80)
    if all_valid:
        print("✅ VALIDACIÓN EXITOSA - Todos los permisos están correctamente configurados")
        sys.exit(0)
    else:
        print("❌ VALIDACIÓN FALLIDA - Hay permisos faltantes o incorrectos")
        sys.exit(1)

if __name__ == '__main__':
    main()
