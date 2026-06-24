import axios from 'axios'
import type { SEOScore } from '../../types/index.js'

interface SEOSource {
  name: string
  priority: number
  free: boolean
  check: (domain: string) => Promise<SEOScore | null>
}

export class MultiSourceSEO {
  private sources: SEOSource[] = []
  private apiKeys: Record<string, string> = {}

  constructor(apiKeys: Record<string, string> = {}) {
    this.apiKeys = apiKeys
    this.initSources()
  }

  private initSources(): void {
    const sources: SEOSource[] = [
      {
        name: 'crawly',
        priority: 1,
        free: true,
        check: async (domain) => {
          if (!this.apiKeys.crawly) return null
          try {
            const { data } = await axios.get('https://api.getcrawly.com/api/v1/domain-authority', {
              params: { domain, key: this.apiKeys.crawly }
            })
            if (data?.authority_score == null) return null
            return { domain, authority: data.authority_score, backlinks: data.total_backlinks ?? null, referringDomains: data.referring_domains ?? null, spamScore: data.spam_score ?? null, source: 'crawly' }
          } catch { return null }
        }
      },
      {
        name: 'seomcp',
        priority: 2,
        free: true,
        check: async (domain) => {
          if (!this.apiKeys.seomcp) return null
          try {
            const { data } = await axios.get(`https://seomcp.io/api/v1/domain/${domain}`, {
              headers: { 'X-API-Key': this.apiKeys.seomcp }
            })
            if (!data?.domain_rank) return null
            return { domain, authority: data.domain_rank ?? null, backlinks: data.backlinks ?? null, referringDomains: data.referring_domains ?? null, spamScore: null, source: 'seomcp' }
          } catch { return null }
        }
      },
      {
        name: 'rankparse',
        priority: 3,
        free: true,
        check: async (domain) => {
          if (!this.apiKeys.rankparse) return null
          try {
            const { data } = await axios.get('https://api.rankparse.com/v1/domain-authority', {
              params: { domain },
              headers: { Authorization: `Bearer ${this.apiKeys.rankparse}` }
            })
            if (!data?.data?.authority_score) return null
            return { domain, authority: data.data.authority_score, backlinks: data.data.backlinks ?? null, referringDomains: null, spamScore: null, source: 'rankparse' }
          } catch { return null }
        }
      },
      {
        name: 'mozscape',
        priority: 4,
        free: true,
        check: async (domain) => {
          if (!this.apiKeys.mozscape) return null
          try {
            const { data } = await axios.get('https://lsapi.seomoz.com/v2/url_metrics', {
              params: { domain },
              headers: { Authorization: this.apiKeys.mozscape }
            },)
            if (!data?.domain_authority) return null
            return { domain, authority: data.domain_authority ?? null, backlinks: data.backlinks ?? null, referringDomains: data.referring_domains ?? null, spamScore: data.spam_score ?? null, source: 'mozscape' }
          } catch { return null }
        }
      },
      {
        name: 'commoncrawl',
        priority: 5,
        free: true,
        check: async (domain) => {
          try {
            const { data } = await axios.get(`http://index.commoncrawl.org/CC-MAIN-2025-04-index?url=${domain}&output=json&limit=1`)
            if (!data || data.length === 0) return null
            return { domain, authority: null, backlinks: data.length, referringDomains: null, spamScore: null, source: 'commoncrawl' }
          } catch { return null }
        }
      },
    ]
    this.sources = sources.sort((a, b) => a.priority - b.priority)
  }

  async getDomainScore(domain: string): Promise<SEOScore> {
    for (const source of this.sources) {
      const result = await source.check(domain)
      if (result) return result
    }
    return { domain, authority: null, backlinks: null, referringDomains: null, spamScore: null, source: 'none' }
  }

