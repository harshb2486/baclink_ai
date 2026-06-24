import type { ContactInfo } from '../../types/index.js'

export interface PageInfo {
  title: string | null
  description: string | null
  text: string
  links: string[]
  emails: string[]
  social: Record<string, string>
  statusCode: number
}

export interface BrowserOptions {
  headless?: boolean
  timeout?: number
  useStealth?: boolean
}

export class BrowserAutomation {
  private options: BrowserOptions
  private browser: any = null

  constructor(options: BrowserOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      useStealth: true,
      ...options,
    }
  }

  async getPageInfo(url: string): Promise<PageInfo> {
    if (this.options.useStealth) {
      return this.scrapeWithPuppeteer(url)
    }
    return this.scrapeWithCheerio(url)
  }

  private async scrapeWithCheerio(url: string): Promise<PageInfo> {
    const cheerio = await import('cheerio')
    const axios = (await import('axios')).default
    try {
      const { data, status } = await axios.get(url, {
        timeout: this.options.timeout,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
      })
      const $ = cheerio.load(data)

      const emails: string[] = []
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      const text = $('body').text()
      const matches = text.match(emailRegex)
      if (matches) {
        for (const m of matches) {
          if (!m.includes('example.com') && !m.includes('.png') && !m.includes('.jpg') && !emails.includes(m)) {
            emails.push(m)
          }
        }
      }
      $('a[href^="mailto:"]').each((_, el) => {
        const email = $(el).attr('href')?.replace('mailto:', '').split('?')[0]
        if (email && !emails.includes(email)) emails.push(email)
      })

      const social: Record<string, string> = {}
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? ''
        if (href.includes('linkedin.com/')) social.linkedin = href
        else if (href.includes('twitter.com/') || href.includes('x.com/')) social.twitter = href
        else if (href.includes('facebook.com/')) social.facebook = href
        else if (href.includes('youtube.com/')) social.youtube = href
        else if (href.includes('github.com/')) social.github = href
      })

      const links: string[] = []
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (href && href.startsWith('http')) links.push(href)
      })

      return {
        title: $('title').first().text() || null,
        description: $('meta[name="description"]').attr('content') || null,
        text: text.substring(0, 10000),
        links: links.slice(0, 200),
        emails: [...new Set(emails)],
        social,
        statusCode: status,
      }
    } catch (err: any) {
      if (err?.response?.status) {
        return { title: null, description: null, text: '', links: [], emails: [], social: {}, statusCode: err.response.status }
      }
      throw err
    }
  }

  private async scrapeWithPuppeteer(url: string): Promise<PageInfo> {
    try {
      const puppeteerExtra = (await import('puppeteer-extra')).default
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
      puppeteerExtra.use(StealthPlugin())
      const browser = await puppeteerExtra.launch({
        headless: this.options.headless as any,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-web-security'],
      })
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')

      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: this.options.timeout,
      })
      const statusCode = response?.status() ?? 0

      const title = await page.title()
      const description = await page.evaluate(() => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null)
      const text = await page.evaluate(() => document.body.innerText.substring(0, 10000))
      const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => (a as HTMLAnchorElement).href).filter(h => h.startsWith('http')))

      const emails: string[] = await page.evaluate(() => {
        const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
        const allText = document.body.innerText
        const matches = allText.match(regex) ?? []
        return [...new Set(matches.filter(m => !m.includes('example.com') && !m.includes('.png') && !m.includes('.jpg')))]
      })

      const social: Record<string, string> = await page.evaluate(() => {
        const result: Record<string, string> = {}
        document.querySelectorAll('a[href]').forEach(a => {
          const href = (a as HTMLAnchorElement).href
          if (href.includes('linkedin.com/')) result.linkedin = href
          else if (href.includes('twitter.com/') || href.includes('x.com/')) result.twitter = href
          else if (href.includes('facebook.com/')) result.facebook = href
          else if (href.includes('youtube.com/')) result.youtube = href
          else if (href.includes('github.com/')) result.github = href
        })
        return result
      })

      await browser.close()

      return {
        title, description, text: text.substring(0, 10000),
        links: links.slice(0, 200), emails: [...new Set(emails)], social, statusCode,
      }
    } catch {
      return this.scrapeWithCheerio(url)
    }
  }

  async findContactInfo(url: string): Promise<ContactInfo> {
    const contactPaths = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/support']
    const baseUrl = new URL(url).origin
    const allEmails: string[] = []
    const allPhones: string[] = []
    const social: Record<string, string> = {}

    for (const path of ['', ...contactPaths]) {
      try {
        const pageUrl = path ? `${baseUrl}${path}` : url
        const info = await this.getPageInfo(pageUrl)
        for (const e of info.emails) { if (!allEmails.includes(e)) allEmails.push(e) }
        Object.assign(social, info.social)

        const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{6,15}/g
        const phones = info.text.match(phoneRegex)
        if (phones) {
          for (const p of phones) {
            const cleaned = p.replace(/[^0-9+]/g, '')
            if (cleaned.length >= 7 && cleaned.length <= 15 && !allPhones.includes(cleaned)) allPhones.push(cleaned)
          }
        }
      } catch { continue }
    }

    return { emails: [...new Set(allEmails)], phones: [...new Set(allPhones)], social }
  }

  async checkLinkAlive(url: string): Promise<boolean> {
    try {
      const axios = (await import('axios')).default
      const { status } = await axios.head(url, { timeout: 10000 })
      return status < 400
    } catch {
      try {
        const info = await this.scrapeWithCheerio(url)
        return info.statusCode < 400
      } catch { return false }
    }
  }
}
