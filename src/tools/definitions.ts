export interface ToolDefinition {
  name: string
  description: string
  strict: true
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
      items?: { type: string }
    }>
    required: string[]
    additionalProperties: false
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'find_prospects',
    description: 'Discover backlink prospects for a niche using SEO APIs and AI analysis. Returns scored, ranked prospects with contact info.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'The niche or topic to find prospects for' },
        limit: { type: 'string', description: 'Number of prospects to find (default 20)' },
      },
      required: ['niche'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_competitor_gap',
    description: 'Compare your domain against a competitor to find backlink opportunities they have that you don\'t.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        your_domain: { type: 'string', description: 'Your website domain' },
        competitor_domain: { type: 'string', description: 'Competitor website domain to analyze' },
      },
      required: ['your_domain', 'competitor_domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_broken_links',
    description: 'Find broken links on a target domain and suggest your content as replacement. Classic broken link building.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target_domain: { type: 'string', description: 'The domain to scan for broken links' },
        your_content: { type: 'string', description: 'Brief summary of your content to suggest as replacement' },
      },
      required: ['target_domain', 'your_content'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_unlinked_mentions',
    description: 'Search the web for unlinked brand mentions — sites that mention your brand without linking to you.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        brand_name: { type: 'string', description: 'Your brand name to search for' },
        limit: { type: 'string', description: 'Max results to check (default 30)' },
      },
      required: ['brand_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_guest_post_opportunities',
    description: 'Discover sites accepting guest posts in a niche. Returns DA scores, topic ideas, and submission guidelines.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Niche to search for guest post opportunities' },
        limit: { type: 'string', description: 'Max results (default 20)' },
      },
      required: ['niche'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_outreach_email',
    description: 'Draft personalized A/B outreach emails for a prospect. Generates 2 variants with different angles.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        prospect_domain: { type: 'string', description: 'The prospect\'s domain' },
        your_site: { type: 'string', description: 'Your website' },
        your_value: { type: 'string', description: 'What value you offer' },
        email_type: {
          type: 'string',
          description: 'Type of outreach email',
          enum: ['backlink_request', 'guest_post', 'broken_link', 'resource_add'],
        },
        extra_context: { type: 'string', description: 'Additional context for the email' },
      },
      required: ['prospect_domain', 'your_site', 'your_value'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_campaign_emails',
    description: 'Send all draft outreach emails in the current campaign with configurable throttling.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        throttle_ms: { type: 'string', description: 'Delay between emails in ms (default 2000)' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'handle_reply',
    description: 'Analyze a prospect reply, detect sentiment/intent, and draft a negotiation response.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID to respond to' },
        reply_body: { type: 'string', description: 'The full text of the reply email' },
      },
      required: ['email_id', 'reply_body'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_skyscraper_content',
    description: 'Analyze top content in a niche and generate an improved skyscraper article with outline and full draft.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Content niche/topic' },
        angle: { type: 'string', description: 'Your unique angle or perspective' },
      },
      required: ['niche', 'angle'],
      additionalProperties: false,
    },
  },
  {
    name: 'monitor_backlinks',
    description: 'Check all backlinks in a campaign — verifies each link is still active and reports lost links with recovery suggestions.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID to monitor' },
      },
      required: ['campaign_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scan_radar',
    description: 'Proactively scan RSS feeds and news sources in your niche for new backlink opportunities.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Niche to scan' },
      },
      required: ['niche'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_domain_score',
    description: 'Get SEO metrics for a domain: authority score, backlinks, referring domains, spam score from multiple free APIs.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to look up' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_backlinks_for_domain',
    description: 'Get the backlink profile for any domain — list of linking pages, anchor text, dofollow status.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to check backlinks for' },
        limit: { type: 'string', description: 'Max results (default 50)' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_llms_txt',
    description: 'Generate an llms.txt file for a domain — the AI equivalent of robots.txt that tells AI crawlers about your content.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to generate llms.txt for' },
        pages: { type: 'string', description: 'Comma-separated list of important page paths' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_ai_citations',
    description: 'Check if your domain appears in AI answers across ChatGPT, Claude, Gemini, and Perplexity.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to check AI citation coverage for' },
        topic: { type: 'string', description: 'Topic or query to test against' },
      },
      required: ['domain', 'topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_schema',
    description: 'Validate Schema.org JSON-LD structured data on a page against known schema types.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to validate structured data on' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'crawl_site',
    description: 'Crawl a website up to 500 pages and extract 45+ SEO signals. Reports issues, redirects, broken links, and content analysis.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to start crawling from' },
        max_pages: { type: 'string', description: 'Max pages to crawl (default 100, max 500)' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_gsc_data',
    description: 'Get Google Search Console performance data for your site: top queries, pages, clicks, impressions, CTR.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        site_url: { type: 'string', description: 'GSC verified site URL' },
        days: { type: 'string', description: 'Number of days of data (default 28)' },
      },
      required: ['site_url'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_ga4_data',
    description: 'Get Google Analytics 4 data: top pages by traffic, traffic sources, user engagement metrics.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string', description: 'GA4 property ID' },
        days: { type: 'string', description: 'Number of days of data (default 28)' },
      },
      required: ['property_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_report',
    description: 'Generate a comprehensive campaign report with prospect stats, email performance, backlink status, and radar alerts.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
]

export const TOOL_NAMES = TOOL_DEFINITIONS.map(t => t.name)
