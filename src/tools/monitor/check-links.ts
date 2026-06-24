import { BrowserAutomation } from '../../services/browser/automation.js'
import { dbOps, getStore } from '../../services/storage/db.js'
import { ModelRouter } from '../../services/llm/model-router.js'
import type { ToolResult } from '../../types/index.js'

export async function monitorBacklinks(
  campaignId: string,
  browser: BrowserAutomation,
  llm: ModelRouter
): Promise<ToolResult> {
  try {
    const backlinks = dbOps.backlinks.listByCampaign(campaignId) as any[]
    if (backlinks.length === 0) return { success: false, error: 'No backlinks to check in this campaign' }

    const results: Array<{
      sourceUrl: string
      targetUrl: string
      status: string
      previousStatus: string
    }> = []

    let active = 0
    let lost = 0
    let changed = 0

    for (const bl of backlinks) {
      const alive = await browser.checkLinkAlive(bl.source_url)
      const newStatus = alive ? 'active' : 'lost'
      const changedStatus = newStatus !== bl.status

      if (newStatus === 'active') active++
      else lost++

      if (changedStatus) {
        changed++
        const store = getStore()
        if (store.backlinks[bl.id]) {
          store.backlinks[bl.id].status = newStatus
          store.backlinks[bl.id].last_checked = new Date().toISOString()
        }
      }

      results.push({
        sourceUrl: bl.source_url,
        targetUrl: bl.target_url,
        status: newStatus,
        previousStatus: bl.status,
      })
    }

    let summary = ''
    if (lost > 0) {
      const lostLinks = results.filter(r => r.status === 'lost').map(r => r.sourceUrl)
      summary = await llm.execute('summarize_report', [
        { role: 'system', content: 'Summarize these lost backlinks. Suggest recovery actions for each. Be concise.' },
        { role: 'user', content: `Lost backlinks:\n${lostLinks.join('\n')}\n\nCampaign: ${campaignId}` },
      ])
    }

    return {
      success: true,
      data: {
        campaignId,
        totalChecked: backlinks.length,
        active,
        lost,
        changed,
        results,
        summary,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
