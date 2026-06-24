import OpenAI from 'openai'
import type { LLMMessage } from '../../types/index.js'

export interface LLMConfig {
  apiKey: string
  model?: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  baseURL?: string
  maxTokens?: number
  temperature?: number
}

export class LLMClient {
  private client: OpenAI
  private model: string
  private maxTokens: number
  private temperature: number

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? 'https://api.deepseek.com',
    })
    this.model = config.model ?? 'deepseek-v4-flash'
    this.maxTokens = config.maxTokens ?? 8192
    this.temperature = config.temperature ?? 0.7
  }

  async chat(
    messages: LLMMessage[],
    options?: { model?: string; jsonMode?: boolean; maxTokens?: number; temperature?: number }
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
    })

    return response.choices[0]?.message?.content ?? ''
  }

  async chatWithThinking(
    messages: LLMMessage[],
    options?: { model?: string; reasoningEffort?: 'low' | 'high' | 'max' }
  ): Promise<{ content: string; reasoning: string }> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? 'deepseek-v4-pro',
      messages,
      thinking: { type: 'enabled' },
      reasoning_effort: options?.reasoningEffort ?? 'high',
    } as OpenAI.ChatCompletionCreateParamsNonStreaming)

    const choice = response.choices[0]?.message as unknown as {
      content: string
      reasoning_content?: string
    } | undefined

    return {
      content: choice?.content ?? '',
      reasoning: choice?.reasoning_content ?? '',
    }
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: { model?: string }
  ): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  async summarize(content: string, maxWords = 100): Promise<string> {
    const summary = await this.chat([
      { role: 'system', content: `Summarize the following text in ${maxWords} words or fewer. Be concise and preserve key facts.` },
      { role: 'user', content },
    ])
    return summary
  }
}
