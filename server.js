import express from 'express'
import cors from 'cors'
import { load, mutate, addJournal, lastRun, uid, nowIso, today, DATA_FILE, AGENTS } from './agents/lib/store.mjs'
import { ingestSignal, applySignal, emailTemplates, sendMail, emailConfigured, mdToHtml, classifySignal, matchJob } from './agents/lib/email.mjs'
import { runAgent, isRunning, runningAgents } from './agents/lib/runner.mjs'
import { ingestDiscovered, rescore, hygiene } from './agents/lib/ingest.mjs'
import { buildPacket, queueApply, recordApplyResult, DEFAULT_APPLICATION_PROFILE, DEFAULT_SCREENING_ANSWERS } from './agents/lib/apply.mjs'

const app = express()
const PORT = process.env.PORT || 3001
const SCHEDULER = process.env.AGENT_SCHEDULER !== 'off'

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Initialize / migrate the data file on boot
load()

const ok = (res, fn) => { try { res.json(fn()) } catch (e) { res.status(e.status || 500).json({ error: e.message }) } }
const okAsync = async (res, fn) => { try { res.json(await fn()) } catch (e) { res.status(e.status || 500).json({ error: e.message }) } }

// ── Health / state ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, data_file: DATA_FILE, time: nowIso(), email_configured: emailConfigured(), scheduler: SCHEDULER, running: runningAgents() }))

function agentStatus(data) {
  const cfg = data.config
  const intervals = { fetch: cfg.fetch_interval_min, scan: cfg.scan_interval_min, digest: null, 'email-sync': null }
  return AGENTS.map(name => {
    const r = lastRun(data, name)
    let next_due = null
    if (intervals[name] && r?.started_at) next_due = new Date(new Date(r.started_at).getTime() + intervals[name] * 60000).toISOString()
    return { agent: name, running: isRunning(name), interval_min: intervals[name], next_due, last_run: r || null }
  })
}

app.get('/api/state', (req, res) => ok(res, () => {
  const d = load()
  return {
    jobs: d.jobs,
    discovered: d.discovered.filter(x => x.status !== 'expired' || (Date.now() - new Date(x.last_seen)) < 30 * 86400000).map(x => ({ ...x, description_excerpt: (x.description_excerpt || '').slice(0, 1500) })),
    journal: d.journal.slice(-800).reverse(),
    runs: d.runs.slice(-60).reverse(),
    email_signals: d.email_signals.slice(-300).reverse(),
    outbox: d.outbox.slice(-100).reverse(),
    improvements: d.improvements,
    config: d.config,
    agents: agentStatus(d),
    email_configured: emailConfigured(),
    scheduler: SCHEDULER,
    meta: d.meta,
  }
}))

// ── Jobs (original API, now journaling status changes) ──────────────────────
function journalJobDiff(data, before, after, source = 'user') {
  if (!before) { addJournal(data, { type: 'note', title: `Added ${after.company} — ${after.role_title}`, body: after.status ? `Status: ${after.status}` : '', job_id: after.id, company: after.company, source }); return }
  if (before.status !== after.status) addJournal(data, { type: 'status_change', title: `${after.company}: ${before.status || '—'} → ${after.status}`, body: after.role_title, job_id: after.id, company: after.company, source })
  if (!before.applied_date && after.applied_date) addJournal(data, { type: 'note', title: `Applied to ${after.company}`, body: after.role_title, job_id: after.id, company: after.company, source })
  if (before.resume_version !== after.resume_version && after.resume_version) addJournal(data, { type: 'note', title: `${after.company}: resume → ${after.resume_version}`, body: '', job_id: after.id, company: after.company, source })
}

