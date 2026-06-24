export interface Prospect {
  id: string
  domain: string
  daScore: number | null
  paScore: number | null
  spamScore: number | null
  relevance: number
  status: ProspectStatus
  contacts: ContactInfo | null
  notes: string
  source: string
  category: string | null
  createdAt: string
  updatedAt: string
}

export interface ContactInfo {
  emails: string[]
  phones: string[]
  social: Record<string, string>
}

export type ProspectStatus = 'discovered' | 'contacted' | 'replied' | 'negotiating' | 'won' | 'lost'

export interface Campaign {
  id: string
  name: string
  niche: string
  goal: string
  status: CampaignStatus
  createdAt: string
  updatedAt: string
}

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface OutreachEmail {
  id: string
  campaignId: string
  prospectId: string
  variant: string
  subject: string
  bodyHtml: string
  bodyText: string
  sentAt: string | null
  openedAt: string | null
  repliedAt: string | null
  status: EmailStatus
  error: string | null
}

export type EmailStatus = 'draft' | 'sent' | 'opened' | 'replied' | 'bounced' | 'failed'

export interface Conversation {
  id: string
  emailId: string
  direction: 'outbound' | 'inbound'
  body: string
  sentiment: Sentiment | null
  aiDrafted: boolean
  createdAt: string
}

export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface Backlink {
  id: string
  campaignId: string
  sourceUrl: string
  targetUrl: string
  anchorText: string | null
  dofollow: boolean
  status: BacklinkStatus
  firstFound: string
  lastChecked: string
}

export type BacklinkStatus = 'active' | 'lost' | 'redirected' | 'nofollow_only'

export interface UnlinkedMention {
  id: string
  brand: string
  sourceUrl: string
  pageTitle: string | null
  hasLink: boolean
  contacted: boolean
  createdAt: string
}

export interface BacklinkProspect {
  domain: string
  daScore: number | null
  relevanceScore: number
  reason: string
  contactInfo: ContactInfo | null
  opportunities: string[]
}

export interface CompetitorGap {
  competitorDomain: string
  referringDomain: string
  daScore: number | null
  targetUrl: string
  anchorText: string | null
  opportunity: string
}

export interface BrokenLinkOpportunity {
  sourceUrl: string
  brokenUrl: string
  anchorText: string | null
  daScore: number | null
  suggestedReplacement: string
}

export interface RadarAlert {
  id: string
  type: 'new_site' | 'trending_article' | 'broken_page' | 'competitor_move'
  source: string
  domain: string | null
  summary: string
  relevanceScore: number
  actioned: boolean
  createdAt: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface AgentMemory {
  id: string
  key: string
  value: string
  createdAt: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SEOScore {
  domain: string
  authority: number | null
  backlinks: number | null
  referringDomains: number | null
  spamScore: number | null
  source: string
}

export interface CaptchaSolveResult {
  success: boolean
  token?: string
  text?: string
  provider: string
  error?: string
}
