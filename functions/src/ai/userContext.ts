/**
 * Resolve o papel do usuário autenticado para contextualizar o assistente.
 * Fonte: custom claims + users/{uid} + membership da org (quando houver).
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export type AssistantAudience =
  | 'admin_master'
  | 'org_admin'
  | 'user'
  | 'team'
  | 'client'

export interface AssistantUserContext {
  audience: AssistantAudience
  /** Rótulo em PT para o prompt */
  label: string
  orgId?: string
  orgName?: string
  /** Capacidades resumidas para o modelo */
  canDo: string[]
  cannotDo: string[]
}

function ensureAdmin() {
  if (getApps().length === 0) initializeApp()
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function buildContext(
  audience: AssistantAudience,
  extras?: { orgId?: string; orgName?: string },
): AssistantUserContext {
  const base = {
    orgId: extras?.orgId,
    orgName: extras?.orgName,
  }

  switch (audience) {
    case 'admin_master':
      return {
        ...base,
        audience,
        label: 'Admin Master (plataforma)',
        canDo: [
          'criar e gerenciar pastas/empresas',
          'definir whitelabel de qualquer pasta',
          'criar/convidar Admin da empresa',
          'entrar no sistema de qualquer pasta',
          'acesso total a visitas, relatórios, configurações e playbooks',
        ],
        cannotDo: [],
      }
    case 'org_admin':
      return {
        ...base,
        audience,
        label: 'Admin da empresa',
        canDo: [
          'convidar e remover usuários da própria empresa',
          'definir whitelabel (logo) da própria pasta',
          'criar/editar visitas, playbooks, financeiro e relatórios da pasta',
          'gerar links do portal e aplicar cadastros',
          'conectar Google Calendar e gerenciar Configurações da pasta',
        ],
        cannotDo: [
          'criar outras pastas/empresas (só Admin Master)',
          'gerenciar pastas de outros clientes',
        ],
      }
    case 'team':
      return {
        ...base,
        audience,
        label: 'Equipe / funcionário',
        canDo: [
          'operar visitas, programação, visitantes e planejamento conforme permissões',
          'usar o portal (gerar/copiar link) se tiver escrita',
          'consultar assistente e dashboard',
        ],
        cannotDo: [
          'convidar usuários / gerenciar equipe (Admin da empresa ou Master)',
          'alterar whitelabel / logo da empresa (Admin da empresa ou Master)',
          'criar pastas (só Admin Master)',
          'aprovar itens financeiros (dono da visita ou Admin)',
          'acessar Pastas de clientes /empresas (só Admin Master)',
        ],
      }
    case 'client':
      return {
        ...base,
        audience,
        label: 'Cliente',
        canDo: [
          'ver visitas e programação liberadas',
          'acompanhar agenda e assistente de ajuda',
        ],
        cannotDo: [
          'criar/editar visitas, visitantes, financeiro ou playbooks',
          'gerar links do portal',
          'convidar usuários ou alterar whitelabel',
          'acessar relatórios sensíveis e lixeira',
        ],
      }
    case 'user':
    default:
      return {
        ...base,
        audience: 'user',
        label: 'Usuário operacional',
        canDo: [
          'criar e gerenciar visitas próprias',
          'programação, visitantes, planejamento e financeiro das visitas',
          'gerar links do portal e aplicar cadastros',
        ],
        cannotDo: [
          'convidar usuários da empresa (Admin da empresa ou Master)',
          'alterar whitelabel / logo (Admin da empresa ou Master)',
          'criar pastas (só Admin Master)',
          'gerenciar playbooks globais se a UI restringir ao admin',
        ],
      }
  }
}

/**
 * Monta o bloco de contexto de papel para o system prompt.
 */
export function formatRolePromptBlock(ctx: AssistantUserContext): string {
  const lines = [
    '## Papel do usuário atual (OBRIGATÓRIO respeitar)',
    `Papel: ${ctx.label}`,
    ctx.orgName ? `Empresa/pasta ativa: ${ctx.orgName}` : null,
    '',
    'Este usuário PODE:',
    ...ctx.canDo.map((item) => `- ${item}`),
  ]
  if (ctx.cannotDo.length > 0) {
    lines.push('', 'Este usuário NÃO PODE (não oriente como se ele pudesse):')
    lines.push(...ctx.cannotDo.map((item) => `- ${item}`))
  }
  lines.push(
    '',
    'Regras de resposta por papel:',
    '- Se perguntarem como fazer algo que só Admin Master ou Admin da empresa faz, diga claramente que só esse perfil pode fazer e indique quem pedir (ex.: “Peça ao Admin da empresa” ou “Só o Admin Master sob Pastas de clientes”).',
    '- Não invente atalho para o funcionário/cliente contornar a restrição.',
    '- Adapte os passos ao que ESTE papel vê no menu (cliente não tem Visitantes/Financeiro/Relatórios).',
  )
  return lines.filter((line) => line !== null).join('\n')
}

export async function resolveAssistantUserContext(
  uid: string,
): Promise<AssistantUserContext> {
  ensureAdmin()
  const auth = getAuth()
  const db = getFirestore()

  let isPlatformAdmin = false
  try {
    const user = await auth.getUser(uid)
    const claims = user.customClaims ?? {}
    isPlatformAdmin = claims.admin === true || claims.platformAdmin === true
  } catch {
    // segue com perfil Firestore
  }

  if (isPlatformAdmin) {
    return buildContext('admin_master')
  }

  const userSnap = await db.collection('users').doc(uid).get()
  const userData = userSnap.data() ?? {}
  const profileRole = asString(userData.role) || 'user'
  const profileOrgId = asString(userData.orgId) || undefined

  let orgRole = ''
  let orgId = profileOrgId
  let orgName: string | undefined

  const memberId = orgId ? `${orgId}_${uid}` : ''
  if (memberId) {
    const memberSnap = await db.collection('organizationMembers').doc(memberId).get()
    if (memberSnap.exists) {
      orgRole = asString(memberSnap.data()?.orgRole)
    }
  }

  if (!orgRole) {
    const byUid = await db
      .collection('organizationMembers')
      .where('uid', '==', uid)
      .limit(1)
      .get()
    if (!byUid.empty) {
      const data = byUid.docs[0].data()
      orgRole = asString(data.orgRole)
      orgId = asString(data.orgId) || orgId
    }
  }

  if (orgId) {
    const orgSnap = await db.collection('organizations').doc(orgId).get()
    orgName = asString(orgSnap.data()?.name) || undefined
  }

  if (orgRole === 'org_admin') {
    return buildContext('org_admin', { orgId, orgName })
  }
  if (orgRole === 'team' || profileRole === 'team') {
    return buildContext('team', { orgId, orgName })
  }
  if (orgRole === 'client' || profileRole === 'client') {
    return buildContext('client', { orgId, orgName })
  }

  return buildContext('user', { orgId, orgName })
}
