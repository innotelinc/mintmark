import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DEFAULT_API_BASE } from './config'
import type { Appraisal, AppraisalSummary, AppState } from './types'

const STORE_KEY = 'mintmark.apiBase'
const VISITOR_KEY = 'mintmark.visitor'
const QUERY_RETRY = 1

let apiBase = DEFAULT_API_BASE

const clean = (value: string) => value.trim().replace(/\/+$/, '')

/** The base URL without a trailing slash, e.g. https://mintmark.example.workers.dev */
export const getApiBase = () => apiBase

/** Reads the override a tester saved on the Admin screen, if any. */
export async function loadApiBase(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORE_KEY)
    if (stored) apiBase = clean(stored)
  } catch {
    /* a missing store is not worth blocking startup */
  }
  return apiBase
}

export async function saveApiBase(value: string): Promise<string> {
  const next = clean(value)
  apiBase = next
  try {
    if (next) await AsyncStorage.setItem(STORE_KEY, next)
    else await AsyncStorage.removeItem(STORE_KEY)
  } catch {
    /* the value still applies for this session */
  }
  return next
}

const randomId = () =>
  Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')

let visitorPromise: Promise<string> | undefined

/**
 * A stable id for this install. A native build carries no cookie, and behind the
 * friendly name every request would otherwise arrive from the edge's address
 * and share one collection and one daily allowance. Kept per device instead.
 */
function visitorId(): Promise<string> {
  visitorPromise ??= (async () => {
    try {
      const stored = await AsyncStorage.getItem(VISITOR_KEY)
      if (stored && /^[0-9a-f]{16}$/.test(stored)) return stored
      const made = randomId()
      await AsyncStorage.setItem(VISITOR_KEY, made)
      return made
    } catch {
      return randomId()
    }
  })()
  return visitorPromise
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public resetsAt?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function readError(response: Response): Promise<ApiError> {
  let message = response.statusText || 'Request failed.'
  let code: string | undefined
  let resetsAt: number | undefined
  try {
    const body = (await response.json()) as { error?: string; message?: string; resetsAt?: number }
    message = body.message ?? body.error ?? message
    code = body.error
    resetsAt = body.resetsAt
  } catch {
    /* no body */
  }
  return new ApiError(response.status, message, code, resetsAt)
}

export async function api<T>(path: string, init: (RequestInit & { json?: unknown }) | undefined = {}): Promise<T> {
  const base = getApiBase()
  if (!base) throw new ApiError(0, 'No server is configured. Add one on the Admin screen.')
  const { json, ...rest } = init
  const visitor = await visitorId()
  let response: Response
  try {
    response = await fetch(`${base}/api${path}`, {
      ...rest,
      headers: {
        accept: 'application/json',
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        'x-mintmark-visitor': visitor,
        ...((rest.headers as Record<string, string> | undefined) ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
    })
  } catch {
    throw new ApiError(0, `Could not reach ${base}. Check the server address and your connection.`)
  }
  if (!response.ok) throw await readError(response)
  return (await response.json()) as T
}

const key = (...parts: (string | number)[]) => [getApiBase(), ...parts]

export type AppraisalPage = { appraisal: Appraisal }

export const useAppState = () =>
  useQuery({
    queryKey: key('state'),
    queryFn: () => api<AppState>('/state'),
    retry: QUERY_RETRY,
    staleTime: 15_000,
    // Until a key is configured, keep checking so the app unlocks by itself
    // once one is saved in the web admin or set on the server.
    refetchInterval: (query) => (query.state.data && !query.state.data.capabilities.vision ? 8_000 : false),
  })

export const useAppraisals = () =>
  useQuery({ queryKey: key('appraisals'), queryFn: () => api<{ items: AppraisalSummary[] }>('/appraisals'), retry: QUERY_RETRY })

export const useAppraisal = (id: string | undefined) =>
  useQuery({
    queryKey: key('appraisal', id ?? ''),
    queryFn: () => api<AppraisalPage>(`/appraisals/${id}`),
    enabled: Boolean(id),
    retry: QUERY_RETRY,
    staleTime: 60_000,
  })

export function useCreateAppraisal() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { image: string; thumb: string; note: string }) => api<AppraisalPage>('/appraisals', { method: 'POST', json: input }),
    onSuccess: ({ appraisal }) => {
      client.setQueryData(key('appraisal', appraisal.id), { appraisal })
      void client.invalidateQueries({ queryKey: key('appraisals') })
      void client.invalidateQueries({ queryKey: key('state') })
    },
  })
}

export function useDeleteAppraisal() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/appraisals/${id}`, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      client.removeQueries({ queryKey: key('appraisal', id) })
      void client.invalidateQueries({ queryKey: key('appraisals') })
      void client.invalidateQueries({ queryKey: key('state') })
    },
  })
}

export function useDeleteAllAppraisals() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/appraisals', { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: key('appraisals') })
      void client.invalidateQueries({ queryKey: key('state') })
    },
  })
}

export function useSaveGatewayKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (gatewayKey: string) => api<{ ok: true }>('/admin/key', { method: 'POST', json: { key: gatewayKey } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: key('state') }),
  })
}

export function useClearGatewayKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/admin/key', { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: key('state') }),
  })
}

export function useSetRequireKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (requireKey: boolean) => api<{ ok: true }>('/admin/require-key', { method: 'POST', json: { requireKey } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: key('state') }),
  })
}
