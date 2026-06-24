import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps, getStore } from '../../services/storage/db.js'
import type { ToolResult } from '../../types/index.js'

export async function handleReply(
  emailId: string,
  replyBody: string,
  llm: ModelRouter,
  campaignSite: string
): Promise<ToolResult> {
  try {
    const email = getStore().outreachEmails[emailId]
    if (!email) return { success: false, error: `Email ${emailId} not found` }

    const sentiment = await llm.execute('classify_prospect', [
      { role: 'system', content: `Analyze the sentiment of this email reply. Return JSON: { "sentiment": "positive|neutral|negative", "intent": "interested|not_interested|questions|negotiating|other", "summary": "..." }` },
      { role: 'user', content: replyBody },
    ])

    let parsedSentiment: { sentiment?: string; intent?: string; summary?: string } = {}
    try { parsedSentiment = JSON.parse(sentiment) } catch { parsedSentiment = { sentiment: 'neutral', intent: 'other', summary: replyBody.substring(0, 200) } }

    if (parsedSentiment.sentiment === 'negative') {
      dbOps.emails.updateStatus(emailId, 'replied')
      return {
        success: true,
        data: {
          sentiment: 'negative',
          suggestedAction: 'Do not send follow-up. Move to lost.',
          suggestedReply: null,
        },
      }
    }

    if (parsedSentiment.intent === 'interested' || parsedSentiment.intent === 'questions' || parsedSentiment.intent === 'negotiating') {
      const draftReply = await llm.execute('negotiate_reply', [
        { role: 'system', content: `You are a skilled backlink negotiator. Draft a reply to their email. Be professional, helpful, and persuasive. If they have questions, answer them clearly. If they want to negotiate terms, be flexible but know your value. Keep it under 150 words.` },
        { role: 'user', content: `Their reply: ${replyBody}\n\nOur site: ${campaignSite}\nSentiment: ${parsedSentiment.sentiment}\nIntent: ${parsedSentiment.intent}\n\nOriginal email subject: ${email.subject}` },
      ])

      dbOps.emails.updateStatus(emailId, 'replied')

      return {
        success: true,
        data: {
          sentiment: parsedSentiment.sentiment,
          intent: parsedSentiment.intent,
          summary: parsedSentiment.summary,
          suggestedReply: draftReply,
          suggestedAction: 'Review and send the suggested reply',
        },
      }
    }

    dbOps.emails.updateStatus(emailId, 'replied')
    return {
      success: true,
      data: {
        sentiment: parsedSentiment.sentiment,
        intent: parsedSentiment.intent,
        summary: parsedSentiment.summary,
        suggestedAction: 'Not interested. Move to lost.',
        suggestedReply: null,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
