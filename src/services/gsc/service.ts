export interface GSCDataPoint {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GA4DataPoint {
  page: string
  activeUsers: number
  screenPageViews: number
  engagementRate: number
  averageSessionDuration: number
}

export class GSCService {
  private apiKeys: { gsc?: string; ga4?: string }

  constructor(apiKeys: Record<string, string> = {}) {
    this.apiKeys = apiKeys
  }

  async getGSCPerformance(siteUrl: string, days = 28): Promise<{
    data: GSCDataPoint[]
    summary: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number }
  }> {
    if (!this.apiKeys.gsc) {
      return {
        data: [],
        summary: { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 },
      }
    }

    const axios = (await import('axios')).default
    try {
      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          startDate,
          endDate,
          dimensions: ['query', 'page'],
          rowLimit: 100,
        },
        { headers: { Authorization: `Bearer ${this.apiKeys.gsc}` } }
      )

      const rows: GSCDataPoint[] = (data.rows ?? []).map((r: any) => ({
        query: r.keys?.[0] ?? '',
        page: r.keys?.[1] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }))

      const summary = {
        totalClicks: rows.reduce((s: number, r: GSCDataPoint) => s + r.clicks, 0),
        totalImpressions: rows.reduce((s: number, r: GSCDataPoint) => s + r.impressions, 0),
        avgCtr: rows.length > 0 ? rows.reduce((s: number, r: GSCDataPoint) => s + r.ctr, 0) / rows.length : 0,
        avgPosition: rows.length > 0 ? rows.reduce((s: number, r: GSCDataPoint) => s + r.position, 0) / rows.length : 0,
      }

      return { data: rows, summary }
    } catch {
      return {
        data: [],
        summary: { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 },
      }
    }
  }

  async getGA4Data(propertyId: string, days = 28): Promise<{
    data: GA4DataPoint[]
    summary: { totalUsers: number; totalPageViews: number; avgEngagementRate: number }
  }> {
    if (!this.apiKeys.ga4) {
      return {
        data: [],
        summary: { totalUsers: 0, totalPageViews: 0, avgEngagementRate: 0 },
      }
    }

    const axios = (await import('axios')).default
    try {
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'engagementRate' },
            { name: 'averageSessionDuration' },
          ],
          limit: 100,
        },
        { headers: { Authorization: `Bearer ${this.apiKeys.ga4}` } }
      )

      const rows: GA4DataPoint[] = (data.rows ?? []).map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? '',
        activeUsers: parseInt(r.metricValues?.[0]?.value ?? '0'),
        screenPageViews: parseInt(r.metricValues?.[1]?.value ?? '0'),
        engagementRate: parseFloat(r.metricValues?.[2]?.value ?? '0'),
        averageSessionDuration: parseFloat(r.metricValues?.[3]?.value ?? '0'),
      }))

      const summary = {
        totalUsers: rows.reduce((s: number, r: GA4DataPoint) => s + r.activeUsers, 0),
        totalPageViews: rows.reduce((s: number, r: GA4DataPoint) => s + r.screenPageViews, 0),
        avgEngagementRate: rows.length > 0
          ? rows.reduce((s: number, r: GA4DataPoint) => s + r.engagementRate, 0) / rows.length
          : 0,
      }

      return { data: rows, summary }
    } catch {
      return {
        data: [],
        summary: { totalUsers: 0, totalPageViews: 0, avgEngagementRate: 0 },
      }
    }
  }
}
