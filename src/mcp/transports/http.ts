import type { MCPRequest, MCPResponse } from '../server.js'
import type { MCPServer } from '../server.js'

export class HttpTransport {
  private server: MCPServer
  private port: number

  constructor(server: MCPServer, port = 3100) {
    this.server = server
    this.port = port
  }

  async start(): Promise<void> {
    const http = await import('node:http')
    const server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'GET' && req.url === '/tools') {
        res.writeHead(200)
        res.end(JSON.stringify({
          tools: this.server.getToolDefinitions().map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
          })),
        }))
        return
      }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200)
        res.end(JSON.stringify({ status: 'ok', version: '4.0.0' }))
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method not allowed' } }))
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', async () => {
        try {
          const mcpReq: MCPRequest = JSON.parse(body)
          const response = await this.server.handleRequest(mcpReq)
          res.writeHead(response.error ? 400 : 200)
          res.end(JSON.stringify(response))
        } catch (err: any) {
          res.writeHead(400)
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: `Parse error: ${err?.message ?? String(err)}` },
          }))
        }
      })
    })

    return new Promise((resolve) => {
      server.listen(this.port, () => {
        console.error(`[baclink] MCP HTTP server listening on port ${this.port}`)
        resolve()
      })
    })
  }
}
