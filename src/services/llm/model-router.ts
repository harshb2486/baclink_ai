import { LLMClient } from './client.js'

export type TaskDifficulty = 'simple' | 'medium' | 'complex' | 'reasoning'

interface TaskProfile {
  difficulty: TaskDifficulty
  expectedTokens: number
  needsJson: boolean
  needsReasoning: boolean
  maxRetries: number
}

const TASK_PROFILES: Record<string, TaskProfile> = {
  classify_prospect: { difficulty: 'simple', expectedTokens: 500, needsJson: true, needsReasoning: false, maxRetries: 1 },
  score_relevance: { difficulty: 'simple', expectedTokens: 800, needsJson: true, needsReasoning: false, maxRetries: 1 },
  draft_outreach: { difficulty: 'complex', expectedTokens: 2000, needsJson: false, needsReasoning: true, maxRetries: 2 },
  negotiate_reply: { difficulty: 'reasoning', expectedTokens: 3000, needsJson: false, needsReasoning: true, maxRetries: 2 },
  analyze_competitor: { difficulty: 'medium', expectedTokens: 2000, needsJson: true, needsReasoning: false, maxRetries: 1 },
  generate_content: { difficulty: 'complex', expectedTokens: 4000, needsJson: false, needsReasoning: false, maxRetries: 2 },
  summarize_report: { difficulty: 'medium', expectedTokens: 2000, needsJson: false, needsReasoning: false, maxRetries: 1 },
  extract_contacts: { difficulty: 'simple', expectedTokens: 1000, needsJson: true, needsReasoning: false, maxRetries: 1 },
  plan_strategy: { difficulty: 'reasoning', expectedTokens: 4000, needsJson: false, needsReasoning: true, maxRetries: 2 },
}

export class ModelRouter {
  private flash: LLMClient
  private pro: LLMClient

  constructor(apiKey: string) {
    this.flash = new LLMClient({
      apiKey,
      model: 'deepseek-v4-flash',
      maxTokens: 16384,
    })
    this.pro = new LLMClient({
      apiKey,
      model: 'deepseek-v4-pro',
      maxTokens: 65536,
    })
  }

  async execute(taskName: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const profile = TASK_PROFILES[taskName] ?? { difficulty: 'medium', expectedTokens: 1000, needsJson: false, needsReasoning: false, maxRetries: 1 }

    const client = profile.difficulty === 'complex' || profile.difficulty === 'reasoning' ? this.pro : this.flash
    const config: Record<string, unknown> = {}
    if (profile.needsJson) config.jsonMode = true

    for (let attempt = 0; attempt <= profile.maxRetries; attempt++) {
      try {
        if (profile.needsReasoning) {
          const result = await client.chatWithThinking(messages, {
            reasoningEffort: profile.difficulty === 'reasoning' ? 'max' : 'high',
          })
          return result.content
        }
        return await client.chat(messages, config)
      } catch (err) {
        if (attempt === profile.maxRetries) throw err
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
    throw new Error(`Failed to execute ${taskName}`)
  }

  get client(): LLMClient {
    return this.flash
  }
}
