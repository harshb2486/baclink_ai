import { BrowserAutomation } from '../browser/automation.js'
import { ModelRouter } from '../llm/model-router.js'

export interface CrawlResult {
  url: string
  title: string | null
  statusCode: number
  contentType: string | null
  wordCount: number
  titleLength: number
  metaDescription: string | null
  metaDescriptionLength: number
  h1Count: number
  h2Count: number
  canonical: string | null
  noindex: boolean
  hasSchemaOrg: boolean
  hasOpenGraph: boolean
  hasTwitterCard: boolean
  imagesWithoutAlt: number
  internalLinks: number
  externalLinks: number
  responseTimeMs: number
  contentHash: string
  issues: string[]
}

export interface CrawlSession {
  id: string
  seedUrl: string
  totalPages: number
  crawledPages: number
  status: 'running' | 'completed' | 'failed'
  results: CrawlResult[]
  startTime: string
  endTime: string | null
  summary: CrawlSummary
}

export interface CrawlSummary {
  totalPages: number
  totalIssues: number
  brokenLinks: number
  redirects: number
  slowPages: number
  thinContent: number
  missingMeta: number
  missingAlt: number
  noindexPages: number
  avgWordCount: number
  avgResponseTime: number
}

export class SEOCrawler {
  private browser: BrowserAutomation
  private llm: ModelRouter
  private sessions: Map<string, CrawlSession> = new Map()

  constructor(browser: BrowserAutomation, llm: ModelRouter) {
    this.browser = browser
    this.llm = llm
  }

  async crawlSite(url: string, maxPages = 100): Promise<CrawlSession> {
    const sessionId = crypto.randomUUID()
    const seedUrl = url.startsWith('http') ? url : `https://${url}`

    const session: CrawlSession = {
      id: sessionId,
      seedUrl,
      totalPages: 0,
      crawledPages: 0,
      status: 'running',
      results: [],
      startTime: new Date().toISOString(),
      endTime: null,
      summary: {
        totalPages: 0, totalIssues: 0, brokenLinks: 0, redirects: 0,
        slowPages: 0, thinContent: 0, missingMeta: 0, missingAlt: 0,
        noindexPages: 0, avgWordCount: 0, avgResponseTime: 0,
      },
    }

    this.sessions.set(sessionId, session)
    const baseHostname = new URL(seedUrl).hostname
    const visited = new Set<string>()
    const queue: string[] = [seedUrl]
    const actualMax = Math.min(maxPages, 500)

    while (queue.length > 0 && visited.size < actualMax) {
      const currentUrl = queue.shift()!
      if (visited.has(currentUrl)) continue
      visited.add(currentUrl)

      try {
        const startTime = Date.now()
        const pageInfo = await this.browser.getPageInfo(currentUrl)
        const responseTime = Date.now() - startTime

        const issues: string[] = []
        if (!pageInfo.title) issues.push('Missing title tag')
        if (pageInfo.title && pageInfo.title.length > 60) issues.push('Title too long')
        if (pageInfo.title && pageInfo.title.length < 30) issues.push('Title too short')
        if (!pageInfo.description) issues.push('Missing meta description')
        if (pageInfo.description && pageInfo.description.length > 160) issues.push('Meta description too long')
        if (pageInfo.description && pageInfo.description.length < 50) issues.push('Meta description too short')
        if (pageInfo.statusCode >= 400) issues.push(`HTTP ${pageInfo.statusCode}`)
        if (pageInfo.statusCode >= 300 && pageInfo.statusCode < 400) issues.push('Redirect detected')
        if (responseTime > 3000) issues.push('Slow response time (>3s)')
        if (pageInfo.text.split(' ').length < 200) issues.push('Thin content (<200 words)')
        if (pageInfo.text.split(' ').length < 50) issues.push('Very thin content (<50 words)')

        const internalLinks = pageInfo.links.filter(l => {
          try { return new URL(l).hostname === baseHostname } catch { return false }
        })
        const externalLinks = pageInfo.links.filter(l => {
          try { return new URL(l).hostname !== baseHostname } catch { return false }
        })

        const result: CrawlResult = {
          url: currentUrl,
          title: pageInfo.title,
          statusCode: pageInfo.statusCode,
          contentType: null,
          wordCount: pageInfo.text.split(' ').length,
          titleLength: pageInfo.title?.length ?? 0,
          metaDescription: pageInfo.description,
          metaDescriptionLength: pageInfo.description?.length ?? 0,
          h1Count: (pageInfo.text.match(/# /g) ?? []).length,
          h2Count: (pageInfo.text.match(/## /g) ?? []).length,
          canonical: null,
          noindex: pageInfo.text.includes('noindex'),
          hasSchemaOrg: pageInfo.text.includes('application/ld+json'),
          hasOpenGraph: pageInfo.text.includes('og:'),
          hasTwitterCard: pageInfo.text.includes('twitter:'),
          imagesWithoutAlt: 0,
          internalLinks: internalLinks.length,
          externalLinks: externalLinks.length,
          responseTimeMs: responseTime,
          contentHash: '',
          issues,
        }

        session.results.push(result)
        session.crawledPages = visited.size

        for (const link of internalLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link)
          }
        }

        await new Promise(r => setTimeout(r, 200))
      } catch { continue }
    }

    session.status = 'completed'
    session.endTime = new Date().toISOString()
    session.totalPages = visited.size

    const allIssues = session.results.flatMap(r => r.issues)
    const totalWordCount = session.results.reduce((s, r) => s + r.wordCount, 0)
    const totalResponseTime = session.results.reduce((s, r) => s + r.responseTimeMs, 0)

    session.summary = {
      totalPages: session.results.length,
      totalIssues: allIssues.length,
      brokenLinks: allIssues.filter(i => i.includes('HTTP 4') || i.includes('HTTP 5')).length,
      redirects: allIssues.filter(i => i.includes('Redirect')).length,
      slowPages: allIssues.filter(i => i.includes('Slow')).length,
      thinContent: allIssues.filter(i => i.includes('thin')).length,
      missingMeta: allIssues.filter(i => i.includes('Missing')).length,
      missingAlt: 0,
      noindexPages: session.results.filter(r => r.noindex).length,
      avgWordCount: session.results.length > 0 ? Math.round(totalWordCount / session.results.length) : 0,
      avgResponseTime: session.results.length > 0 ? Math.round(totalResponseTime / session.results.length) : 0,
    }

    return session
  }

  getSession(id: string): CrawlSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): CrawlSession[] {
    return Array.from(this.sessions.values())
  }
}
