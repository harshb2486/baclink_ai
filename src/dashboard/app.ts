import express from 'express'
import type { MCPServer } from '../mcp/server.js'
import { BaclinkAgent } from '../agent/core.js'
import { dbOps } from '../services/storage/db.js'

export function buildDashboard(agent: BaclinkAgent, mcp: MCPServer): express.Application {
  const app = express()
  app.use(express.json())

  app.get('/api/status', (_req, res) => {
    const prospects = dbOps.prospects.listAll(1000) as any[]
    const campaigns = dbOps.campaigns.list() as any[]
    const alerts = dbOps.radar.listUnactioned(100) as any[]
    res.json({
      prospects: prospects.length,
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((c: any) => c.status === 'active').length,
      radarAlerts: alerts.length,
      mcpTools: mcp.getToolNames().length,
      version: '4.0.0',
    })
  })

  app.get('/api/tools', (_req, res) => {
    res.json({
      tools: mcp.getToolDefinitions().map(t => ({
        name: t.name,
        description: t.description,
        parameters: Object.keys(t.parameters.properties),
      })),
    })
  })

  app.get('/api/prospects', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50
    const status = req.query.status as string | undefined
    const prospects = status
      ? dbOps.prospects.listByStatus(status, limit)
      : dbOps.prospects.listAll(limit)
    res.json(prospects)
  })

  app.get('/api/campaigns', (_req, res) => {
    res.json(dbOps.campaigns.list())
  })

  app.get('/api/alerts', (_req, res) => {
    res.json(dbOps.radar.listUnactioned(50))
  })

  app.post('/api/mcp', async (req, res) => {
    try {
      const response = await mcp.handleRequest(req.body)
      res.json(response)
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Internal error' })
    }
  })

  app.get('/api/mcp/tools', (_req, res) => {
    res.json({
      tools: mcp.getToolDefinitions().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
    })
  })

  app.get('/', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Baclink AI Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #22d3ee; font-size: 2rem; margin-bottom: 0.5rem; }
    .subtitle { color: #71717a; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 1.5rem; }
    .card h3 { color: #a1a1aa; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .value { font-size: 2.5rem; font-weight: 700; color: #f4f4f5; }
    .card .value.green { color: #22c55e; }
    .card .value.cyan { color: #22d3ee; }
    .card .value.yellow { color: #eab308; }
    .card .value.purple { color: #a855f7; }
    pre { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 1rem; overflow-x: auto; margin-top: 1rem; }
    .mcp-badge { display: inline-block; background: #22d3ee22; color: #22d3ee; border: 1px solid #22d3ee44; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Baclink AI</h1>
    <p class="subtitle">Backlink Management Agent — MCP Server v4.0.0</p>
    <div class="grid">
      <div class="card">
        <h3>MCP Tools</h3>
        <div class="value cyan" id="tools">—</div>
      </div>
      <div class="card">
        <h3>Prospects</h3>
        <div class="value green" id="prospects">—</div>
      </div>
      <div class="card">
        <h3>Active Campaigns</h3>
        <div class="value yellow" id="campaigns">—</div>
      </div>
      <div class="card">
        <h3>Radar Alerts</h3>
        <div class="value purple" id="alerts">—</div>
      </div>
    </div>
    <div>
      <span class="mcp-badge">MCP over HTTP</span>
      <span class="mcp-badge" style="margin-left: 0.5rem; background: #a855f722; color: #a855f7; border-color: #a855f744;">20 Tools</span>
    </div>
    <pre id="status">Loading...</pre>
  </div>
  <script>
    async function load() {
      const res = await fetch('/api/status');
      const data = await res.json();
      document.getElementById('tools').textContent = data.mcpTools;
      document.getElementById('prospects').textContent = data.prospects;
      document.getElementById('campaigns').textContent = data.activeCampaigns;
      document.getElementById('alerts').textContent = data.radarAlerts;
      document.getElementById('status').textContent = JSON.stringify(data, null, 2);
    }
    load();
    setInterval(load, 10000);
  </script>
</body>
</html>`)
  })

  return app
}
