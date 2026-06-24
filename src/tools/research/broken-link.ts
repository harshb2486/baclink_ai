import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps } from '../../services/storage/db.js'
import type { BrokenLinkOpportunity, ToolResult } from '../../types/index.js'

export async function findBrokenLinks(
  targetDomain: string,
  browser: BrowserAutomation,
  llm: ModelRouter,
  yourContentSummary: string
): Promise<ToolResult> {
  try {
    const siteInfo = await browser.getPageInfo(`https://${targetDomain}`)
    const resourceLinks = siteInfo.links.filter(l =>
      l.includes('/resource') || l.includes('/blog') || l.includes('/articles') ||
      l.includes('/guides') || l.includes('/tutorials') || l.includes('/links')
    )

    const baseUrl = `https://${targetDomain}`
    const resourcePages = resourceLinks.length > 0 ? resourceLinks.slice(0, 10) : [baseUrl]
    const opportunities: BrokenLinkOpportunity[] = []

    for (const pageUrl of resourcePages) {
      try {
        const pageInfo = await browser.getPageInfo(pageUrl)
        const brokenChecks = await Promise.allSettled(
          pageInfo.links.slice(0, 50).map(async (link) => {
            const alive = await browser.checkLinkAlive(link)
            return { url: link, alive }
          })
        )

        for (const result of brokenChecks) {
          if (result.status === 'fulfilled' && !result.value.alive) {
            const suggestion = await llm.execute('classify_prospect', [
              { role: 'system', content: 'Given the broken URL and our content summary, explain how our content could replace it. Be specific. Return JSON: { "relevance": "high|medium|low", "suggestion": "..." }' },
              { role: 'user', content: `Broken URL: ${result.value.url}\nOur Content: ${yourContentSummary.substring(0, 1000)}` },
            ])

            let suggestionText = ''
            try {
              const parsed = JSON.parse(suggestion)
              if (parsed.relevance === 'high' || parsed.relevance === 'medium') {
                suggestionText = parsed.suggestion
              }
            } catch {
              suggestionText = suggestion
            }

            if (suggestionText) {
              opportunities.push({
                sourceUrl: pageUrl,
                brokenUrl: result.value.url,
                anchorText: null,
                daScore: null,
                suggestedReplacement: suggestionText,
              })
            }
          }
        }
      } catch { continue }
    }

    return {
      success: true,
      data: {
        targetDomain,
        totalBroken: opportunities.length,
        opportunities,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
