import { RiskClassification } from '../../security/permissionEngine';

export interface BackendToolDefinition {
  toolId: string;
  name: string;
  description: string;
  projectScope: 'assistant' | 'cinematic' | 'shared';
  risk: RiskClassification;
  requireOwner: boolean;
  requireApprovalToken: boolean;
  relatedWfId?: string;
}

export const BACKEND_TOOL_REGISTRY: Record<string, BackendToolDefinition> = {
  'TOOL-WF-ANALYZE': {
    toolId: 'TOOL-WF-ANALYZE',
    name: 'Analyze Workflow JSON (WF-01)',
    description: 'Static and structural debugging of uploaded n8n workflow JSON.',
    projectScope: 'shared',
    risk: 'read_only',
    requireOwner: false,
    requireApprovalToken: false,
    relatedWfId: 'WF-01'
  },
  'TOOL-WF-GENERATE': {
    toolId: 'TOOL-WF-GENERATE',
    name: 'Generate Workflow JSON (WF-02)',
    description: 'Generate valid n8n workflow JSON from requirements.',
    projectScope: 'shared',
    risk: 'low_risk_write',
    requireOwner: false,
    requireApprovalToken: false,
    relatedWfId: 'WF-02'
  },
  'TOOL-WF-VALIDATE': {
    toolId: 'TOOL-WF-VALIDATE',
    name: 'Validate Workflow JSON (WF-04)',
    description: 'Validate syntax, node types, expressions, and compatibility.',
    projectScope: 'shared',
    risk: 'read_only',
    requireOwner: false,
    requireApprovalToken: false,
    relatedWfId: 'WF-04'
  },
  'TOOL-COPILOT-DIAGNOSE': {
    toolId: 'TOOL-COPILOT-DIAGNOSE',
    name: 'AI Copilot Error & Screenshot Diagnosis',
    description: 'Diagnose workflow or backend errors and propose non-destructive fixes.',
    projectScope: 'shared',
    risk: 'read_only',
    requireOwner: false,
    requireApprovalToken: false
  },
  'TOOL-TRUSTED-DEPLOY': {
    toolId: 'TOOL-TRUSTED-DEPLOY',
    name: 'Trusted Controller Protected Change Apply',
    description: 'Apply approved workflow or configuration change with TOCTOU verification.',
    projectScope: 'shared',
    risk: 'protected_system_change',
    requireOwner: true,
    requireApprovalToken: true,
    relatedWfId: 'WF-09'
  },
  'TOOL-CINEMATIC-SCENE': {
    toolId: 'TOOL-CINEMATIC-SCENE',
    name: 'Cinematic Story & Scene Planner',
    description: 'Create or validate story bible, character continuity, and scene plan.',
    projectScope: 'cinematic',
    risk: 'low_risk_write',
    requireOwner: false,
    requireApprovalToken: false
  }
};

export interface BrainOrchestrationPlan {
  detectedIntent: string;
  projectNamespace: 'assistant' | 'cinematic';
  selectedSkill: string;
  selectedTools: string[];
  selectedWorkflows: string[];
  approvalRequired: boolean;
  verificationPlan: string[];
}

export function buildPrimaryBrainPlan(
  userMessage: string,
  _projectId?: string | null,
  requestedSkill?: string
): BrainOrchestrationPlan {
  const lower = userMessage.toLowerCase();
  const isCinematic =
    /\b(cinematic|story bible|scene|character continuity|video render|shot|anime|episode)\b/i.test(
      lower
    );

  const projectNamespace: 'assistant' | 'cinematic' = isCinematic
    ? 'cinematic'
    : 'assistant';

  let detectedIntent = 'CHAT';
  const selectedTools: string[] = [];
  const selectedWorkflows: string[] = [];
  let approvalRequired = false;

  if (/\b(deploy|live update|production update|apply fix live)\b/i.test(lower)) {
    detectedIntent = 'UPDATE_LIVE_WORKFLOW';
    selectedTools.push('TOOL-TRUSTED-DEPLOY');
    selectedWorkflows.push('WF-09', 'WF-04', 'WF-08');
    approvalRequired = true;
  } else if (/\b(generate workflow|n8n banao|create workflow)\b/i.test(lower)) {
    detectedIntent = 'GENERATE_WORKFLOW';
    selectedTools.push('TOOL-WF-GENERATE', 'TOOL-WF-VALIDATE');
    selectedWorkflows.push('WF-02', 'WF-04');
  } else if (/\b(analyze|debug|error|audit workflow)\b/i.test(lower)) {
    detectedIntent = 'ANALYZE_WORKFLOW';
    selectedTools.push('TOOL-WF-ANALYZE', 'TOOL-COPILOT-DIAGNOSE');
    selectedWorkflows.push('WF-01');
  } else if (isCinematic) {
    detectedIntent = 'CINEMATIC_PRODUCTION';
    selectedTools.push('TOOL-CINEMATIC-SCENE');
  }

  return {
    detectedIntent,
    projectNamespace,
    selectedSkill:
      requestedSkill || (isCinematic ? 'cinematic_director' : 'ai_admin'),
    selectedTools,
    selectedWorkflows,
    approvalRequired,
    verificationPlan: approvalRequired
      ? [
          'Verify SHA-256 approval_token',
          'Check live resource TOCTOU fingerprint',
          'Validate post-execution state via WF-04'
        ]
      : ['Verify model output schema and redact secrets']
  };
}
