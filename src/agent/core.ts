import { ModelRouter } from '../services/llm/model-router.js'
import { MultiSourceSEO } from '../services/seo/multi-source.js'
import { CaptchaSolver } from '../services/captcha/solver.js'
import { BrowserAutomation } from '../services/browser/automation.js'
import { EmailSender } from '../services/email/sender.js'
import { AgentMemory } from './memory.js'
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js'
import { findProspects } from '../tools/research/find-prospects.js'
import { analyzeCompetitorGap } from '../tools/research/competitor-gap.js'
import { findBrokenLinks } from '../tools/research/broken-link.js'
import { findUnlinkedMentions } from '../tools/research/unlinked-mentions.js'
import { findGuestPostOpportunities } from '../tools/research/guest-post.js'
import { draftOutreachEmail } from '../tools/outreach/draft-email.js'
import { sendCampaignEmails } from '../tools/outreach/send-campaign.js'
import { handleReply } from '../tools/outreach/negotiate.js'
import { skyscraperContent } from '../tools/content/skyscraper.js'
import { monitorBacklinks } from '../tools/monitor/check-links.js'
import { scanRadar } from '../tools/monitor/radar.js'
import { dbOps } from '../services/storage/db.js'
import type { ToolResult, LLMMessage } from '../types/index.js'

export interface AgentConfig {
  deepseekApiKey: string
  seoApiKeys?: Record<string, string>
  captchaApiKeys?: Record<string, string>
  emailConfig?: {
    smtp: { host: string; port: number; user: string; pass: string; fromName: string; fromEmail: string }
  }
  browserOptions?: { headless?: boolean }
}

export class BaclinkAgent {
  private llm: ModelRouter
  private seo: MultiSourceSEO
  private captcha: CaptchaSolver
  private browser: BrowserAutomation
  private email: EmailSender | null = null
  private memory: AgentMemory
  private config: AgentConfig
  private conversation: LLMMessage[] = []

  constructor(config: AgentConfig) {
    this.config = config
    this.llm = new ModelRouter(config.deepseekApiKey)
    this.seo = new MultiSourceSEO(config.seoApiKeys ?? {})
    this.captcha = new CaptchaSolver(config.captchaApiKeys ?? {})
    this.browser = new BrowserAutomation({ headless: config.browserOptions?.headless ?? true })
    if (config.emailConfig) {
      this.email = new EmailSender({
        smtp: config.emailConfig.smtp,
        throttleMs: 2000,
      })
    }
    this.memory = new AgentMemory()
    this.conversation.push({ role: 'system', content: AGENT_SYSTEM_PROMPT })
  }

  async process(input: string): Promise<string> {
    this.conversation.push({ role: 'user', content: input })
    const context = this.memory.getSessionHistory(10).join('\n')
    if (context) {
      this.conversation.push({ role: 'system', content: `Session context:\n${context}` })
    }

    const intent = await this.classifyIntent(input)
    let response: string

    switch (intent) {
      case 'find_prospects':
        response = await this.handleFindProspects(input)
        break
      case 'competitor_gap':
        response = await this.handleCompetitorGap(input)
        break
      case 'broken_links':
        response = await this.handleBrokenLinks(input)
        break
      case 'unlinked_mentions':
        response = await this.handleUnlinkedMentions(input)
        break
      case 'guest_posts':
        response = await this.handleGuestPosts(input)
        break
      case 'draft_outreach':
        response = await this.handleDraftOutreach(input)
        break
      case 'send_emails':
        response = await this.handleSendEmails(input)
        break
      case 'handle_reply':
        response = await this.handleNegotiation(input)
        break
      case 'create_content':
        response = await this.handleContent(input)
        break
      case 'monitor':
        response = await this.handleMonitor(input)
        break
      case 'radar':
        response = await this.handleRadar(input)
        break
      case 'report':
        response = await this.handleReport()
        break
      default:
        response = await this.generateResponse(input)
        break
    }

    this.conversation.push({ role: 'assistant', content: response })
    this.memory.remember('last_query', input)
    this.memory.remember('last_response', response)

    return response
  }

