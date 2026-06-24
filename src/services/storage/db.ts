import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'baclink-store.json')

interface StoredData {
  prospects: Record<string, any>
  campaigns: Record<string, any>
  campaignProspects: Record<string, any>
  outreachEmails: Record<string, any>
  conversations: Record<string, any>
  backlinks: Record<string, any>
  unlinkedMentions: Record<string, any>
  radarAlerts: Record<string, any>
  agentMemory: Record<string, any>
  settings: Record<string, any>
}

let data: StoredData | null = null

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function load(): StoredData {
  if (data) return data
  ensureDir()
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8')
      data = JSON.parse(raw) as StoredData
    } catch {
      data = null
    }
  }
  if (!data) {
    data = {
      prospects: {},
      campaigns: {},
      campaignProspects: {},
      outreachEmails: {},
      conversations: {},
      backlinks: {},
      unlinkedMentions: {},
      radarAlerts: {},
      agentMemory: {},
      settings: {},
    }
  }
  return data
}

function save(): void {
  ensureDir()
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function getStore(): StoredData {
  return load()
}

export function getDb(): { prepare: (sql: string) => { run: (...args: any[]) => void; get: (...args: any[]) => any; all: (...args: any[]) => any[] } } {
  load()
  return {
    prepare: (sql: string) => ({
      run: (...args: any[]) => {
        executeSql(sql, args)
        save()
      },
      get: (...args: any[]) => executeSql(sql, args, true),
      all: (...args: any[]) => executeSql(sql, args, false) as any[],
    })
  }
}

function executeSql(sql: string, params: any[], single?: boolean): any {
  const store = getStore()

  if (sql.startsWith('SELECT') || sql.includes('SELECT')) {
    const tableMatch = sql.match(/FROM\s+(\w+)/i)
    if (!tableMatch) return single ? undefined : []
    const table = tableMatch[1]
    const entities = Object.values((store as any)[table] ?? {}) as any[]

    if (sql.includes('WHERE')) {
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s|\s+LIMIT|\s*$)/i)
      if (whereMatch) {
        const conditions = whereMatch[1]
        const filtered = entities.filter(e => matchConditions(e, conditions, params))
        const limitMatch = sql.match(/LIMIT\s+(\d+)/i)
        const limit = limitMatch ? parseInt(limitMatch[1]) : filtered.length
        const result = filtered.slice(0, limit)
        return single ? result[0] : result
      }
    }

    if (sql.includes('ORDER BY')) {
      const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s*(DESC)?/i)
      if (orderMatch) {
        const field = orderMatch[1]
        const desc = orderMatch[2]?.toUpperCase() === 'DESC'
        entities.sort((a: any, b: any) => {
          if (desc) return (b[field] ?? '') > (a[field] ?? '') ? 1 : -1
          return (a[field] ?? '') > (b[field] ?? '') ? 1 : -1
        })
      }
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i)
    const limit = limitMatch ? parseInt(limitMatch[1]) : entities.length
    const result = entities.slice(0, limit)
    return single ? result[0] : result
  }

  if (sql.startsWith('INSERT')) {
    const tableMatch = sql.match(/INTO\s+(\w+)/i)
    if (!tableMatch) return
    const table = tableMatch[1] as keyof StoredData
    const storeTable = store[table] as Record<string, any>

    const columnsMatch = sql.match(/\((.+?)\)/)
    const valuesMatch = sql.match(/VALUES\s*\((.+?)\)/i)
    if (!columnsMatch || !valuesMatch) return

    const columns = columnsMatch[1].split(',').map(c => c.trim().replace(/['"]/g, ''))
    const placeholders = valuesMatch[1].split(',').map(p => p.trim())
    const idIndex = columns.indexOf('id')
    const id = idIndex >= 0 ? params[idIndex] ?? crypto.randomUUID() : crypto.randomUUID()

    const record: Record<string, any> = { id }
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] !== 'id') {
        record[columns[i]] = params[i] ?? null
      }
    }

    storeTable[id] = record
    save()
    return
  }

  if (sql.startsWith('UPDATE')) {
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i)
    if (!tableMatch) return
    const table = tableMatch[1] as keyof StoredData
    const storeTable = store[table] as Record<string, any>

    const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|\s*$)/i)
    const whereMatch = sql.match(/WHERE\s+(.+?)$/i)

    if (!setMatch) return

    const setClauses = setMatch[1].split(',').map(s => s.trim())
    const setFields: Array<{ key: string; paramIndex: number }> = []
    let paramIndex = 0

    for (const clause of setClauses) {
      const eqMatch = clause.match(/(\w+)\s*=\s*(\?|datetime\('now'\))/i)
      if (eqMatch) {
        if (eqMatch[2] === '?') {
          setFields.push({ key: eqMatch[1], paramIndex: paramIndex++ })
        }
      }
    }

    if (!whereMatch) {
      for (const id of Object.keys(storeTable)) {
        for (const field of setFields) {
          if (field.key === 'updated_at') {
            storeTable[id][field.key] = new Date().toISOString()
          } else {
            const val = params[field.paramIndex]
            if (val !== undefined) storeTable[id][field.key] = val
          }
        }
      }
      save()
      return
    }

    const whereClause = whereMatch[1]
    const paramOffset = paramIndex
    const whereParams = params.slice(paramOffset)

    for (const [id, record] of Object.entries(storeTable)) {
      if (matchConditions(record, whereClause, whereParams)) {
        for (const field of setFields) {
          if (field.key === 'updated_at') {
            storeTable[id][field.key] = new Date().toISOString()
          } else {
            const val = params[field.paramIndex]
            if (val !== undefined) storeTable[id][field.key] = val
          }
        }
      }
    }
    save()
    return
  }

  if (sql.startsWith('INSERT OR REPLACE') || sql.startsWith('INSERT OR IGNORE')) {
    const tableMatch = sql.match(/INTO\s+(\w+)/i)
    if (!tableMatch) return
    const table = tableMatch[1] as keyof StoredData
    const storeTable = store[table] as Record<string, any>

    const columnsMatch = sql.match(/\((.+?)\)/)
    const valuesMatch = sql.match(/VALUES\s*\((.+?)\)/i)
    if (!columnsMatch || !valuesMatch) return

    const columns = columnsMatch[1].split(',').map(c => c.trim().replace(/['"]/g, ''))
    const idIndex = columns.indexOf('id')
    const id = idIndex >= 0 ? params[idIndex] : crypto.randomUUID()

    if (sql.includes('IGNORE') && storeTable[id]) return

    const record: Record<string, any> = { id }
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] !== 'id') {
        record[columns[i]] = params[i] ?? null
      }
    }

    storeTable[id] = record
    save()
    return
  }

  if (sql.startsWith('DELETE')) {
    const tableMatch = sql.match(/FROM\s+(\w+)/i)
    if (!tableMatch) return
    const table = tableMatch[1] as keyof StoredData
    const storeTable = store[table] as Record<string, any>

    const whereMatch = sql.match(/WHERE\s+(.+?)$/i)
    if (!whereMatch) {
      store[table] = {} as any
      save()
      return
    }

    const whereClause = whereMatch[1]
    for (const [id, record] of Object.entries(storeTable)) {
      if (matchConditions(record, whereClause, params)) {
        delete storeTable[id]
      }
    }
    save()
    return
  }
}