app.get('/api/jobs', (req, res) => ok(res, () => load().jobs))
app.put('/api/jobs', (req, res) => ok(res, () => mutate(d => {
  const next = Array.isArray(req.body) ? req.body : []
  const prevById = Object.fromEntries(d.jobs.map(j => [j.id, j]))
  for (const j of next) journalJobDiff(d, prevById[j.id], j)
  for (const j of d.jobs) if (!next.some(n => n.id === j.id)) addJournal(d, { type: 'note', title: `Removed ${j.company} — ${j.role_title}`, job_id: j.id, company: j.company })
  d.jobs = next
  return { success: true, count: next.length }
})))
app.post('/api/jobs', (req, res) => ok(res, () => mutate(d => {
  const job = { ...req.body, id: req.body.id || Date.now().toString() }
  d.jobs.push(job); journalJobDiff(d, null, job, req.body._source || 'user'); return job
})))
app.patch('/api/jobs/:id', (req, res) => ok(res, () => mutate(d => {
  const idx = d.jobs.findIndex(j => j.id === req.params.id)
  if (idx === -1) throw Object.assign(new Error('Not found'), { status: 404 })
  const { _source, ...changes } = req.body
  const before = d.jobs[idx]
  d.jobs[idx] = { ...before, ...changes }
  journalJobDiff(d, before, d.jobs[idx], _source || 'api')
  return d.jobs[idx]
})))
app.delete('/api/jobs/:id', (req, res) => ok(res, () => mutate(d => {
  const j = d.jobs.find(x => x.id === req.params.id)
  d.jobs = d.jobs.filter(x => x.id !== req.params.id)
  if (j) addJournal(d, { type: 'note', title: `Removed ${j.company} — ${j.role_title}`, job_id: j.id, company: j.company })
  return { success: true }
})))

// ── Config ───────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => ok(res, () => load().config))
app.put('/api/config', (req, res) => ok(res, () => mutate(d => { d.config = { ...d.config, ...req.body }; rescore(d); hygiene(d); return d.config })))
app.post('/api/discovered/rescore', (req, res) => ok(res, () => mutate(d => { const n = rescore(d); const h = hygiene(d); return { rescored: n, merged: h.merged } })))

// ── Discovered feed ──────────────────────────────────────────────────────────
app.get('/api/discovered', (req, res) => ok(res, () => load().discovered))
app.patch('/api/discovered/:id', (req, res) => ok(res, () => mutate(d => {
  const x = d.discovered.find(i => i.id === req.params.id)
  if (!x) throw Object.assign(new Error('Not found'), { status: 404 })
  Object.assign(x, req.body)
  if (req.body.status === 'dismissed') addJournal(d, { type: 'discovered', title: `Dismissed ${x.company} — ${x.role_title}`, body: req.body.reason || '', company: x.company, source: 'user' })
  return x
})))
app.post('/api/discovered/:id/track', (req, res) => ok(res, () => mutate(d => {
  const x = d.discovered.find(i => i.id === req.params.id)
  if (!x) throw Object.assign(new Error('Not found'), { status: 404 })
  const job = {
    id: Date.now().toString(), company: x.company, role_title: x.role_title, level: x.level || '', location: x.location, remote: !!x.remote,
    salary_min: x.salary_min ?? null, salary_max: x.salary_max ?? null, equity_notes: '', parental_leave_weeks: null, parental_leave_notes: '',
    status: req.body?.status || 'Researching', applied_date: req.body?.status === 'Applied' ? today() : '', next_action_date: (() => { const t = new Date(); t.setDate(t.getDate() + 2); return t.toISOString().slice(0, 10) })(),
    deadline: '', resume_version: null, job_url: x.url, notes: `[feed ${today()}] ${x.grade}${x.score} · ${x.score_reasons.join('; ')}\nMissing: ${(x.keywords_missing || []).join(', ')}`,
    retirement_match: (x.perks || []).includes('401k match') ? '401k match (per posting)' : (x.perks || []).includes('401k') ? '401k mentioned' : '',
    growth_notes: (x.growth || []).join('; '),
    perks: x.perks || [],
    priority: x.grade === 'A' ? 5 : x.grade === 'B' ? 4 : 3, contacts: [], ats_score: null, keyword_gaps: x.keywords_missing || [], interview_prep_done: false, prep_questions_count: 0, fit_score: Math.round(x.score / 10),
    source: x.source, discovered_id: x.id,
  }
  d.jobs.push(job)
  x.status = 'tracked'; x.job_id = job.id
  addJournal(d, { type: 'discovered', title: `Tracking ${job.company} — ${job.role_title}`, body: `From feed (${x.grade}${x.score}) · ${x.location_policy}`, job_id: job.id, company: job.company, source: 'user' })
  return job
})))
// bulk ingest of externally-discovered roles (JobSpy output, Claude web research)
app.post('/api/discovered/bulk', (req, res) => ok(res, () => mutate(d => ingestDiscovered(d, Array.isArray(req.body) ? req.body : (req.body.items || [req.body]), { source: req.body?.source || req.query.source || 'agent:external' }))))

