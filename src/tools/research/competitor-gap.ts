import { MultiSourceSEO } from '../../services/seo/multi-source.js'
import { dbOps } from '../../services/storage/db.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import type { CompetitorGap, ToolResult } from '../../types/index.js'

export async function analyzeCompetitorGap(
  yourDomain: string,
  competitorDomain: string,
  seo: MultiSourceSEO,
  llm: ModelRouter
): Promise<ToolResult> {
  try {
    const gapData = await seo.getCompetitorGap(yourDomain, competitorDomain)
    const intersect = await seo.getLinkIntersect(yourDomain, competitorDomain)

    const gaps: CompetitorGap[] = []

    for (const item of gapData) {
      const aiReason = await llm.execute('analyze_competitor', [
        { role: 'system', content: 'Explain why this referring domain matters and how to get a backlink from them. Return JSON: { "opportunity": "explanation", "approach": "guest_post|resource|broken_link|citation" }' },
        { role: 'user', content: `Competitor: ${competitorDomain}\nReferring Domain: ${item.referringDomain}\nDA: ${item.daScore}\nURL: ${item.targetUrl}` },
      ])

      let opportunity = ''
      try {
        const parsed = JSON.parse(aiReason)
        opportunity = parsed.opportunity ?? aiReason
      } catch {
        opportunity = aiReason
      }

      dbOps.prospects.upsert({
        domain: item.referringDomain,
        daScore: item.daScore,
        relevance: 70,
        source: 'competitor_gap',
        category: competitorDomain,
      })

      gaps.push({
        competitorDomain,
        referringDomain: item.referringDomain,
        daScore: item.daScore,
        targetUrl: item.targetUrl,
        anchorText: null,
        opportunity,
      })
    }

    return {
      success: true,
      data: {
        yourDomain,
        competitorDomain,
        totalGaps: gaps.length,
        commonDomains: intersect,
        gaps: gaps.sort((a, b) => (b.daScore ?? 0) - (a.daScore ?? 0)),
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