  private async classifyIntent(input: string): Promise<string> {
    const result = await this.llm.execute('classify_prospect', [
      { role: 'system', content: `Classify the user's intent. Return ONLY one word from this list: find_prospects, competitor_gap, broken_links, unlinked_mentions, guest_posts, draft_outreach, send_emails, handle_reply, create_content, monitor, radar, report, chat
Rules:
- find_prospects: looking for backlink opportunities, sites to target
- competitor_gap: comparing with competitors
- broken_links: finding dead links on other sites
- unlinked_mentions: brand mentions without links
- guest_posts: guest post opportunities
- draft_outreach: writing emails
- send_emails: sending campaign
- handle_reply: responding to replies
- create_content: writing articles/content
- monitor: checking existing backlinks
- radar: scanning for new opportunities
- report: campaign stats
- chat: anything else` },
      { role: 'user', content: input },
    ])
    return result.trim().toLowerCase()
  }

  private async handleFindProspects(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract niche/topic and limit from the query. Return JSON: { "niche": "...", "limit": number }' },
      { role: 'user', content: input },
    ])
    let niche = 'technology'
    let limit = 20
    try { const p = JSON.parse(details); niche = p.niche ?? niche; limit = p.limit ?? limit } catch { /* noop */ }

    const result = await findProspects(niche, this.seo, this.llm, this.browser, limit)
    if (!result.success) return `Failed to find prospects: ${result.error}`

    const data = result.data as any
    const prospects = data.prospects ?? []
    const topProspects = prospects.slice(0, 5).map((p: any) =>
      `${p.domain} (relevance: ${p.relevanceScore}/100, DA: ${p.daScore ?? 'N/A'})`
    ).join('\n')

    this.memory.remember('last_niche', niche)
    this.memory.remember('last_prospects', JSON.stringify(prospects.map((p: any) => p.domain)))

    return `## Prospect Discovery Results\n\nNiche: **${niche}**\nFound **${data.totalFound}** prospects\n\n### Top Prospects:\n${topProspects}\n\nAll prospects saved to database. Ready to draft outreach emails?`
  }

  private async handleCompetitorGap(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract your domain and competitor domain from the query. Return JSON: { "yourDomain": "...", "competitorDomain": "..." }' },
      { role: 'user', content: input },
    ])
    let yourDomain = ''
    let competitorDomain = ''
    try { const p = JSON.parse(details); yourDomain = p.yourDomain; competitorDomain = p.competitorDomain } catch { return 'Please specify both your domain and the competitor domain.' }

    const result = await analyzeCompetitorGap(yourDomain, competitorDomain, this.seo, this.llm)
    if (!result.success) return `Failed to analyze: ${result.error}`

    const data = result.data as any
    const topGaps = (data.gaps ?? []).slice(0, 5).map((g: any) =>
      `${g.referringDomain} (DA: ${g.daScore ?? 'N/A'}) → ${g.opportunity}`
    ).join('\n')

    return `## Competitor Gap Analysis\n\nYour site: **${yourDomain}**\nCompetitor: **${competitorDomain}**\nFound **${data.totalGaps}** domains linking to them but not you\n\n### Top Opportunities:\n${topGaps}\n\nCommon domains you share: ${data.commonDomains?.length ?? 0}`
  }

  private async handleBrokenLinks(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract target domain and our content summary. Return JSON: { "targetDomain": "...", "ourContent": "..." }' },
      { role: 'user', content: input },
    ])
    let targetDomain = ''
    let ourContent = 'our content'
    try { const p = JSON.parse(details); targetDomain = p.targetDomain; ourContent = p.ourContent ?? ourContent } catch { return 'Please specify the target domain.' }

    const result = await findBrokenLinks(targetDomain, this.browser, this.llm, ourContent)
    if (!result.success) return `Failed to find broken links: ${result.error}`

    const data = result.data as any
    const tops = (data.opportunities ?? []).slice(0, 5).map((o: any) =>
      `${o.brokenUrl} on ${o.sourceUrl} → ${o.suggestedReplacement.substring(0, 100)}...`
    ).join('\n\n')

    return `## Broken Link Building\n\nTarget: **${targetDomain}**\nFound **${data.totalBroken}** broken link opportunities\n\n### Top Opportunities:\n${tops}`
  }

  private async handleUnlinkedMentions(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract brand name from query. Return JSON: { "brand": "...", "limit": number }' },
      { role: 'user', content: input },
    ])
    let brand = ''
    let limit = 30
    try { const p = JSON.parse(details); brand = p.brand; limit = p.limit ?? limit } catch { return 'Please specify the brand name.' }

    const result = await findUnlinkedMentions(brand, this.browser, this.llm, limit)
    if (!result.success) return `Failed: ${result.error}`

    const data = result.data as any
    const topMentions = (data.mentions ?? []).slice(0, 5).map((m: any) =>
      `${m.pageTitle ?? 'Untitled'} — ${m.sourceUrl}`
    ).join('\n')

    return `## Unlinked Brand Mentions\n\nBrand: **${brand}**\nFound **${data.totalMentions}** total mentions\n**${data.unlinkedMentions}** are missing a backlink\n\n### Unlinked Mentions:\n${topMentions}\n\nWant me to draft outreach emails for these?`
  }

  private async handleGuestPosts(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract niche from query. Return JSON: { "niche": "...", "limit": number }' },
      { role: 'user', content: input },
    ])
    let niche = ''
    let limit = 20
    try { const p = JSON.parse(details); niche = p.niche; limit = p.limit ?? limit } catch { return 'Please specify the niche.' }

    const result = await findGuestPostOpportunities(niche, this.seo, this.browser, this.llm, limit)
    if (!result.success) return `Failed: ${result.error}`

    const data = result.data as any
    const tops = (data.sites ?? []).slice(0, 5).map((s: any) =>
      `${s.domain} (DA: ${s.daScore ?? 'N/A'}) — ${s.topics.slice(0, 2).join(', ')}`
    ).join('\n')

    return `## Guest Post Opportunities\n\nNiche: **${niche}**\nFound **${data.totalOpportunities}** sites accepting guest posts\n\n### Top Sites:\n${tops}`
  }

  private async handleDraftOutreach(input: string): Promise<string> {
    const campaignId = this.memory.recall('current_campaign_id')
    const site = this.memory.recall('your_site') ?? 'our website'
    const value = this.memory.recall('your_value') ?? 'quality content'

    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: `Extract details. Return JSON: { "prospectDomain": "...", "yourSite": "...", "yourValue": "...", "extraContext": "...", "emailType": "backlink_request|guest_post|broken_link|resource_add" } Use defaults if not specified.` },
      { role: 'user', content: `${input}\nDefaults: yourSite=${site}, yourValue=${value}` },
    ])

    let prospectDomain = ''
    let yourSite = site
    let yourValue = value
    let extraContext = ''
    let emailType = 'backlink_request'
    try { const p = JSON.parse(details); prospectDomain = p.prospectDomain; yourSite = p.yourSite ?? site; yourValue = p.yourValue ?? value; extraContext = p.extraContext ?? ''; emailType = p.emailType ?? emailType } catch { return 'Please specify the prospect domain.' }

    const cid = campaignId ?? dbOps.campaigns.create(`Outreach ${new Date().toISOString().split('T')[0]}`, '', '')
    if (!campaignId) this.memory.remember('current_campaign_id', cid)

    const result = await draftOutreachEmail(cid, prospectDomain, yourSite, yourValue, this.llm, emailType as any, extraContext)
    if (!result.success) return `Failed to draft: ${result.error}`

    const data = result.data as any
    const variantA = data.variants?.[0]
    const variantB = data.variants?.[1]

    return `## Outreach Draft Complete\n\nProspect: **${data.prospectDomain}**\nContact: ${data.contactEmail}\n\n### Variant A:\nSubject: ${variantA?.subject ?? 'N/A'}\n\n### Variant B:\nSubject: ${variantB?.subject ?? 'N/A'}\n\nBoth saved as drafts. Send them?`
  }

  private async handleSendEmails(input: string): Promise<string> {
    if (!this.email) return 'Email not configured. Please set SMTP settings in .env first.'
    const campaignId = this.memory.recall('current_campaign_id')
    if (!campaignId) return 'No active campaign. Run outreach drafting first.'

    const result = await sendCampaignEmails(campaignId, this.email, 'both', 2000)
    if (!result.success) return `Failed to send: ${result.error}`
    const data = result.data as any
    return `## Email Campaign Sent\n\nTotal: ${data.total}\n✅ Sent: ${data.sent}\n❌ Failed: ${data.failed}\n\nMonitoring for replies... (check back later)`
  }

  private async handleNegotiation(input: string): Promise<string> {
    const emailId = this.memory.recall('last_email_id')
    if (!emailId) return 'No email context found. Please specify the email ID or reply content.'
    const site = this.memory.recall('your_site') ?? 'our website'

    const result = await handleReply(emailId, input, this.llm, site)
    if (!result.success) return `Failed: ${result.error}`
    const data = result.data as any

    let output = `## Reply Analysis\n\nSentiment: ${data.sentiment}\nIntent: ${data.intent}\nSummary: ${data.summary}\n\nSuggested action: ${data.suggestedAction}`
    if (data.suggestedReply) output += `\n\n### Suggested Reply:\n${data.suggestedReply}`
    return output
  }

  private async handleContent(input: string): Promise<string> {
    const details = await this.llm.execute('plan_strategy', [
      { role: 'system', content: 'Extract niche and angle. Return JSON: { "niche": "...", "angle": "..." }' },
      { role: 'user', content: input },
    ])
    let niche = ''
    let angle = ''
    try { const p = JSON.parse(details); niche = p.niche; angle = p.angle ?? 'comprehensive guide' } catch { return 'Please specify the niche for content creation.' }

    const result = await skyscraperContent(niche, angle, this.browser, this.llm)
    if (!result.success) return `Failed: ${result.error}`
    const data = result.data as any
    return `## Skyscraper Content Created\n\nNiche: **${niche}**\nWord count: ~${data.wordCount}\n\n### Outline:\n${data.outline.substring(0, 1000)}...\n\n### Preview:\n${data.articlePreview}\n\nFull article saved. Ready to find sites to pitch this to?`
  }

  private async handleMonitor(input: string): Promise<string> {
    const campaignId = this.memory.recall('current_campaign_id') ?? input.match(/campaign\s+(\S+)/i)?.[1]
    if (!campaignId) return 'No campaign specified or active. Please provide a campaign ID.'

    const result = await monitorBacklinks(campaignId, this.browser, this.llm)
    if (!result.success) return `Failed: ${result.error}`
    const data = result.data as any
    let output = `## Backlink Monitor\n\nCampaign: ${data.campaignId}\nChecked: ${data.totalChecked}\n✅ Active: ${data.active}\n❌ Lost: ${data.lost}\n🔄 Changed: ${data.changed}`
    if (data.summary) output += `\n\n### Recovery Suggestions:\n${data.summary}`
    return output
  }

  private async handleRadar(input: string): Promise<string> {
    const niche = this.memory.recall('last_niche') ?? input.match(/scan\s+(.+)/i)?.[1] ?? this.memory.recall('last_niche')
    if (!niche) return 'No niche specified. Tell me what niche to scan.'

    const result = await scanRadar(niche, this.browser, this.llm)
    if (!result.success) return `Failed: ${result.error}`
    const data = result.data as any
    const topAlerts = (data.relevantAlerts ?? []).slice(0, 5).map((a: any) =>
      `[${a.type}] Score ${a.relevanceScore}: ${a.summary.substring(0, 150)}`
    ).join('\n\n')

    return `## Radar Scan Results\n\nNiche: **${niche}**\nScanned: ${data.totalScanned} items\nRelevant: ${data.relevantAlerts?.length ?? 0} alerts\n\n### Top Alerts:\n${topAlerts}`
  }

  private async handleReport(): Promise<string> {
    const prospects = dbOps.prospects.listAll(10) as any[]
    const campaigns = dbOps.campaigns.list() as any[]
    const alertCount = (dbOps.radar.listUnactioned(100) as any[]).length

    let output = `## Baclink AI Report\n\n📊 **Campaigns:** ${campaigns.length}\n🎯 **Prospects:** Total found\n`
    if (campaigns.length > 0) {
      const active = campaigns.filter((c: any) => c.status === 'active').length
      output += `   Active campaigns: ${active}\n`
    }
    if (prospects.length > 0) {
      const byStatus: Record<string, number> = {}
      for (const p of prospects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
      output += `   ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`
    }
    output += `🔔 **Radar Alerts:** ${alertCount} unactioned\n\n`
    output += `💡 **Try:** "find prospects for [niche]" or "analyze competitor [domain]"\n`
    return output
  }

  private async generateResponse(input: string): Promise<string> {
    this.conversation = this.conversation.slice(-20)
    return this.llm.client.chat(this.conversation)
  }

  getMemory(): AgentMemory {
    return this.memory
  }

  getConfig(): AgentConfig {
    return this.config
  }

  getEmailSender(): EmailSender | null {
    return this.email
  }

  getSEO(): MultiSourceSEO {
    return this.seo
  }

  async destroy(): Promise<void> {
  }
}
