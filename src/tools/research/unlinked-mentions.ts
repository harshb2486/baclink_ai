import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import { dbOps } from '../../services/storage/db.js'
import type { ToolResult } from '../../types/index.js'

export async function findUnlinkedMentions(
  brandName: string,
  browser: BrowserAutomation,
  llm: ModelRouter,
  limit = 50
): Promise<ToolResult> {
  try {
    const searchUrl = `https://www.google.com/search?q="${brandName}"+-site:${brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com&num=${limit}`
    let sources: string[] = []
    try {
      const pageInfo = await browser.getPageInfo(searchUrl)
      sources = pageInfo.links.filter(l =>
        l.startsWith('http') &&
        !l.includes('google.com') &&
        !l.includes('youtube.com') &&
        !l.includes('accounts.google')
      ).slice(0, limit)
    } catch {
      sources = [`https://www.bing.com/search?q=%22${encodeURIComponent(brandName)}%22`]
    }

    const mentions: Array<{ sourceUrl: string; pageTitle: string | null; hasLink: boolean }> = []

    for (const url of sources.slice(0, 20)) {
      try {
        const pageInfo = await browser.getPageInfo(url)
        const text = pageInfo.text
        const containsBrand = text.toLowerCase().includes(brandName.toLowerCase())
        const linksToBrand = pageInfo.links.some(l =>
          l.toLowerCase().includes(brandName.toLowerCase().replace(/[^a-z0-9]/g, ''))
        )

        if (containsBrand) {
          dbOps.mentions.upsert({
            brand: brandName,
            sourceUrl: url,
            pageTitle: pageInfo.title,
            hasLink: linksToBrand,
          })

          mentions.push({
            sourceUrl: url,
            pageTitle: pageInfo.title,
            hasLink: linksToBrand,
          })
        }
      } catch { continue }
    }

    const unlinked = mentions.filter(m => !m.hasLink)

    return {
      success: true,
      data: {
        brand: brandName,
        totalMentions: mentions.length,
        unlinkedMentions: unlinked.length,
        mentions: unlinked.slice(0, 25),
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
