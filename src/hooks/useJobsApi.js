// Thin fetch helpers. In dev, Vite proxies /api → the Express server (see vite.config.js).
const API = import.meta.env.VITE_API_URL || '/api'

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body != null && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// Jobs
export const fetchJobs = () => req('/jobs')
export const saveAllJobs = jobs => req('/jobs', { method: 'PUT', body: jobs })
export const addJob = job => req('/jobs', { method: 'POST', body: job })
export const updateJob = (id, changes) => req(`/jobs/${id}`, { method: 'PATCH', body: changes })
export const deleteJob = id => req(`/jobs/${id}`, { method: 'DELETE' })

// Agentic state
export const fetchState = () => req('/state')
export const fetchHealth = () => req('/health')
export const runAgent = (name, body = {}) => req(`/agents/${name}/run`, { method: 'POST', body })
export const updateConfig = cfg => req('/config', { method: 'PUT', body: cfg })

// Discovered feed
export const trackDiscovered = (id, status) => req(`/discovered/${id}/track`, { method: 'POST', body: { status } })
export const patchDiscovered = (id, changes) => req(`/discovered/${id}`, { method: 'PATCH', body: changes })

// Journal
export const addJournalEntry = entry => req('/journal', { method: 'POST', body: entry })
export const deleteJournalEntry = id => req(`/journal/${id}`, { method: 'DELETE' })

// Email signals
export const ingestSignals = items => req('/emails/ingest', { method: 'POST', body: items })
export const applySignal = (id, body = {}) => req(`/emails/${id}/apply`, { method: 'POST', body })
export const patchSignal = (id, changes) => req(`/emails/${id}`, { method: 'PATCH', body: changes })

// Outbox
export const emailTemplates = jobId => req(`/outbox/templates/${jobId || 'none'}`)
export const createDraft = draft => req('/outbox', { method: 'POST', body: draft })
export const patchDraft = (id, changes) => req(`/outbox/${id}`, { method: 'PATCH', body: changes })
export const deleteDraft = id => req(`/outbox/${id}`, { method: 'DELETE' })
export const sendDraft = id => req(`/outbox/${id}/send`, { method: 'POST' })

// Improvements
export const dismissImprovement = key => req(`/improvements/${encodeURIComponent(key)}/dismiss`, { method: 'POST' })

// Browser apply (human-in-the-loop)
export const applyQueue = () => req('/apply/queue')
export const queueApply = body => req('/apply/queue', { method: 'POST', body })
export const applyPacket = jobId => req(`/apply/${jobId}/packet`)
export const applyResult = (jobId, body) => req(`/apply/${jobId}/result`, { method: 'POST', body })
export const cancelApply = jobId => req(`/apply/${jobId}`, { method: 'DELETE' })
