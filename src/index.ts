#!/usr/bin/env node

import 'dotenv/config'
import chalk from 'chalk'
import { BaclinkAgent } from './agent/core.js'
import { buildMCPServer } from './mcp/handler.js'
import { StdioTransport } from './mcp/transports/stdio.js'
import { HttpTransport } from './mcp/transports/http.js'
import { printBanner, printStatus, showMenu, printResult } from './ui/cli.js'

const mode = process.argv[2] ?? 'cli'

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error(chalk.red('❌ DEEPSEEK_API_KEY not set'))
    console.error(chalk.yellow('  Copy .env.example to .env and add your key'))
    process.exit(1)
  }

  const agent = new BaclinkAgent({
    deepseekApiKey: apiKey,
    seoApiKeys: {
      crawly: process.env.CRAWLY_API_KEY ?? '',
      seomcp: process.env.SEOMCP_API_KEY ?? '',
      rankparse: process.env.RANKPARSE_API_KEY ?? '',
      mozscape: process.env.MOZSCAPE_API_KEY ?? '',
    },
    captchaApiKeys: {
      nopecha: process.env.NOPECHA_API_KEY ?? '',
      '2captcha': process.env.TWO_CAPTCHA_API_KEY ?? '',
      capsolver: process.env.CAPSOLVER_API_KEY ?? '',
      fastcaptcha: process.env.FASTCAPTCHA_API_KEY ?? '',
    },
    emailConfig: process.env.SMTP_HOST ? {
      smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        fromName: process.env.FROM_NAME ?? 'Baclink AI',
        fromEmail: process.env.FROM_EMAIL ?? '',
      },
    } : undefined,
    browserOptions: {
      headless: process.env.BROWSER_HEADLESS !== 'false',
    },
  })

  if (process.env.YOUR_SITE) agent.getMemory().remember('your_site', process.env.YOUR_SITE)
  if (process.env.YOUR_VALUE) agent.getMemory().remember('your_value', process.env.YOUR_VALUE)

  const mcp = buildMCPServer(agent)

  if (mode === '--mcp' || mode === 'mcp') {
    console.error(chalk.cyan('[baclink] Starting MCP server over stdio...'))
    const transport = new StdioTransport(mcp)
    transport.start()
    return
  }

  if (mode === '--http' || mode === 'http') {
    const port = parseInt(process.env.MCP_HTTP_PORT ?? '3100')
    console.error(chalk.cyan(`[baclink] Starting MCP HTTP server on port ${port}...`))
    const transport = new HttpTransport(mcp, port)
    await transport.start()

    const dashboard = (await import('./dashboard/app.js')).buildDashboard(agent, mcp)
    const dashPort = parseInt(process.env.DASHBOARD_PORT ?? '3101')
    dashboard.listen(dashPort, () => {
      console.error(chalk.green(`[baclink] Dashboard at http://localhost:${dashPort}`))
      console.error(chalk.gray(`[baclink] MCP endpoint at http://localhost:${port}`))
    })
    return
  }

  if (mode === '--dashboard' || mode === 'dashboard') {
    const port = parseInt(process.env.DASHBOARD_PORT ?? '3101')
    const mcpPort = parseInt(process.env.MCP_HTTP_PORT ?? '3100')
    const httpTransport = new HttpTransport(mcp, mcpPort)
    await httpTransport.start()
    const dashboard = (await import('./dashboard/app.js')).buildDashboard(agent, mcp)
    dashboard.listen(port, () => {
      console.error(chalk.green(`[baclink] Dashboard at http://localhost:${port}`))
    })
    return
  }

  printBanner()
  let running = true
  while (running) {
    printStatus(agent)
    const action = await showMenu(agent)

    if (action === 'exit') {
      running = false
      continue
    }
    if (!action) continue

    let spinner: any = null
    try {
      const ora = (await import('ora')).default
      spinner = ora({ text: chalk.cyan('Agent thinking...'), color: 'cyan' }).start()
      const result = await agent.process(action)
      spinner.stop()
      if (result) {
        printResult(result)
      }
    } catch (err: any) {
      if (spinner) spinner.fail(chalk.red(`Error: ${err?.message ?? String(err)}`))
      else console.error(chalk.red(`Error: ${err?.message ?? String(err)}`))
    }
  }

  await agent.destroy()
  console.log(chalk.gray('\nGoodbye! 👋'))
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err?.message ?? String(err)}`))
  process.exit(1)
})
