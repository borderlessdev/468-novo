/**
 * Envio de e-mail de convite via Resend.
 * Destinatário = e-mail gravado no convite (nunca vindo do cliente).
 *
 * functions/.env: RESEND_API_KEY, RESEND_FROM (opcional), APP_ORIGIN
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { escapeEmailHtml, sendResendEmail } from './resendEmail'

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'administrador da empresa',
  team: 'funcionário (equipe)',
  client: 'cliente',
  user: 'usuário',
}

export const sendInviteEmail = onCall<{ inviteId?: string; origin?: string }>(
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
    const inviteId = String(request.data?.inviteId ?? '').trim()
    if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId obrigatório.')

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'RESEND_API_KEY não configurada.')
    }

    const db = getFirestore()
    const snap = await db.collection('invites').doc(inviteId).get()
    if (!snap.exists) throw new HttpsError('not-found', 'Convite não encontrado.')
    const invite = snap.data() ?? {}

    const token = request.auth.token ?? {}
    const allowed =
      invite.createdBy === request.auth.uid ||
      token.admin === true ||
      token.platformAdmin === true
    if (!allowed) {
      throw new HttpsError('permission-denied', 'Sem permissão para enviar este convite.')
    }
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Convite não está pendente.')
    }

    const to = String(invite.email ?? '').trim()
    if (!to) throw new HttpsError('failed-precondition', 'Convite sem e-mail.')

    const origin = (
      process.env.APP_ORIGIN || String(request.data?.origin ?? '')
    ).replace(/\/+$/, '')
    const link = `${origin}/cadastro?invite=${encodeURIComponent(String(invite.token))}`

    let orgName = ''
    if (invite.orgId) {
      const org = await db.collection('organizations').doc(String(invite.orgId)).get()
      orgName = String(org.data()?.name ?? '')
    }

    const role = ROLE_LABELS[String(invite.role)] ?? 'usuário'
    const department = invite.department ? String(invite.department) : ''
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2>Convite — Promover Experience</h2>
        <p>Você foi convidado como <strong>${escapeEmailHtml(role)}</strong>${
          orgName ? ` da empresa <strong>${escapeEmailHtml(orgName)}</strong>` : ''
        }.</p>
        ${department ? `<p>Setor: ${escapeEmailHtml(department)}</p>` : ''}
        <p><a href="${escapeEmailHtml(link)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Aceitar convite</a></p>
        <p style="font-size:13px;color:#555">Se ainda não tem conta, crie uma senha. Este convite expira em 14 dias.<br>Link: ${escapeEmailHtml(link)}</p>
      </div>`

    try {
      const result = await sendResendEmail({
        to,
        subject: 'Convite — Promover Experience',
        html,
        text: `Você foi convidado para o Promover Experience. Aceite o convite: ${link}`,
        kind: 'invite',
        createdBy: request.auth.uid,
        visitId: invite.visitId ? String(invite.visitId) : undefined,
        dedupeKey: `invite:${inviteId}`,
      })
      return { ok: true, id: result.id, to }
    } catch (error) {
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Falha ao enviar e-mail.')
    }
  },
)
