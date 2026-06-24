import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps } from '../../services/storage/db.js'
import type { ToolResult } from '../../types/index.js'

export async function scanRadar(
  niche: string,
  browser: BrowserAutomation,
  llm: ModelRouter
): Promise<ToolResult> {
  try {
    const feeds = [
      `https://news.google.com/rss/search?q=${encodeURIComponent(niche)}&hl=en-US&gl=US&ceid=US:en`,
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(niche)}&hitsPerPage=20`,
    ]

    const items: Array<{
      title: string
      url: string
      source: string
      summary: string
    }> = []

    for (const feed of feeds) {
      try {
        const pageInfo = await browser.getPageInfo(feed)
        items.push({
          title: pageInfo.title ?? 'Radar item',
          url: feed,
          source: new URL(feed).hostname,
          summary: pageInfo.text.substring(0, 500),
        })
      } catch { continue }
    }

    const relevantAlerts: Array<{
      type: string
      domain: string | null
      summary: string
      relevanceScore: number
    }> = []

    for (const item of items) {
      const analysis = await llm.execute('classify_prospect', [
        { role: 'system', content: `Determine if this item is relevant for backlink prospecting in the "${niche}" niche. Return JSON: { "relevant": boolean, "score": 0-100, "type": "new_site|trending_article|competitor_move|broken_page", "reason": "..." }` },
        { role: 'user', content: `Title: ${item.title}\nSource: ${item.source}\nSummary: ${item.summary.substring(0, 1000)}` },
      ])

      let parsed: { relevant?: boolean; score?: number; type?: string; reason?: string } = {}
      try { parsed = JSON.parse(analysis) } catch { continue }

      if (parsed.relevant && (parsed.score ?? 0) > 50) {
        dbOps.radar.insert({
          type: parsed.type ?? 'trending_article',
          source: item.source,
          domain: null,
          summary: parsed.reason ?? item.summary.substring(0, 300),
          relevanceScore: parsed.score ?? 50,
        })

        relevantAlerts.push({
          type: parsed.type ?? 'trending_article',
          domain: null,
          summary: parsed.reason ?? item.summary.substring(0, 300),
          relevanceScore: parsed.score ?? 50,
        })
      }
    }

    return {
      success: true,
      data: {
        niche,
        totalScanned: items.length,
        relevantAlerts: relevantAlerts.sort((a, b) => b.relevanceScore - a.relevanceScore),
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
