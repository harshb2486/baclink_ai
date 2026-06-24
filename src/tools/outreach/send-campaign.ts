import { EmailSender } from '../../services/email/sender.js'
import { dbOps } from '../../services/storage/db.js'
import type { ToolResult } from '../../types/index.js'

export async function sendCampaignEmails(
  campaignId: string,
  emailSender: EmailSender,
  variant: 'a' | 'b' | 'both' = 'both',
  throttleMs = 2000
): Promise<ToolResult> {
  try {
    const campaign = dbOps.campaigns.get(campaignId) as any
    if (!campaign) return { success: false, error: `Campaign ${campaignId} not found` }

    const emails = dbOps.emails.listByCampaign(campaignId) as any[]
    const toSend = emails.filter(e =>
      e.status === 'draft' &&
      (variant === 'both' || e.variant === variant)
    )

    if (toSend.length === 0) return { success: false, error: 'No draft emails to send' }

    const results: Array<{ emailId: string; to: string; success: boolean; error?: string }> = []
    let sent = 0
    let failed = 0

    for (const email of toSend) {
      let prospectEmail = ''

      if (email.prospect_id) {
        const allProspects = dbOps.prospects.listAll(1000) as any[]
        const p = allProspects.find((pr: any) => pr.id === email.prospect_id) as any
        if (p?.contacts_json) {
          const contacts = JSON.parse(p.contacts_json)
          prospectEmail = contacts.emails?.[0] ?? ''
        }
      }

      if (!prospectEmail) {
        dbOps.emails.updateStatus(email.id, 'failed', 'no recipient email')
        failed++
        results.push({ emailId: email.id, to: 'unknown', success: false, error: 'no recipient email' })
        continue
      }

      const result = await emailSender.sendEmail({
        to: prospectEmail,
        subject: email.subject,
        html: email.body_html,
        text: email.body_text,
      })

      if (result.success) {
        dbOps.emails.updateStatus(email.id, 'sent')
        sent++
      } else {
        dbOps.emails.updateStatus(email.id, 'failed', result.error)
        failed++
      }

      results.push({ emailId: email.id, to: prospectEmail, success: result.success, error: result.error })

      if (sent + failed < toSend.length) {
        await new Promise(r => setTimeout(r, throttleMs))
      }
    }

    return {
      success: true,
      data: {
        campaignId,
        total: toSend.length,
        sent,
        failed,
        results,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
