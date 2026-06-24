import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps } from '../../services/storage/db.js'
import type { OutreachEmail, ToolResult } from '../../types/index.js'

export async function draftOutreachEmail(
  campaignId: string,
  prospectDomain: string,
  yourSite: string,
  yourValue: string,
  llm: ModelRouter,
  emailType: 'backlink_request' | 'guest_post' | 'broken_link' | 'resource_add' = 'backlink_request',
  extraContext = ''
): Promise<ToolResult> {
  try {
    const prospect = dbOps.prospects.findByDomain(prospectDomain) as any
    if (!prospect) return { success: false, error: `Prospect ${prospectDomain} not found in database` }

    const contacts = prospect.contacts_json ? JSON.parse(prospect.contacts_json) : null
    if (!contacts?.emails?.length) return { success: false, error: `No contact emails for ${prospectDomain}` }

    const prompts: Record<string, string> = {
      backlink_request: `Write a personalized email asking for a backlink. Explain why linking to ${yourSite} adds value for their audience. Be polite, specific, and make it easy for them. Mention specific content of theirs you appreciate.`,
      guest_post: `Write a personalized guest post pitch. Propose 2-3 specific topic ideas that would resonate with their audience. Show you understand their content. Include writing samples or credentials.`,
      broken_link: `Write a friendly email notifying them about a broken link on their site and suggesting your content as a replacement. Be helpful, not demanding. Include the specific broken URL and your suggested replacement.`,
      resource_add: `Write an email suggesting our resource should be added to their resource page. Explain why it's valuable for their readers. Be specific about which page and where it fits.`,
    }

    const systemPrompt = `You are an expert backlink outreach specialist. ${prompts[emailType] ?? prompts.backlink_request}
    Return JSON: { "subject": "...", "body_html": "...", "body_text": "..." }
    The email should be professional, personalized, and under 200 words.
    Include a clear call to action.`

    const result = await llm.execute('draft_outreach', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Prospect Domain: ${prospectDomain}
DA Score: ${prospect.da_score}
Our Site: ${yourSite}
Our Value: ${yourValue}
Prospect Details: The site appears relevant to ${prospect.category ?? 'our niche'}.
${extraContext ? `\nExtra Context: ${extraContext}` : ''}` },
    ])

    let parsed: { subject?: string; body_html?: string; body_text?: string } = {}
    try { parsed = JSON.parse(result) } catch {
      parsed = { subject: `Linking opportunity with ${prospectDomain}`, body_html: result, body_text: result }
    }

    const emailA: OutreachEmail = {
      id: crypto.randomUUID(),
      campaignId,
      prospectId: prospect.id,
      variant: 'a',
      subject: parsed.subject ?? `Question about ${prospectDomain}`,
      bodyHtml: parsed.body_html ?? result,
      bodyText: parsed.body_text ?? result.replace(/<[^>]+>/g, ''),
      sentAt: null,
      openedAt: null,
      repliedAt: null,
      status: 'draft',
      error: null,
    }

    const abResult = await llm.execute('draft_outreach', [
      { role: 'system', content: `${systemPrompt}\nMake this variant B — different angle, different subject line, different tone. Still professional and personalized.` },
      { role: 'user', content: `Prospect Domain: ${prospectDomain}\nDA: ${prospect.da_score}\nOur Site: ${yourSite}\nOur Value: ${yourValue}` },
    ])

    let parsedB: { subject?: string; body_html?: string; body_text?: string } = {}
    try { parsedB = JSON.parse(abResult) } catch { parsedB = parsed }

    const emailB: OutreachEmail = {
      id: crypto.randomUUID(),
      campaignId,
      prospectId: prospect.id,
      variant: 'b',
      subject: parsedB.subject ?? `Quick question about ${prospectDomain}`,
      bodyHtml: parsedB.body_html ?? abResult,
      bodyText: parsedB.body_text ?? abResult.replace(/<[^>]+>/g, ''),
      sentAt: null,
      openedAt: null,
      repliedAt: null,
      status: 'draft',
      error: null,
    }

    dbOps.emails.create(emailA)
    dbOps.emails.create(emailB)

    return {
      success: true,
      data: {
        prospectDomain,
        contactEmail: contacts.emails[0],
        variants: [emailA, emailB],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
