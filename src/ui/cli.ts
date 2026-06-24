import inquirer from 'inquirer'
import chalk from 'chalk'
import { BaclinkAgent } from '../agent/core.js'
import { formatNumber } from '../utils/format.js'
import { dbOps } from '../services/storage/db.js'

export function printBanner(): void {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════╗
  ║        ${chalk.bold('Baclink AI')} Agent              ║
  ║   AI-Powered Backlink Management System   ║
  ╚═══════════════════════════════════════════╝
  `))
}

export function printStatus(agent: BaclinkAgent): void {
  const config = agent.getConfig()
  const seo = agent.getSEO()
  const email = agent.getEmailSender()
  const prospects = dbOps.prospects.listAll(1) as any[]
  const campaigns = dbOps.campaigns.list() as any[]
  const alerts = dbOps.radar.listUnactioned(5) as any[]

  console.log(chalk.gray(`\n─── System Status ───`))
  console.log(chalk.green(`  ✓ LLM: DeepSeek ${config.deepseekApiKey ? 'connected' : '⚠️ not set'}`))
  console.log(chalk.green(`  ✓ SEO APIs: ${seo.getConfiguredSources().length} source(s) configured`))
  console.log(chalk.green(`  ✓ Email: ${email ? 'configured' : 'not configured'}`))
  console.log(chalk.gray(`  📊 Prospects: ${formatNumber(prospects.length)}`))
  console.log(chalk.gray(`  📋 Campaigns: ${campaigns.length}`))
  console.log(chalk.gray(`  🔔 Radar Alerts: ${alerts.length} unactioned`))
  console.log(chalk.gray(`────────────────────\n`))
}

export async function showMenu(agent: BaclinkAgent): Promise<string> {
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: chalk.cyan('What would you like to do?'),
    choices: [
      { name: '🔍  Find Backlink Prospects', value: 'prospects' },
      { name: '🆚  Competitor Gap Analysis', value: 'competitor' },
      { name: '🔗  Broken Link Building', value: 'broken' },
      { name: '📢  Unlinked Brand Mentions', value: 'mentions' },
      { name: '✍️  Guest Post Opportunities', value: 'guestpost' },
      { name: '📝  Draft Outreach Email', value: 'draft' },
      { name: '📧  Send Campaign Emails', value: 'send' },
      { name: '📊  Monitor Backlinks', value: 'monitor' },
      { name: '📡  Radar Scan', value: 'radar' },
      { name: '📋  Report', value: 'report' },
      { name: '💬  Free Chat with AI', value: 'chat' },
      { name: '🚪  Exit', value: 'exit' },
    ],
  }])

  if (action === 'exit') return 'exit'

  const prompts: Record<string, () => Promise<any>> = {
    prospects: async () => [{
      type: 'input', name: 'query', message: 'Enter niche/topic:',
      default: 'technology',
    }],
    competitor: async () => [{
      type: 'input', name: 'query', message: 'Your domain + competitor domain (e.g., "myblog.com vs competitor.com"):',
    }],
    broken: async () => [{
      type: 'input', name: 'query', message: 'Target domain and your content summary:',
    }],
    mentions: async () => [{
      type: 'input', name: 'query', message: 'Brand name to search for:',
    }],
    guestpost: async () => [{
      type: 'input', name: 'query', message: 'Niche for guest post opportunities:',
    }],
    draft: async () => [{
      type: 'input', name: 'query', message: 'Prospect domain, your site, and your value proposition:',
    }],
    send: async () => [{
      type: 'confirm', name: 'query', message: 'Send all draft emails in current campaign?',
      default: false,
    }],
    monitor: async () => [{
      type: 'input', name: 'query', message: 'Campaign ID (or press Enter for current):',
    }],
    radar: async () => [{
      type: 'input', name: 'query', message: 'Niche to scan:',
    }],
    report: async () => [{
      type: 'input', name: 'query', message: 'Press Enter to generate report:',
      default: 'report',
    }],
    chat: async () => [{
      type: 'input', name: 'query', message: chalk.cyan('You:'),
    }],
  }

  const promptFn = prompts[action]
  if (!promptFn) return ''

  const questions = await promptFn()
  const answers = await inquirer.prompt(questions)

  if (action === 'send') {
    return 'send my campaign emails now'
  }

  return `${action}: ${answers.query}`
}

export function printResult(result: string): void {
  const lines = result.split('\n')
  for (const line of lines) {
    if (line.startsWith('## ')) {
      console.log(chalk.bold.cyan(`\n${line.replace('## ', '')}`))
    } else if (line.startsWith('### ')) {
      console.log(chalk.bold.yellow(`\n${line.replace('### ', '')}`))
    } else if (line.includes('✅')) {
      console.log(chalk.green(line))
    } else if (line.includes('❌')) {
      console.log(chalk.red(line))
    } else if (line.includes('⚠️') || line.includes('🔔')) {
      console.log(chalk.yellow(line))
    } else if (line.startsWith('- **') || line.startsWith('**')) {
      console.log(chalk.white(line))
    } else if (line.trim()) {
      console.log(chalk.gray(line))
    }
  }
  console.log()
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message,
    default: false,
  }])
  return confirm
}

export async function showQuickActionMenu(): Promise<string> {
  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: chalk.cyan('Quick actions:'),
    choices: [
      { name: '⚡  Find prospects for a niche', value: 'find prospects for' },
      { name: '⚡  Analyze competitor', value: 'analyze competitor' },
      { name: '⚡  Check my backlinks', value: 'check my backlinks' },
      { name: '⚡  Scan niche radar', value: 'scan radar for' },
      { name: '⚡  Show report', value: 'show report' },
      { name: '🔙  Back to main menu', value: '' },
    ],
  }])
  return choice
}