// ── Journal ──────────────────────────────────────────────────────────────────
app.get('/api/journal', (req, res) => ok(res, () => load().journal.slice().reverse()))
app.post('/api/journal', (req, res) => ok(res, () => mutate(d => addJournal(d, req.body))))
app.delete('/api/journal/:id', (req, res) => ok(res, () => mutate(d => { d.journal = d.journal.filter(e => e.id !== req.params.id); return { success: true } })))

// ── Runs / improvements ──────────────────────────────────────────────────────
app.get('/api/runs', (req, res) => ok(res, () => load().runs.slice().reverse()))
app.get('/api/improvements', (req, res) => ok(res, () => load().improvements))
app.post('/api/improvements/:key/dismiss', (req, res) => ok(res, () => mutate(d => { d.improvements = d.improvements.filter(i => i.key !== req.params.key); d.config.dismissed_improvements = [...(d.config.dismissed_improvements || []), req.params.key].slice(-200); return { success: true } })))

// ── Email signals ────────────────────────────────────────────────────────────
app.get('/api/emails', (req, res) => ok(res, () => load().email_signals.slice().reverse()))
app.post('/api/emails/ingest', (req, res) => ok(res, () => mutate(d => {
  const items = Array.isArray(req.body) ? req.body : [req.body]
  const out = []
  for (const raw of items) { const s = ingestSignal(d, raw); if (s) out.push(s) }
  return { ingested: out.length, signals: out }
})))
app.post('/api/emails/classify', (req, res) => ok(res, () => { const d = load(); const cls = classifySignal(req.body); const job = matchJob(req.body, d.jobs); return { classification: cls, job_id: job?.id ?? null, company: job?.company ?? null } }))
app.post('/api/emails/:id/apply', (req, res) => ok(res, () => mutate(d => applySignal(d, req.params.id, req.body || {}))))
app.patch('/api/emails/:id', (req, res) => ok(res, () => mutate(d => {
  const s = d.email_signals.find(x => x.id === req.params.id)
  if (!s) throw Object.assign(new Error('Not found'), { status: 404 })
  Object.assign(s, req.body)
  if (req.body.job_id) s.company = d.jobs.find(j => j.id === req.body.job_id)?.company ?? s.company
  return s
})))

// ── Outbox (compose / send) ──────────────────────────────────────────────────
app.get('/api/outbox', (req, res) => ok(res, () => load().outbox.slice().reverse()))
app.get('/api/outbox/templates/:jobId', (req, res) => ok(res, () => { const d = load(); const job = d.jobs.find(j => j.id === req.params.jobId) || null; return emailTemplates(job, d.config) }))
app.post('/api/outbox', (req, res) => ok(res, () => mutate(d => {
  const item = { id: uid('o_'), ts: nowIso(), to: req.body.to || '', cc: req.body.cc || '', subject: req.body.subject || '', body: req.body.body || '', format: req.body.format || 'text', job_id: req.body.job_id || null, kind: req.body.kind || 'followup', status: 'draft', sent_at: null, error: null }
  d.outbox.push(item)
  return item
})))
app.patch('/api/outbox/:id', (req, res) => ok(res, () => mutate(d => { const o = d.outbox.find(x => x.id === req.params.id); if (!o) throw Object.assign(new Error('Not found'), { status: 404 }); Object.assign(o, req.body); return o })))
app.delete('/api/outbox/:id', (req, res) => ok(res, () => mutate(d => { d.outbox = d.outbox.filter(x => x.id !== req.params.id); return { success: true } })))
app.post('/api/outbox/:id/send', (req, res) => okAsync(res, async () => {
  const d = load()
  const o = d.outbox.find(x => x.id === req.params.id)
  if (!o) throw Object.assign(new Error('Not found'), { status: 404 })
  if (!o.to) throw new Error('recipient required')
  const html = o.format === 'markdown'
  const result = await sendMail({ to: o.to, cc: o.cc || undefined, subject: o.subject, body: html ? mdToHtml(o.body) : o.body, html, replyTo: d.config.email?.reply_to })
  return mutate(fresh => {
    const f = fresh.outbox.find(x => x.id === o.id)
    if (f) { f.status = 'sent'; f.sent_at = nowIso(); f.message_id = result.messageId }
    const job = o.job_id ? fresh.jobs.find(j => j.id === o.job_id) : null
    addJournal(fresh, { type: 'outbox', title: `Sent: ${o.subject}`, body: `To ${o.to}`, job_id: job?.id ?? null, company: job?.company ?? null, source: 'user', meta: { outbox_id: o.id, kind: o.kind } })
    if (job && o.kind === 'followup') { const t = new Date(); t.setDate(t.getDate() + 5); job.next_action_date = t.toISOString().slice(0, 10) }
    return f
  })
}))
// direct send (used by Claude tasks)
app.post('/api/email/send', (req, res) => okAsync(res, async () => {
  const { to, subject, body, html = false, job_id = null } = req.body
  const r = await sendMail({ to, subject, body: html ? mdToHtml(body) : body, html, replyTo: load().config.email?.reply_to })
  mutate(d => { d.outbox.push({ id: uid('o_'), ts: nowIso(), to, subject, body, format: html ? 'markdown' : 'text', job_id, kind: 'direct', status: 'sent', sent_at: nowIso(), message_id: r.messageId }); addJournal(d, { type: 'outbox', title: `Sent: ${subject}`, body: `To ${to}`, job_id, source: 'agent' }) })
  return r
}))