function matchConditions(record: any, whereClause: string, params: any[]): boolean {
  if (!whereClause) return true

  const conditions = whereClause.split(/\s+AND\s+/i)
  let paramIdx = 0

  for (const condition of conditions) {
    const match = condition.match(/(\w+)\s*(=|!=|LIKE|>|<|>=|<=)\s*(\?|'.*?')/i)
    if (!match) continue

    const field = match[1]
    const op = match[2]
    const value = match[3] === '?' ? params[paramIdx++] : match[3].replace(/'/g, '')

    const recordValue = record[field]

    switch (op) {
      case '=':
        if (String(recordValue) !== String(value)) return false
        break
      case '!=':
        if (String(recordValue) === String(value)) return false
        break
      case 'LIKE': {
        const pattern = String(value).replace(/%/g, '.*')
        if (!new RegExp(`^${pattern}$`, 'i').test(String(recordValue))) return false
        break
      }
      default:
        break
    }
  }

  return true
}

export function closeDb(): void {
  if (data) save()
}

export const dbOps = {
  prospects: {
    upsert(prospect: {
      domain: string
      daScore?: number | null
      paScore?: number | null
      spamScore?: number | null
      relevance?: number
      source?: string
      category?: string | null
      contacts?: string | null
    }): string {
      const store = getStore()
      const existing = Object.values(store.prospects).find((p: any) => p.domain === prospect.domain) as any
      if (existing) {
        Object.assign(existing, {
          da_score: prospect.daScore ?? existing.da_score,
          pa_score: prospect.paScore ?? existing.pa_score,
          spam_score: prospect.spamScore ?? existing.spam_score,
          relevance: prospect.relevance ?? existing.relevance,
          source: prospect.source ?? existing.source,
          category: prospect.category ?? existing.category,
          contacts_json: prospect.contacts ?? existing.contacts_json,
          updated_at: new Date().toISOString(),
        })
        save()
        return existing.id
      }
      const id = crypto.randomUUID()
      store.prospects[id] = {
        id,
        domain: prospect.domain,
        da_score: prospect.daScore ?? null,
        pa_score: prospect.paScore ?? null,
        spam_score: prospect.spamScore ?? null,
        relevance: prospect.relevance ?? 0,
        status: 'discovered',
        contacts_json: prospect.contacts ?? null,
        notes: '',
        source: prospect.source ?? '',
        category: prospect.category ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      save()
      return id
    },
    findByDomain(domain: string) {
      const store = getStore()
      return Object.values(store.prospects).find((p: any) => p.domain === domain) ?? null
    },
    listByStatus(status: string, limit = 100) {
      const store = getStore()
      return Object.values(store.prospects)
        .filter((p: any) => p.status === status)
        .sort((a: any, b: any) => (b.relevance ?? 0) - (a.relevance ?? 0))
        .slice(0, limit)
    },
    listAll(limit = 100) {
      const store = getStore()
      return Object.values(store.prospects)
        .sort((a: any, b: any) => (b.relevance ?? 0) - (a.relevance ?? 0))
        .slice(0, limit)
    },
    updateStatus(id: string, status: string) {
      const store = getStore()
      if (store.prospects[id]) {
        store.prospects[id].status = status
        store.prospects[id].updated_at = new Date().toISOString()
        save()
      }
    }
  },

  campaigns: {
    create(name: string, niche = '', goal = ''): string {
      const store = getStore()
      const id = crypto.randomUUID()
      store.campaigns[id] = {
        id, name, niche, goal,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      save()
      return id
    },
    list() {
      return Object.values(getStore().campaigns).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    },
    get(id: string) {
      return getStore().campaigns[id] ?? null
    },
    addProspect(campaignId: string, prospectId: string, score = 0) {
      const store = getStore()
      const key = `${campaignId}:${prospectId}`
      if (!store.campaignProspects[key]) {
        store.campaignProspects[key] = { campaign_id: campaignId, prospect_id: prospectId, status: 'discovered', outreach_stage: 'none', score }
        save()
      }
    }
  },

  emails: {
    create(email: {
      campaignId: string
      prospectId: string
      variant: string
      subject: string
      bodyHtml: string
      bodyText: string
    }): string {
      const store = getStore()
      const id = crypto.randomUUID()
      store.outreachEmails[id] = {
        id,
        campaign_id: email.campaignId,
        prospect_id: email.prospectId,
        variant: email.variant,
        subject: email.subject,
        body_html: email.bodyHtml,
        body_text: email.bodyText,
        sent_at: null,
        opened_at: null,
        replied_at: null,
        status: 'draft',
        error: null,
      }
      save()
      return id
    },
    updateStatus(id: string, status: string, error?: string) {
      const store = getStore()
      const email = store.outreachEmails[id]
      if (email) {
        email.status = status
        if (status === 'sent') email.sent_at = new Date().toISOString()
        if (status === 'opened') email.opened_at = new Date().toISOString()
        if (status === 'replied') email.replied_at = new Date().toISOString()
        if (error !== undefined) email.error = error
        save()
      }
    },
    listByCampaign(campaignId: string) {
      return Object.values(getStore().outreachEmails).filter((e: any) => e.campaign_id === campaignId)
    }
  },

  backlinks: {
    upsert(bl: { campaignId: string; sourceUrl: string; targetUrl: string; anchorText?: string | null; dofollow: boolean }): void {
      const store = getStore()
      const existing = Object.values(store.backlinks).find((b: any) => b.source_url === bl.sourceUrl && b.target_url === bl.targetUrl) as any
      if (existing) {
        existing.last_checked = new Date().toISOString()
        existing.dofollow = bl.dofollow ? 1 : 0
        if (bl.anchorText != null) existing.anchor_text = bl.anchorText
        save()
      } else {
        const id = crypto.randomUUID()
        store.backlinks[id] = {
          id,
          campaign_id: bl.campaignId,
          source_url: bl.sourceUrl,
          target_url: bl.targetUrl,
          anchor_text: bl.anchorText ?? null,
          dofollow: bl.dofollow ? 1 : 0,
          status: 'active',
          first_found: new Date().toISOString(),
          last_checked: new Date().toISOString(),
        }
        save()
      }
    },
    listByCampaign(campaignId: string) {
      return Object.values(getStore().backlinks).filter((b: any) => b.campaign_id === campaignId)
    }
  },

  memory: {
    set(key: string, value: string): void {
      getStore().agentMemory[key] = { id: key, key, value, created_at: new Date().toISOString() }
      save()
    },
    get(key: string): string | null {
      return getStore().agentMemory[key]?.value ?? null
    },
    search(prefix: string) {
      return Object.values(getStore().agentMemory).filter((m: any) => m.key.startsWith(prefix))
    }
  },

  mentions: {
    upsert(mention: { brand: string; sourceUrl: string; pageTitle?: string | null; hasLink: boolean }): void {
      const store = getStore()
      const existing = Object.values(store.unlinkedMentions).find((m: any) => m.source_url === mention.sourceUrl)
      if (!existing) {
        const id = crypto.randomUUID()
        store.unlinkedMentions[id] = {
          id, brand: mention.brand, source_url: mention.sourceUrl,
          page_title: mention.pageTitle ?? null, has_link: mention.hasLink ? 1 : 0,
          contacted: 0, created_at: new Date().toISOString(),
        }
        save()
      }
    }
  },

  radar: {
    insert(alert: { type: string; source: string; domain?: string | null; summary: string; relevanceScore: number }): void {
      const store = getStore()
      const id = crypto.randomUUID()
      store.radarAlerts[id] = {
        id, type: alert.type, source: alert.source, domain: alert.domain ?? null,
        summary: alert.summary, relevance_score: alert.relevanceScore,
        actioned: 0, created_at: new Date().toISOString(),
      }
      save()
    },
    listUnactioned(limit = 20) {
      return Object.values(getStore().radarAlerts)
        .filter((a: any) => !a.actioned)
        .sort((a: any, b: any) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
        .slice(0, limit)
    }
  }
}
