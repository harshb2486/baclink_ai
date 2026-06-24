import nodemailer from 'nodemailer'
import type { OutreachEmail } from '../../types/index.js'

export interface EmailConfig {
  smtp: {
    host: string
    port: number
    user: string
    pass: string
    fromName: string
    fromEmail: string
  }
  tracking?: boolean
  throttleMs?: number
}

interface SendResult {
  success: boolean
  id?: string
  error?: string
}

export class EmailSender {
  private transporter: nodemailer.Transporter | null = null
  private config: EmailConfig
  private lastSendTime = 0

  constructor(config: EmailConfig) {
    this.config = config
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.port === 465,
        auth: { user: this.config.smtp.user, pass: this.config.smtp.pass },
        rateLimit: 10,
      } as nodemailer.TransportOptions)
    }
    return this.transporter
  }

  private async throttle(): Promise<void> {
    const throttleMs = this.config.throttleMs ?? 1000
    const elapsed = Date.now() - this.lastSendTime
    if (elapsed < throttleMs) {
      await new Promise(r => setTimeout(r, throttleMs - elapsed))
    }
    this.lastSendTime = Date.now()
  }

  async sendEmail(email: {
    to: string
    subject: string
    html: string
    text?: string
    replyTo?: string
  }): Promise<SendResult> {
    await this.throttle()
    try {
      const transporter = this.getTransporter()
      const info = await transporter.sendMail({
        from: `"${this.config.smtp.fromName}" <${this.config.smtp.fromEmail}>`,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text ?? email.html.replace(/<[^>]+>/g, ''),
        replyTo: email.replyTo ?? this.config.smtp.fromEmail,
        headers: {
          'List-Unsubscribe': `<mailto:${this.config.smtp.fromEmail}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })
      return { success: true, id: info.messageId }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  }

  async sendCampaignEmail(email: OutreachEmail, prospectEmail: string): Promise<SendResult> {
    return this.sendEmail({
      to: prospectEmail,
      subject: email.subject,
      html: email.bodyHtml,
      text: email.bodyText,
    })
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const transporter = this.getTransporter()
      await transporter.verify()
      return true
    } catch {
      return false
    }
  }

  async sendBatch(emails: Array<{ to: string; subject: string; html: string; text?: string }>): Promise<SendResult[]> {
    const results: SendResult[] = []
    for (const email of emails) {
      const result = await this.sendEmail(email)
      results.push(result)
    }
    return results
  }
}
