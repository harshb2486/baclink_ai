import { MCPServer } from './server.js'
import { BaclinkAgent } from '../agent/core.js'
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
import { AEOEngine } from '../tools/aeo/engine.js'
import { SEOCrawler } from '../services/crawler/seo-crawler.js'
import { GSCService } from '../services/gsc/service.js'
import { MultiSourceSEO } from '../services/seo/multi-source.js'
import { dbOps } from '../services/storage/db.js'
import { formatNumber } from '../utils/format.js'
import type { ToolResult } from '../types/index.js'

export function buildMCPServer(agent: BaclinkAgent): MCPServer {
  const mcp = new MCPServer()
  const seo = agent.getSEO()
  const browser = (agent as any).browser
  const llm = (agent as any).llm
  const aeo = new AEOEngine(browser, llm)
  const crawler = new SEOCrawler(browser, llm)
  const gsc = new GSCService({
    gsc: process.env.GSC_API_KEY ?? '',
    ga4: process.env.GA4_API_KEY ?? '',
  })

  mcp.registerTool('find_prospects', async (params) => {
    const result = await findProspects(
      params.niche as string,
      seo, llm, browser,
      parseInt(params.limit as string) || 20
    )
    return formatResult(result, 'prospects')
  })

  mcp.registerTool('analyze_competitor_gap', async (params) => {
    const result = await analyzeCompetitorGap(
      params.your_domain as string,
      params.competitor_domain as string,
      seo, llm
    )
    return formatResult(result, 'gaps')
  })

  mcp.registerTool('find_broken_links', async (params) => {
    const result = await findBrokenLinks(
      params.target_domain as string,
      browser, llm,
      params.your_content as string
    )
    return formatResult(result, 'opportunities')
  })

  mcp.registerTool('find_unlinked_mentions', async (params) => {
    const result = await findUnlinkedMentions(
      params.brand_name as string,
      browser, llm,
      parseInt(params.limit as string) || 30
    )
    return formatResult(result, 'mentions')
  })

  mcp.registerTool('find_guest_post_opportunities', async (params) => {
    const result = await findGuestPostOpportunities(
      params.niche as string,
      seo, browser, llm,
      parseInt(params.limit as string) || 20
    )
    return formatResult(result, 'sites')
  })

  mcp.registerTool('draft_outreach_email', async (params) => {
    const campaignId = agent.getMemory().recall('current_campaign_id')
      ?? dbOps.campaigns.create(`Outreach ${new Date().toISOString().split('T')[0]}`, '', '')
    if (!agent.getMemory().recall('current_campaign_id')) {
      agent.getMemory().remember('current_campaign_id', campaignId)
    }
    const result = await draftOutreachEmail(
      campaignId,
      params.prospect_domain as string,
      params.your_site as string,
      params.your_value as string,
      llm,
      (params.email_type as any) ?? 'backlink_request',
      (params.extra_context as string) ?? ''
    )
    return formatResult(result, 'variants')
  })

  mcp.registerTool('send_campaign_emails', async (params) => {
    const emailSender = agent.getEmailSender()
    if (!emailSender) return 'Email not configured. Set SMTP settings in .env first.'
    const result = await sendCampaignEmails(
      agent.getMemory().recall('current_campaign_id') ?? '',
      emailSender, 'both',
      parseInt(params.throttle_ms as string) || 2000
    )
    return formatResult(result, 'results')
  })

  mcp.registerTool('handle_reply', async (params) => {
    const result = await handleReply(
      params.email_id as string,
      params.reply_body as string,
      llm,
      agent.getMemory().recall('your_site') ?? 'our website'
    )
    return formatResult(result, 'data')
  })

  mcp.registerTool('create_skyscraper_content', async (params) => {
    const result = await skyscraperContent(
      params.niche as string,
      (params.angle as string) ?? 'comprehensive guide',
      browser, llm
    )
    return formatResult(result, 'data')
  })

  mcp.registerTool('monitor_backlinks', async (params) => {
    const result = await monitorBacklinks(
      (params.campaign_id as string) ?? agent.getMemory().recall('current_campaign_id') ?? '',
      browser, llm
    )
    return formatResult(result, 'data')
  })

  mcp.registerTool('scan_radar', async (params) => {
    const result = await scanRadar(params.niche as string, browser, llm)
    return formatResult(result, 'relevantAlerts')
  })

  mcp.registerTool('get_domain_score', async (params) => {
    const score = await seo.getDomainScore(params.domain as string)
    return JSON.stringify(score, null, 2)
  })

  mcp.registerTool('get_backlinks_for_domain', async (params) => {
    const backlinks = await seo.getBacklinks(params.domain as string)
    return JSON.stringify(backlinks.slice(0, parseInt(params.limit as string) || 50), null, 2)
  })

  mcp.registerTool('generate_llms_txt', async (params) => {
    const result = await aeo.generateLLMS(
      params.domain as string,
      params.pages as string | undefined
    )
    return JSON.stringify(result, null, 2)
  })

  mcp.registerTool('check_ai_citations', async (params) => {
    const result = await aeo.checkAICitations(
      params.domain as string,
      params.topic as string
    )
    return JSON.stringify(result, null, 2)
  })

  mcp.registerTool('validate_schema', async (params) => {
    const result = await aeo.validateSchema(params.url as string)
    return JSON.stringify(result, null, 2)
  })

  mcp.registerTool('crawl_site', async (params) => {
    const session = await crawler.crawlSite(
      params.url as string,
      parseInt(params.max_pages as string) || 100
    )
    const summary = session.summary
    return JSON.stringify({
      sessionId: session.id,
      totalPages: summary.totalPages,
      totalIssues: summary.totalIssues,
      brokenLinks: summary.brokenLinks,
      redirects: summary.redirects,
      slowPages: summary.slowPages,
      thinContent: summary.thinContent,
      missingMeta: summary.missingMeta,
      noindexPages: summary.noindexPages,
      avgWordCount: summary.avgWordCount,
      avgResponseTime: `${summary.avgResponseTime}ms`,
    }, null, 2)
  })

  mcp.registerTool('get_gsc_data', async (params) => {
    const result = await gsc.getGSCPerformance(
      params.site_url as string,
      parseInt(params.days as string) || 28
    )
    return JSON.stringify(result, null, 2)
  })

  mcp.registerTool('get_ga4_data', async (params) => {
    const result = await gsc.getGA4Data(
      params.property_id as string,
      parseInt(params.days as string) || 28
    )
    return JSON.stringify(result, null, 2)
  })

  mcp.registerTool('generate_report', async () => {
    const prospects = dbOps.prospects.listAll(10) as any[]
    const campaigns = dbOps.campaigns.list() as any[]
    const alerts = dbOps.radar.listUnactioned(20) as any[]
    const sessions = crawler.listSessions()

    const lines = [
      '## Baclink AI Campaign Report',
      '',
      `📊 Active Campaigns: ${campaigns.filter((c: any) => c.status === 'active').length}`,
      `🎯 Total Prospects: ${prospects.length}`,
      `🔔 Radar Alerts: ${alerts.length} unactioned`,
      `🕷️ Crawl Sessions: ${sessions.length}`,
      '',
      '### Prospects by Status:',
      ...Object.entries(
        prospects.reduce((acc: Record<string, number>, p: any) => {
          acc[p.status] = (acc[p.status] ?? 0) + 1
          return acc
        }, {})
      ).map(([k, v]) => `  ${k}: ${v}`),
      '',
      alerts.length > 0 ? '### Recent Radar Alerts:' : '',
      ...(alerts as any[]).slice(0, 5).map((a: any) =>
        `  [${a.type}] ${a.summary?.substring(0, 100)}`
      ),
      '',
      '💡 Run `find_prospects` or `scan_radar` to find new opportunities.',
    ]

    return lines.join('\n')
  })

  return mcp
}

function formatResult(result: ToolResult, dataKey: string): string {
  if (!result.success) return `Error: ${result.error}`
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return 'No data returned'
  const target = data[dataKey] as any[] | undefined
  if (Array.isArray(target)) {
    return JSON.stringify(target.slice(0, 10), null, 2)
  }
  return JSON.stringify(data, null, 2)
}
