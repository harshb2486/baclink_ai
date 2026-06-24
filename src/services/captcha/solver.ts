import axios from 'axios'
import type { CaptchaSolveResult } from '../../types/index.js'

interface CaptchaProvider {
  name: string
  priority: number
  free: boolean
  solve: (imageBase64: string | undefined, siteUrl: string | undefined, siteKey: string | undefined) => Promise<CaptchaSolveResult>
}

export class CaptchaSolver {
  private providers: CaptchaProvider[] = []
  private apiKeys: Record<string, string> = {}

  constructor(apiKeys: Record<string, string> = {}) {
    this.apiKeys = apiKeys
    this.initProviders()
  }

  private initProviders(): void {
    this.providers = [
      {
        name: 'nopecha',
        priority: 1,
        free: true,
        solve: async (imageBase64: string | undefined, siteUrl: string | undefined, siteKey: string | undefined) => {
          if (!this.apiKeys.nopecha) return { success: false, token: '', provider: 'nopecha', error: 'no key' }
          try {
            const { data } = await axios.post('https://api.nopecha.com/token', {
              type: 'recaptcha_v2',
              sitekey: siteKey,
              pageurl: siteUrl,
              key: this.apiKeys.nopecha,
            })
            if (data?.data) return { success: true, token: data.data, provider: 'nopecha' }
            return { success: false, provider: 'nopecha', error: data?.error ?? 'unknown' }
          } catch (err) {
            return { success: false, provider: 'nopecha', error: String(err) }
          }
        }
      },
      {
        name: '2captcha',
        priority: 2,
        free: false,
        solve: async (imageBase64: string | undefined, siteUrl: string | undefined, siteKey: string | undefined) => {
          if (!this.apiKeys['2captcha']) return { success: false, provider: '2captcha', error: 'no key' }
          try {
            const { data: inResult } = await axios.post('https://2captcha.com/in.php', {
              key: this.apiKeys['2captcha'],
              method: siteKey ? 'userrecaptcha' : 'base64',
              googlekey: siteKey,
              pageurl: siteUrl,
              body: imageBase64,
              json: 1,
            })
            if (inResult.status !== 1) return { success: false, provider: '2captcha', error: inResult.request }

            const requestId = inResult.request
            for (let i = 0; i < 60; i++) {
              await new Promise(r => setTimeout(r, 5000))
              const { data: resResult } = await axios.get('https://2captcha.com/res.php', {
                params: { key: this.apiKeys['2captcha'], action: 'get', id: requestId, json: 1 }
              })
              if (resResult.status === 1) return { success: true, token: resResult.request, provider: '2captcha' }
              if (resResult.request !== 'CAPCHA_NOT_READY') break
            }
            return { success: false, provider: '2captcha', error: 'timeout' }
          } catch (err) {
            return { success: false, provider: '2captcha', error: String(err) }
          }
        }
      },
      {
        name: 'capsolver',
        priority: 3,
        free: false,
        solve: async (imageBase64: string | undefined, siteUrl: string | undefined, siteKey: string | undefined) => {
          if (!this.apiKeys.capsolver) return { success: false, provider: 'capsolver', error: 'no key' }
          try {
            const task = siteKey ? {
              type: 'ReCaptchaV2Task',
              websiteURL: siteUrl,
              websiteKey: siteKey,
            } : {
              type: 'ImageToTextTask',
              body: imageBase64,
            }
            const { data: createResult } = await axios.post('https://api.capsolver.com/createTask', {
              clientKey: this.apiKeys.capsolver,
              task,
            })
            if (!createResult?.taskId) return { success: false, provider: 'capsolver', error: 'no task id' }
            for (let i = 0; i < 60; i++) {
              await new Promise(r => setTimeout(r, 3000))
              const { data: result } = await axios.post('https://api.capsolver.com/getTaskResult', {
                clientKey: this.apiKeys.capsolver,
                taskId: createResult.taskId,
              })
              if (result.status === 'ready') return { success: true, token: result.solution?.gRecaptchaResponse ?? result.solution?.text, provider: 'capsolver' }
            }
            return { success: false, provider: 'capsolver', error: 'timeout' }
          } catch (err) {
            return { success: false, provider: 'capsolver', error: String(err) }
          }
        }
      },
      {
        name: 'fastcaptcha',
        priority: 0,
        free: true,
        solve: async (imageBase64: string | undefined, _siteUrl: string | undefined, _siteKey: string | undefined) => {
          if (!this.apiKeys.fastcaptcha) return { success: false, provider: 'fastcaptcha', error: 'no key' }
          if (!imageBase64) return { success: false, provider: 'fastcaptcha', error: 'no image' }
          try {
            const { data } = await axios.post('https://fastcaptcha.org/api/v1/ocr/', {
              base64_image: imageBase64,
            }, {
              headers: { 'X-API-Key': this.apiKeys.fastcaptcha }
            })
            if (data?.success && data?.text) return { success: true, text: data.text, provider: 'fastcaptcha' }
            return { success: false, provider: 'fastcaptcha', error: data?.error ?? 'unknown' }
          } catch (err) {
            return { success: false, provider: 'fastcaptcha', error: String(err) }
          }
        }
      },
    ].sort((a, b) => a.priority - b.priority)
  }

  async solveCaptcha(options: {
    imageBase64?: string
    siteUrl?: string
    siteKey?: string
    preferredProvider?: string
  }): Promise<CaptchaSolveResult> {
    let providers = this.providers
    if (options.preferredProvider) {
      const preferred = providers.find(p => p.name === options.preferredProvider)
      if (preferred) providers = [preferred, ...providers.filter(p => p.name !== options.preferredProvider)]
    }

    for (const provider of providers) {
      if (provider.name === 'fastcaptcha' && !options.imageBase64) continue
      if ((provider.name === '2captcha' || provider.name === 'capsolver' || provider.name === 'nopecha') && !options.siteKey) continue

      const result = await provider.solve(options.imageBase64, options.siteUrl, options.siteKey)
      if (result.success) return result
    }

    return { success: false, token: '', provider: 'none', error: 'all providers failed' }
  }

  async solveImageCaptcha(imageBase64: string): Promise<string | null> {
    const result = await this.solveCaptcha({ imageBase64 })
    return result.text ?? result.token ?? null
  }

  async solveReCaptcha(siteUrl: string, siteKey: string): Promise<string | null> {
    const result = await this.solveCaptcha({ siteUrl, siteKey })
    return result.token ?? null
  }

  getConfiguredProviders(): string[] {
    return Object.keys(this.apiKeys).filter(k => this.apiKeys[k])
  }
}
