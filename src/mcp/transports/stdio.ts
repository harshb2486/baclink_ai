import type { MCPRequest, MCPResponse } from '../server.js'
import type { MCPServer } from '../server.js'
import readline from 'node:readline'

export class StdioTransport {
  private server: MCPServer
  private rl: readline.Interface

  constructor(server: MCPServer) {
    this.server = server
    this.rl = readline.createInterface({ input: process.stdin })
  }

  start(): void {
    this.rl.on('line', async (line) => {
      try {
        const req: MCPRequest = JSON.parse(line)
        const response = await this.server.handleRequest(req)
        process.stdout.write(JSON.stringify(response) + '\n')
      } catch (err: any) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: -1,
          error: { code: -32700, message: `Parse error: ${err?.message ?? String(err)}` },
        }
        process.stdout.write(JSON.stringify(errorResponse) + '\n')
      }
    })
  }

  stop(): void {
    this.rl.close()
  }
}
