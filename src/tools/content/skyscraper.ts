import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import type { ToolResult } from '../../types/index.js'

export async function skyscraperContent(
  niche: string,
  yourAngle: string,
  browser: BrowserAutomation,
  llm: ModelRouter
): Promise<ToolResult> {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(niche + ' best guide tips')}&num=10`
    let topUrls: string[] = []

    try {
      const pageInfo = await browser.getPageInfo(searchUrl)
      topUrls = pageInfo.links.filter(l =>
        l.startsWith('http') && !l.includes('google.com') && !l.includes('youtube.com') &&
        !l.includes('accounts.google')
      ).slice(0, 5)
    } catch {
      topUrls = []
    }

    const topContent: Array<{
      url: string
      title: string
      wordCount: number
      keyPoints: string[]
      gaps: string[]
    }> = []

    for (const url of topUrls) {
      try {
        const pageInfo = await browser.getPageInfo(url)
        const analysis = await llm.execute('analyze_competitor', [
          { role: 'system', content: 'Analyze this content. Return JSON: { "wordCount": number, "keyPoints": string[], "gaps": string[], "qualityScore": 1-10 }' },
          { role: 'user', content: `URL: ${url}\nTitle: ${pageInfo.title}\n\nContent excerpt:\n${pageInfo.text.substring(0, 5000)}` },
        ])

        let parsed: { wordCount?: number; keyPoints?: string[]; gaps?: string[]; qualityScore?: number } = {}
        try { parsed = JSON.parse(analysis) } catch { /* noop */ }

        topContent.push({
          url,
          title: pageInfo.title ?? url,
          wordCount: pageInfo.text.split(' ').length,
          keyPoints: parsed.keyPoints ?? [],
          gaps: parsed.gaps ?? [],
        })
      } catch { continue }
    }

    const outline = await llm.execute('generate_content', [
      { role: 'system', content: `You are a content strategist. Create a detailed outline for a "skyscraper" article — significantly better than existing content on "${niche}". Our angle: ${yourAngle}. Include: title, H2s, H3s, key points per section, target keywords, and what makes this better than competitors. Be thorough.` },
      { role: 'user', content: `Top competing content analysis:\n${JSON.stringify(topContent, null, 2)}\n\nCreate the improved outline.` },
    ])

    const fullArticle = await llm.execute('generate_content', [
      { role: 'system', content: `Write a comprehensive, authoritative, well-researched article based on the outline. Make it genuinely better than anything currently ranking. Include data, examples, actionable advice. Aim for 2500-4000 words. Use markdown formatting.` },
      { role: 'user', content: `Outline:\n${outline}\n\nWrite the full article.` },
    ])

    return {
      success: true,
      data: {
        niche,
        competingContent: topContent,
        outline,
        articlePreview: fullArticle.substring(0, 2000),
        fullArticle,
        wordCount: fullArticle.split(' ').length,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
