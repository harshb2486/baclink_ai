import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps } from '../../services/storage/db.js'
import type { ToolResult } from '../../types/index.js'
import { MultiSourceSEO } from '../../services/seo/multi-source.js'

export async function findGuestPostOpportunities(
  niche: string,
  seo: MultiSourceSEO,
  browser: BrowserAutomation,
  llm: ModelRouter,
  limit = 30
): Promise<ToolResult> {
  try {
    const searchTerms = [
      `"write for us" ${niche}`,
      `"guest post" ${niche}`,
      `"guest article" ${niche}`,
      `"submit a guest post" ${niche}`,
      `"become a contributor" ${niche}`,
      `"contribute to" ${niche}`,
      `"write for" ${niche}`,
    ]

    const opportunities: Array<{
      domain: string
      guestPostUrl: string
      daScore: number | null
      guidelines: string
      topics: string[]
    }> = []

    const checkedDomains = new Set<string>()

    for (const term of searchTerms.slice(0, 4)) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(term)}&num=10`
      try {
        const pageInfo = await browser.getPageInfo(searchUrl)
        const urls = pageInfo.links.filter(l =>
          l.startsWith('http') && !l.includes('google.com') && !l.includes('youtube.com')
        )

        for (const url of urls.slice(0, 10)) {
          try {
            const domain = new URL(url).hostname.replace('www.', '')
            if (checkedDomains.has(domain)) continue
            checkedDomains.add(domain)

            const gpInfo = await browser.getPageInfo(url)
            const guidelines = gpInfo.text.substring(0, 2000)

            if (guidelines.includes('guest') || guidelines.includes('write') || guidelines.includes('submit') || guidelines.includes('contribute')) {
              const score = await seo.getDomainScore(domain)
              const aiTopics = await llm.execute('classify_prospect', [
                { role: 'system', content: 'Extract 3-5 suggested guest post topics from the guidelines. Return JSON: { "topics": ["topic1", "topic2"] }' },
                { role: 'user', content: `Guidelines: ${guidelines.substring(0, 1500)}` },
              ])

              let topics: string[] = []
              try { const p = JSON.parse(aiTopics); topics = p.topics ?? [] } catch { topics = [niche] }

              dbOps.prospects.upsert({
                domain,
                daScore: score.authority,
                relevance: 85,
                source: 'guest_post_opportunity',
                category: niche,
              })

              opportunities.push({
                domain,
                guestPostUrl: url,
                daScore: score.authority,
                guidelines: guidelines.substring(0, 500),
                topics,
              })
            }
          } catch { continue }
        }
      } catch { continue }
    }

    return {
      success: true,
      data: {
        niche,
        totalOpportunities: opportunities.length,
        sites: opportunities.sort((a, b) => (b.daScore ?? 0) - (a.daScore ?? 0)),
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
