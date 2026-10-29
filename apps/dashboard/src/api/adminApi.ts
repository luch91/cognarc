import { supabase } from './supabaseClient.js'
import { validateDecision, validateIntegration } from './adminValidation.js'
import type { IntegrationProvider } from './adminValidation.js'
export { INTEGRATION_PROVIDERS } from './adminValidation.js'
export type { IntegrationProvider } from './adminValidation.js'

export interface AdminApproval {
  id: string
  workspace_id: string
  action_type: string
  description: string
  evidence: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewer_id: string | null
  justification: string | null
  decided_at: string | null
}

export interface AdminAuditEvent {
  id: string
  workspace_id: string
  actor_id: string | null
  event_type: string
  subject_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface AdminIntegration {
  id: string
  workspace_id: string
  provider: IntegrationProvider
  label: string
  public_reference: string
  status: 'pending_verification' | 'disabled'
  updated_at: string
  created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase authentication and database are not configured')
  return supabase
}

export async function listAdminApprovals(workspaceId: string): Promise<AdminApproval[]> {
  const { data, error } = await client().from('admin_approvals')
    .select('id,workspace_id,action_type,description,evidence,status,created_at,reviewer_id,justification,decided_at')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as AdminApproval[]
}

export async function decideAdminApproval(
  workspaceId: string, approvalId: string, decision: 'approved' | 'rejected', justification: string,
): Promise<AdminApproval> {
  validateDecision(decision, justification)
  const { data, error } = await client().rpc('admin_decide_approval', {
    p_workspace_id: workspaceId, p_approval_id: approvalId,
    p_decision: decision, p_justification: justification.trim(),
  })
  if (error) throw error
  if (!data || data.status !== decision || data.id !== approvalId || data.workspace_id !== workspaceId) {
    throw new Error('Database did not confirm an authoritative approval transition')
  }
  return data as AdminApproval
}

export async function listAdminAudit(workspaceId: string): Promise<AdminAuditEvent[]> {
  const { data, error } = await client().from('admin_audit_events')
    .select('id,workspace_id,actor_id,event_type,subject_id,payload,created_at')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as AdminAuditEvent[]
}

export async function listAdminIntegrations(workspaceId: string): Promise<AdminIntegration[]> {
  const { data, error } = await client().from('admin_integrations')
    .select('id,workspace_id,provider,label,public_reference,status,created_at,updated_at')
    .eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as AdminIntegration[]
}

export async function saveAdminIntegration(
  workspaceId: string, provider: IntegrationProvider, label: string, publicReference: string,
): Promise<AdminIntegration> {
  validateIntegration(provider, label, publicReference)
  const { data, error } = await client().rpc('admin_save_integration', {
    p_workspace_id: workspaceId, p_provider: provider,
    p_label: label.trim(), p_public_reference: publicReference,
  })
  if (error) throw error
  if (!data || data.workspace_id !== workspaceId || data.status !== 'pending_verification') {
    throw new Error('Database did not confirm a pending integration')
  }
  return data as AdminIntegration
}

export async function disableAdminIntegration(workspaceId: string, integrationId: string): Promise<void> {
  const { data, error } = await client().rpc('admin_disable_integration', {
    p_workspace_id: workspaceId, p_integration_id: integrationId,
  })
  if (error) throw error
  if (!data || data.id !== integrationId || data.workspace_id !== workspaceId ||
      data.status !== 'disabled') throw new Error('Database did not confirm the disabled integration')
}