  async getBacklinks(domain: string): Promise<Array<{ sourceUrl: string; anchorText: string; dofollow: boolean; daScore: number | null }>> {
    if (this.apiKeys.crawly) {
      try {
        const { data } = await axios.get('https://api.getcrawly.com/api/v1/backlinks', {
          params: { domain, key: this.apiKeys.crawly, limit: 100 }
        })
        if (data?.backlinks) {
          return data.backlinks.map((b: Record<string, unknown>) => ({
            sourceUrl: String(b.source_url ?? ''),
            anchorText: String(b.anchor_text ?? ''),
            dofollow: Boolean(b.dofollow ?? true),
            daScore: (b.da_score as number) ?? null,
          }))
        }
      } catch { /* fall through */ }
    }
    if (this.apiKeys.seomcp) {
      try {
        const { data } = await axios.get(`https://seomcp.io/api/v1/backlinks/${domain}`, {
          headers: { 'X-API-Key': this.apiKeys.seomcp },
          params: { limit: 100 }
        })
        if (data?.backlinks) {
          return data.backlinks.map((b: Record<string, unknown>) => ({
            sourceUrl: String(b.source_url ?? ''),
            anchorText: String(b.anchor_text ?? ''),
            dofollow: Boolean(b.dofollow ?? true),
            daScore: (b.domain_rank as number) ?? null,
          }))
        }
      } catch { /* fall through */ }
    }
    return []
  }

  async findProspects(niche: string, limit = 20): Promise<Array<{ domain: string; reason: string }>> {
    if (this.apiKeys.seomcp) {
      try {
        const { data } = await axios.get('https://seomcp.io/api/v1/top-domains', {
          headers: { 'X-API-Key': this.apiKeys.seomcp },
          params: { category: niche, limit }
        })
        if (data?.domains) {
          return data.domains.map((d: Record<string, unknown>) => ({
            domain: String(d.domain ?? ''),
            reason: String(d.category ?? `Top site in ${niche}`),
          }))
        }
      } catch { /* fall through */ }
    }
    return []
  }

  async getDomainContacts(domain: string): Promise<{ emails: string[]; phones: string[]; social: Record<string, string> }> {
    if (this.apiKeys.seomcp) {
      try {
        const { data } = await axios.get(`https://seomcp.io/api/v1/contacts/${domain}`, {
          headers: { 'X-API-Key': this.apiKeys.seomcp }
        })
        if (data) {
          return {
            emails: data.emails ?? [],
            phones: data.phones ?? [],
            social: data.social ?? {},
          }
        }
      } catch { /* fall through */ }
    }
    return { emails: [], phones: [], social: {} }
  }

  async getCompetitorGap(domain: string, competitor: string): Promise<Array<{ referringDomain: string; daScore: number | null; targetUrl: string }>> {
    if (this.apiKeys.rankparse) {
      try {
        const { data } = await axios.get('https://api.rankparse.com/v1/competitor-gap', {
          params: { domain, vs: competitor, limit: 50 },
          headers: { Authorization: `Bearer ${this.apiKeys.rankparse}` }
        })
        if (data?.data) {
          return data.data.map((d: Record<string, unknown>) => ({
            referringDomain: String(d.referring_domain ?? ''),
            daScore: (d.authority_score as number) ?? null,
            targetUrl: String(d.target_url ?? ''),
          }))
        }
      } catch { /* fall through */ }
    }
    return []
  }

  async getLinkIntersect(domainA: string, domainB: string): Promise<string[]> {
    if (this.apiKeys.rankparse) {
      try {
        const { data } = await axios.get('https://api.rankparse.com/v1/link-intersect', {
          params: { domain_a: domainA, domain_b: domainB, limit: 50 },
          headers: { Authorization: `Bearer ${this.apiKeys.rankparse}` }
        })
        if (data?.data) return data.data.map((d: Record<string, unknown>) => String(d.domain ?? ''))
      } catch { /* fall through */ }
    }
    return []
  }

  getConfiguredSources(): string[] {
    return Object.keys(this.apiKeys).filter(k => this.apiKeys[k])
  }
}
