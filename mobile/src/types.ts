// Mirrors src/shared/types.ts in the web app. The API is identical, so these
// must stay in step with the Worker's responses. Kept local so the Expo bundle
// never reaches outside its own project (EAS/CI uploads only this folder).

export interface AppraisalAnalysis {
  identified: boolean
  name: string
  country: string
  denomination: string
  year: string
  mintMark: string
  variety: string
  composition: string
  rarity: string
  grade: number
  gradeLabel: string
  condition: string
  confidence: number
  valueLow: number
  valueHigh: number
  currency: string
  valueBasis: string
  drivers: string[]
  checks: string[]
  redFlags: string[]
  summary: string
  imageQuality: string
}

export interface Appraisal extends AppraisalAnalysis {
  id: string
  createdAt: number
  /** Full photo as a data URL. */
  image: string
  thumb: string
  note: string
}

export interface AppraisalSummary {
  id: string
  name: string
  subtitle: string
  valueLow: number
  valueHigh: number
  currency: string
  grade: number
  gradeLabel: string
  confidence: number
  identified: boolean
  thumb: string
  createdAt: number
}

export interface AppState {
  capabilities: { vision: boolean; database: boolean; requireKey: boolean }
  gateway: {
    model: string
    baseUrl: string
    keySource: 'stored' | 'env' | null
    keyHint: string | null
  }
  usage: { used: number; limit: number; resetsAt: number }
}
