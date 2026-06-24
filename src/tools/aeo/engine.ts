import { BrowserAutomation } from '../../services/browser/automation.js'
import { ModelRouter } from '../../services/llm/model-router.js'

interface AICitationResult {
  engine: string
  cited: boolean
  snippet: string | null
  confidence: number
}

interface LLMSValidation {
  exists: boolean
  content: string | null
  issues: string[]
  score: number
}

interface SchemaValidationResult {
  valid: boolean
  types: string[]
  errors: string[]
  suggestions: string[]
}

export class AEOEngine {
  private browser: BrowserAutomation
  private llm: ModelRouter

  constructor(browser: BrowserAutomation, llm: ModelRouter) {
    this.browser = browser
    this.llm = llm
  }

  async checkAICitations(domain: string, topic: string): Promise<{
    results: AICitationResult[]
    overallScore: number
    summary: string
  }> {
    const queries = [
      `What is the best content about ${topic}?`,
      `Tell me about ${topic}`,
      `Top resources for ${topic}`,
    ]

    const results: AICitationResult[] = []

    for (const query of queries) {
      const citationCheck = await this.llm.execute('analyze_competitor', [
        { role: 'system', content: `You are simulating an AI answer engine (like ChatGPT, Claude, or Perplexity). Given a topic, check if "${domain}" would likely be cited. Return JSON: { "cited": boolean, "snippet": "what would be said about them or null", "confidence": 0-100 }` },
        { role: 'user', content: `Topic: ${topic}\nDomain: ${domain}\nQuery: ${query}\n\nWould you cite this domain in your answer?` },
      ])

      try {
        const parsed = JSON.parse(citationCheck)
        results.push({
          engine: query.substring(0, 40),
          cited: parsed.cited ?? false,
          snippet: parsed.snippet ?? null,
          confidence: parsed.confidence ?? 0,
        })
      } catch {
        results.push({ engine: query.substring(0, 40), cited: false, snippet: null, confidence: 0 })
      }
    }

    const citedResults = results.filter(r => r.cited)
    const overallScore = results.length > 0 ? Math.round((citedResults.length / results.length) * 100) : 0

    const summary = await this.llm.execute('summarize_report', [
      { role: 'system', content: 'Summarize the AI citation analysis results. Be concise and actionable.' },
      { role: 'user', content: `Domain: ${domain}\nTopic: ${topic}\nResults: ${JSON.stringify(results)}` },
    ])

    return { results, overallScore, summary }
  }

  async validateSchema(url: string): Promise<SchemaValidationResult> {
    try {
      const pageInfo = await this.browser.getPageInfo(url)
      const jsonldMatch = pageInfo.text.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
      const jsonldBlocks: string[] = []

      if (jsonldMatch) {
        for (const block of jsonldMatch) {
          const content = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
          try {
            JSON.parse(content)
            jsonldBlocks.push(content)
          } catch { /* invalid JSON-LD */ }
        }
      }

      const validation = await this.llm.execute('classify_prospect', [
        { role: 'system', content: `Validate the JSON-LD structured data on this page. Return JSON: { "types": string[], "errors": string[], "suggestions": string[], "valid": boolean }` },
        { role: 'user', content: `URL: ${url}\n\nJSON-LD blocks found: ${jsonldBlocks.length}\n\nContent: ${jsonldBlocks.join('\n---\n')}` },
      ])

      let parsed: SchemaValidationResult = { valid: false, types: [], errors: ['Failed to parse'], suggestions: [] }
      try { parsed = JSON.parse(validation) } catch { /* use default */ }

      return parsed
    } catch (err: any) {
      return { valid: false, types: [], errors: [err?.message ?? 'Unknown error'], suggestions: [] }
    }
  }

  async generateLLMS(domain: string, pages?: string): Promise<LLMSValidation> {
    try {
      const urls = pages ? pages.split(',').map(p => p.trim()).filter(Boolean) : ['/', '/about', '/blog', '/contact']

      const existing = await this.browser.getPageInfo(`https://${domain}/llms.txt`).catch(() => null)

      const llmsContent = await this.llm.execute('generate_content', [
        { role: 'system', content: `Generate an llms.txt file for ${domain}. llms.txt is the AI equivalent of robots.txt — it tells AI crawlers and LLMs about your site's content. Follow the llms.txt spec: first line is the site title, then sections with H2 headings, each entry is a markdown link with optional description. Include important pages and a brief summary of what the site offers.` },
        { role: 'user', content: `Domain: ${domain}\nKey pages: ${urls.join(', ')}` },
      ])

      const cleaned = llmsContent.replace(/```/g, '').trim()
      const issues: string[] = []

      if (existing && existing.statusCode === 200) {
        issues.push('/llms.txt already exists — review and replace')
      }

      return {
        exists: existing?.statusCode === 200,
        content: cleaned,
        issues,
        score: existing?.statusCode === 200 ? 100 : 0,
      }
    } catch (err: any) {
      return { exists: false, content: null, issues: [err?.message ?? 'Unknown error'], score: 0 }
    }
  }
}