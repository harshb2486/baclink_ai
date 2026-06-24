import { MultiSourceSEO } from '../../services/seo/multi-source.js'
import { dbOps } from '../../services/storage/db.js'
import { BrowserAutomation } from '../../services/browser/automation.js'
import type { BacklinkProspect, ToolResult } from '../../types/index.js'
import { ModelRouter } from '../../services/llm/model-router.js'

export async function findProspects(
  niche: string,
  seo: MultiSourceSEO,
  llm: ModelRouter,
  browser: BrowserAutomation,
  limit = 20
): Promise<ToolResult> {
  try {
    const discovered = await seo.findProspects(niche, limit)
    const prospects: BacklinkProspect[] = []

    for (const item of discovered) {
      const score = await seo.getDomainScore(item.domain)
      const contacts = await seo.getDomainContacts(item.domain)

      let contactInfo = {
        emails: contacts.emails,
        phones: contacts.phones,
        social: contacts.social,
      }

      if (contactInfo.emails.length === 0) {
        try {
          const scraped = await browser.findContactInfo(`https://${item.domain}`)
          contactInfo = scraped
        } catch { /* noop */ }
      }

      const aiScore = await llm.execute('score_relevance', [
        { role: 'system', content: 'Score how relevant this domain is for backlink prospecting. Return JSON: { "relevance": 0-100, "reason": "..." }' },
        { role: 'user', content: `Domain: ${item.domain}\nNiche: ${niche}\nReason: ${item.reason}\nAuthority Score: ${score.authority}` },
      ])

      let relevance = 50
      try {
        const parsed = JSON.parse(aiScore)
        relevance = parsed.relevance ?? 50
      } catch { /* noop */ }

      dbOps.prospects.upsert({
        domain: item.domain,
        daScore: score.authority,
        spamScore: score.spamScore,
        relevance,
        source: 'ai_discovery',
        category: niche,
        contacts: JSON.stringify(contactInfo),
      })

      prospects.push({
        domain: item.domain,
        daScore: score.authority,
        relevanceScore: relevance,
        reason: item.reason,
        contactInfo,
        opportunities: ['backlink_request', 'guest_post', 'resource_add'],
      })
    }

    return {
      success: true,
      data: {
        niche,
        totalFound: prospects.length,
        prospects: prospects.sort((a, b) => b.relevanceScore - a.relevanceScore),
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
