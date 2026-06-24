import { dbOps } from '../services/storage/db.js'

export class AgentMemory {
  private sessionId: string

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID()
  }

  remember(key: string, value: string): void {
    dbOps.memory.set(`session:${this.sessionId}:${key}`, value)
    dbOps.memory.set(`global:${key}`, value)
  }

  recall(key: string): string | null {
    return dbOps.memory.get(`session:${this.sessionId}:${key}`) ?? dbOps.memory.get(`global:${key}`)
  }

  recallGlobal(key: string): string | null {
    return dbOps.memory.get(`global:${key}`)
  }

  rememberPreference(key: string, value: string): void {
    dbOps.memory.set(`pref:${key}`, value)
  }

  getPreference(key: string): string | null {
    return dbOps.memory.get(`pref:${key}`)
  }

  getSessionHistory(limit = 20): string[] {
    const entries = dbOps.memory.search(`session:${this.sessionId}:`)
    return entries.slice(0, limit).map((e: any) => `${e.key}: ${e.value}`)
  }

  getSessionId(): string {
    return this.sessionId
  }
}