// ── Browser apply (human-in-the-loop) ───────────────────────────────────────
app.get('/api/apply/queue', (req, res) => ok(res, () => load().jobs.filter(j => j.apply_status && !['cancelled'].includes(j.apply_status)).map(j => ({ id: j.id, company: j.company, role_title: j.role_title, job_url: j.job_url, status: j.status, apply_status: j.apply_status, apply_queued_at: j.apply_queued_at, apply_updated_at: j.apply_updated_at, apply_notes: j.apply_notes }))))
app.post('/api/apply/queue', (req, res) => ok(res, () => mutate(d => queueApply(d, req.body || {}))))
app.get('/api/apply/defaults', (req, res) => res.json({ application_profile: DEFAULT_APPLICATION_PROFILE, screening_answers: DEFAULT_SCREENING_ANSWERS }))
app.get('/api/apply/:jobId/packet', (req, res) => ok(res, () => buildPacket(load(), req.params.jobId)))
app.post('/api/apply/:jobId/result', (req, res) => ok(res, () => mutate(d => recordApplyResult(d, req.params.jobId, req.body || {}))))
app.delete('/api/apply/:jobId', (req, res) => ok(res, () => mutate(d => { const j = d.jobs.find(x => x.id === req.params.jobId); if (!j) throw Object.assign(new Error('Not found'), { status: 404 }); j.apply_status = 'cancelled'; return { success: true } })))

// ── Agents ───────────────────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => ok(res, () => agentStatus(load())))
app.post('/api/agents/:name/run', (req, res) => okAsync(res, async () => {
  const name = req.params.name
  if (![...AGENTS, 'all'].includes(name)) throw Object.assign(new Error('unknown agent'), { status: 404 })
  if (name === 'email-sync') return { queued: false, note: 'email-sync runs via the Claude scheduled task job-hunt-agent (needs the Gmail connector). Ingest signals via POST /api/emails/ingest.' }
  if (req.query.wait === '1') return runAgent(name, { trigger: 'api', send: req.body?.send ?? null, log: m => console.log(`[${name}] ${m}`) })
  runAgent(name, { trigger: 'api', send: req.body?.send ?? null, log: m => console.log(`[${name}] ${m}`) }).catch(e => console.error(`[${name}] failed:`, e.message))
  return { started: true, agent: name }
}))

// ── In-process scheduler ─────────────────────────────────────────────────────
function due(data, name, minutes) {
  if (!minutes) return false
  const r = lastRun(data, name)
  if (!r) return true
  return Date.now() - new Date(r.started_at).getTime() >= minutes * 60000
}
async function tick() {
  try {
    const d = load()
    if (due(d, 'fetch', d.config.fetch_interval_min) && !isRunning('fetch')) {
      console.log('[scheduler] fetch due'); await runAgent('fetch', { trigger: 'scheduler', log: m => console.log(`[fetch] ${m}`) })
      await runAgent('scan', { trigger: 'scheduler' })
    } else if (due(d, 'scan', d.config.scan_interval_min) && !isRunning('scan')) {
      console.log('[scheduler] scan due'); await runAgent('scan', { trigger: 'scheduler' })
    }
  } catch (e) { console.error('[scheduler]', e.message) }
}

app.listen(PORT, () => {
  console.log(`Job tracker API running at http://localhost:${PORT}`)
  console.log(`Data file: ${DATA_FILE}`)
  console.log(`Email send: ${emailConfigured() ? 'configured (Gmail SMTP)' : 'NOT configured'}`)
  if (SCHEDULER) {
    console.log('Agent scheduler: on (fetch/scan intervals from config)')
    setTimeout(tick, 8000)
    setInterval(tick, 60000)
  }
})
