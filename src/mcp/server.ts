import type { ToolDefinition } from '../tools/definitions.js'
import { TOOL_DEFINITIONS, TOOL_NAMES } from '../tools/definitions.js'

export interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>

export class MCPServer {
  private handlers: Map<string, ToolHandler> = new Map()
  private requestHandler: ((req: MCPRequest) => Promise<MCPResponse>) | null = null

  registerTool(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler)
  }

  getToolDefinitions(): ToolDefinition[] {
    return TOOL_DEFINITIONS
  }

  getToolNames(): string[] {
    return TOOL_NAMES
  }

  async handleRequest(req: MCPRequest): Promise<MCPResponse> {
    if (req.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32600, message: 'Invalid JSON-RPC version' } }
    }

    switch (req.method) {
      case 'mcp.list_tools':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            tools: this.getToolDefinitions().map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.parameters,
            })),
          },
        }

      case 'mcp.call_tool': {
        const toolName = req.params?.name as string
        const args = (req.params?.arguments as Record<string, unknown>) ?? {}

        const handler = this.handlers.get(toolName)
        if (!handler) {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: `Tool not found: ${toolName}` },
          }
        }

        try {
          const result = await handler(args)
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] },
          }
        } catch (err: any) {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32000, message: err?.message ?? String(err) },
          }
        }
      }

      case 'mcp.ping':
        return { jsonrpc: '2.0', id: req.id, result: 'pong' }

      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        }
    }
  }

  setRequestHandler(handler: (req: MCPRequest) => Promise<MCPResponse>): void {
    this.requestHandler = handler
  }
}
