// Improvement-scanning agent: looks across jobs, discovered feed, signals, and
// journal to produce a ranked list of concrete next actions. Replaces
// data.improvements each run; journals only NEW findings so the log stays quiet.
import { addJournal, startRun, finishRun, daysBetween, today } from './lib/store.mjs'
import { hygiene } from './lib/ingest.mjs'

const ACTIVE = ['Applied', 'Phone Screen', 'Technical Screen', 'Onsite', 'Offer']
const CLOSED = ['Rejected', 'Closed', 'Withdrawn', 'Accepted']

function lastActivity(data, jobId) {
  let ts = null
  for (const e of data.journal) if (e.job_id === jobId && (!ts || e.ts > ts)) ts = e.ts
  return ts
}

export function runScan(data, { trigger = 'manual' } = {}) {
  const config = data.config
  const run = startRun(data, 'scan', trigger)
  const prevKeys = new Set(data.improvements.map(i => i.key))
  const out = []
  const push = (i) => out.push({ created: today(), ...i })
  const t = today()

  // 1. Follow-ups due: Applied N+ days ago with no followup/email activity since
  for (const j of data.jobs) {
    if (j.status !== 'Applied' || !j.applied_date) continue
    const age = daysBetween(j.applied_date)
    if (age == null || age < (config.followup_after_days || 7)) continue
    const followed = data.journal.some(e => j.id === e.job_id && ['followup', 'outbox', 'email'].includes(e.type) && e.ts.slice(0, 10) >= j.applied_date)
    if (followed) continue
    push({ key: `followup:${j.id}`, type: 'followup', severity: age >= 14 ? 'high' : 'medium', job_id: j.id, company: j.company,
      title: `Follow up with ${j.company}`, body: `${j.role_title} — applied ${age} days ago with no reply or follow-up logged. Send a status inquiry.`, action: 'compose:inquiry' })
  }

  // 2. Overdue next actions
  for (const j of data.jobs) {
    if (!j.next_action_date || CLOSED.includes(j.status)) continue
    if (j.next_action_date < t) {
      const late = daysBetween(j.next_action_date)
      push({ key: `overdue:${j.id}`, type: 'overdue', severity: late > 7 ? 'high' : 'medium', job_id: j.id, company: j.company,
        title: `Overdue action: ${j.company}`, body: `${j.role_title} — next action was due ${j.next_action_date} (${late}d ago). Do it or reschedule.`, action: 'edit' })
    }
  }

  // 3. Stale active applications
  for (const j of data.jobs) {
    if (!ACTIVE.includes(j.status)) continue
    const last = lastActivity(data, j.id) || j.applied_date
    const age = daysBetween(last)
    if (age != null && age >= (config.stale_after_days || 14) * 2) {
      push({ key: `stale:${j.id}`, type: 'stale', severity: 'low', job_id: j.id, company: j.company,
        title: `Stale: ${j.company}`, body: `${j.role_title} has been "${j.status}" with no activity for ${age} days. Consider marking Closed or sending a final inquiry.`, action: 'edit' })
    }
  }

  // 4. Missing resume intelligence on active apps
  const missingAts = data.jobs.filter(j => ACTIVE.includes(j.status) && j.ats_score == null)
  if (missingAts.length) {
    push({ key: `ats-missing`, type: 'resume', severity: 'medium', title: `${missingAts.length} active applications have no ATS score`,
      body: `Run the ATS Diagnoser skill against: ${missingAts.slice(0, 6).map(j => j.company + ' ' + j.role_title).join('; ')}${missingAts.length > 6 ? '…' : ''}`, action: 'skill:ats' })
  }
  const noPrep = data.jobs.filter(j => ['Phone Screen', 'Technical Screen', 'Onsite'].includes(j.status) && !j.interview_prep_done)
  for (const j of noPrep) {
    push({ key: `prep:${j.id}`, type: 'interview', severity: 'high', job_id: j.id, company: j.company,
      title: `Interview prep not done: ${j.company}`, body: `${j.role_title} is at "${j.status}" but interview_prep_done is false. Run the Interview Simulator.`, action: 'skill:interview' })
  }

  // 5. Aggregate keyword gaps → learning suggestions
  const gapCount = {}
  for (const j of data.jobs) for (const k of (j.keyword_gaps || [])) gapCount[k] = (gapCount[k] || 0) + 1
  for (const d of data.discovered) if (['new'].includes(d.status) && d.grade <= 'B') for (const k of (d.keywords_missing || []).slice(0, 5)) gapCount[k] = (gapCount[k] || 0) + 0.5
  const topGaps = Object.entries(gapCount).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (topGaps.length) {
    push({ key: `gaps:${topGaps.map(g => g[0]).join(',')}`, type: 'learning', severity: 'low', title: 'Top recurring keyword gaps',
      body: topGaps.map(([k, n]) => `${k} (${Math.round(n)})`).join(', ') + '. Add the top ones to the Learning tab or the resume skills section.', action: 'learning', meta: { gaps: topGaps } })
  }

  // 6. Discovered feed hygiene: merge dupes, re-apply policy, expire, surface unreviewed A/B roles
  const hyg = hygiene(data)
  let expired = 0
  for (const d of data.discovered) {
    if (d.status === 'new' && daysBetween(d.last_seen) > (config.discovered_expire_days || 10)) { d.status = 'expired'; expired++ }
  }
  const hot = data.discovered.filter(d => d.status === 'new' && ['A', 'B'].includes(d.grade)).sort((a, b) => b.score - a.score)
  if (hot.length) {
    push({ key: 'review:feed', type: 'discovered', severity: hot.some(d => d.grade === 'A') ? 'high' : 'medium',
      title: `${hot.length} unreviewed A/B roles in the feed`, body: hot.slice(0, 5).map(d => `${d.company} — ${d.role_title} (${d.grade}${d.score}, ${d.location_policy})`).join('; '), action: 'feed' })
  }

  // 7. Unapplied email signals
  const pending = data.email_signals.filter(s => !s.applied && !s.dismissed && ['rejection', 'interview', 'assessment', 'offer'].includes(s.classification))
  for (const s of pending) {
    push({ key: `signal:${s.id}`, type: 'email', severity: s.classification === 'offer' || s.classification === 'interview' ? 'high' : 'medium', job_id: s.job_id, company: s.company,
      title: `${s.classification} email${s.company ? ' from ' + s.company : ''} not applied`, body: s.subject, action: 'signals' })
  }

  // 8. Pipeline health stats
  const applied = data.jobs.filter(j => j.applied_date)
  const responded = data.jobs.filter(j => ['Phone Screen', 'Technical Screen', 'Onsite', 'Offer', 'Accepted', 'Rejected'].includes(j.status))
  const perCompany = {}
  for (const j of applied) perCompany[j.company] = (perCompany[j.company] || 0) + 1
  const concentrated = Object.entries(perCompany).filter(([, n]) => n >= 5)
  if (concentrated.length && applied.length && concentrated.reduce((s, [, n]) => s + n, 0) / applied.length > 0.6) {
    push({ key: `concentration`, type: 'strategy', severity: 'medium', title: 'Pipeline concentrated in few companies',
      body: `${concentrated.map(([c, n]) => `${c}: ${n}`).join(', ')} of ${applied.length} applications. Diversify: the fetch agent watches ${config.watchlist.length} boards — review the feed.`, action: 'feed' })
  }
  const stats = {
    jobs: data.jobs.length, active: data.jobs.filter(j => ACTIVE.includes(j.status)).length, applied: applied.length,
    response_rate: applied.length ? Math.round(100 * responded.length / applied.length) : 0,
    discovered_new: data.discovered.filter(d => d.status === 'new').length, expired, merged: hyg.merged, policy_dismissed: hyg.policy, improvements: 0, by_severity: {},
  }

  // Collapse per-company noise: >3 followup/stale findings for one company become a single finding
  for (const type of ['followup', 'stale', 'overdue']) {
    const byCo = {}
    for (const i of out) if (i.type === type && i.company) (byCo[i.company] ||= []).push(i)
    for (const [co, items] of Object.entries(byCo)) {
      if (items.length <= 3) continue
      for (const i of items) out.splice(out.indexOf(i), 1)
      const sev = items.some(i => i.severity === 'high') ? 'high' : items[0].severity
      const roles = items.map(i => data.jobs.find(j => j.id === i.job_id)?.role_title).filter(Boolean)
      push({ key: `${type}-group:${co}`, type, severity: sev, company: co, job_id: null, action: type === 'followup' ? 'compose:inquiry' : 'edit',
        title: `${type === 'followup' ? 'Follow up with' : type === 'stale' ? 'Stale applications at' : 'Overdue actions at'} ${co} (${items.length})`,
        body: `${items.length} ${type === 'followup' ? 'applications with no reply or follow-up logged' : type === 'stale' ? 'active applications with no activity' : 'overdue next actions'}: ${roles.slice(0, 6).join('; ')}${roles.length > 6 ? ` … +${roles.length - 6}` : ''}. One recruiter-level status inquiry covering all of them is appropriate.` })
    }
  }

  // Respect findings the user dismissed in the UI
  const dismissed = new Set(config.dismissed_improvements || [])
  for (let i = out.length - 1; i >= 0; i--) if (dismissed.has(out[i].key)) out.splice(i, 1)
  stats.improvements = out.length
  stats.by_severity = { high: out.filter(i => i.severity === 'high').length, medium: out.filter(i => i.severity === 'medium').length, low: out.filter(i => i.severity === 'low').length }
  const order = { high: 0, medium: 1, low: 2 }
  out.sort((a, b) => order[a.severity] - order[b.severity])
  // keep created date for findings that persist across scans
  const prevByKey = Object.fromEntries(data.improvements.map(i => [i.key, i]))
  for (const i of out) if (prevByKey[i.key]) i.created = prevByKey[i.key].created
  data.improvements = out

  const fresh = out.filter(i => !prevKeys.has(i.key))
  for (const i of fresh.filter(i => i.severity !== 'low').slice(0, 10)) {
    addJournal(data, { type: 'improvement', title: i.title, body: i.body, job_id: i.job_id ?? null, company: i.company ?? null, source: 'agent:scan', meta: { key: i.key, severity: i.severity } })
  }
  const summary = `${out.length} findings (${stats.by_severity.high} high, ${stats.by_severity.medium} med), ${fresh.length} new; response rate ${stats.response_rate}%`
  finishRun(data, run.id, { status: 'ok', summary, stats })
  return { run, stats, improvements: out, fresh }
}
