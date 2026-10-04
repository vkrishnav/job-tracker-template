// Bulk ingest of externally discovered roles (JobSpy output, Claude web research, manual pastes).
import { scoreJob, locationAllowed } from './scoring.mjs'
import { addJournal, uid, nowIso, excerpt } from './store.mjs'

const norm = u => (u || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
const roleKey = d => `${(d.company || '').toLowerCase().trim()}|${(d.role_title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`

/** Rescore every unreviewed feed record from its stored excerpt (used after config/resume changes). */
export function rescore(data) {
  let n = 0
  for (const d of data.discovered) {
    if (d.status !== 'new') continue
    const sc = scoreJob({ company: d.company, role_title: d.role_title, location: d.location, remote: d.remote, description: d.description_excerpt || '', posted_at: d.posted_at, salary_min: d.salary_min, salary_max: d.salary_max }, data.config)
    Object.assign(d, { score: sc.score, grade: sc.grade, score_reasons: sc.reasons, keywords_matched: sc.matched, keywords_missing: sc.missing, perks: sc.perks, growth: sc.growth, level: sc.level || d.level, salary_penalized: sc.reasons.some(r => r.startsWith('-20 comp')) })
    n++
  }
  return n
}

/**
 * Feed hygiene, run after every fetch/ingest and on scan:
 *  - collapse duplicate postings of the same company+title into one record (alt_urls / alt_locations)
 *  - re-apply the location policy to 'new' records (config may have changed)
 */
export function hygiene(data) {
  const cfg = data.config
  const keep = new Map()
  const out = []
  let merged = 0, policy = 0
  // Primary record preference: direct ATS source over aggregators (jobspy:*), then newest
  const isAgg = d => String(d.source || '').startsWith('jobspy')
  const sorted = [...data.discovered].sort((a, b) => (isAgg(a) - isAgg(b)) || (b.first_seen || '').localeCompare(a.first_seen || ''))
  const grade = sc => sc >= 80 ? 'A' : sc >= 65 ? 'B' : sc >= 50 ? 'C' : sc >= 35 ? 'D' : 'F'
  for (const d of sorted) {
    if (d.status !== 'new') { out.push(d); continue }
    const la = locationAllowed({ role_title: d.role_title, location: d.location, remote: d.remote }, cfg)
    if (cfg.exclude_non_matching_location && !la.ok) { d.status = 'dismissed'; d.dismiss_reason = la.why; policy++; out.push(d); continue }
    // Comp below the floor is a real dealbreaker: apply a one-time penalty to stored records
    if (!d.salary_penalized && d.salary_max && cfg.min_salary && d.salary_max < cfg.min_salary * 0.9) {
      d.score = Math.max(0, d.score - 20); d.grade = grade(d.score); d.salary_penalized = true
      d.score_reasons = [...(d.score_reasons || []), `-20 comp max $${Math.round(d.salary_max / 1000)}k below $${Math.round(cfg.min_salary / 1000)}k floor`]
    }
    const k = roleKey(d)
    const primary = keep.get(k)
    if (primary) {
      primary.alt_urls = [...new Set([...(primary.alt_urls || []), d.url, ...(d.alt_urls || [])])].filter(u => u !== primary.url)
      primary.alt_locations = [...new Set([...(primary.alt_locations || []), d.location, ...(d.alt_locations || [])])].filter(l => l && l !== primary.location)
      if (d.score > primary.score) { primary.score = d.score; primary.grade = d.grade; primary.score_reasons = d.score_reasons }
      if ((d.salary_max || 0) > (primary.salary_max || 0)) { primary.salary_min = d.salary_min; primary.salary_max = d.salary_max }
      if (d.last_seen > primary.last_seen) primary.last_seen = d.last_seen
      d.status = 'merged'; d.merged_into = primary.id; merged++
      continue // drop merged record entirely
    }
    keep.set(k, d); out.push(d)
  }
  data.discovered = out.sort((a, b) => (a.first_seen || '').localeCompare(b.first_seen || ''))
  return { merged, policy }
}

export function ingestDiscovered(data, items, { source = 'agent:external' } = {}) {
  const seen = new Set(data.discovered.map(x => norm(x.url)))
  const tracked = new Set(data.jobs.map(j => norm(j.job_url)))
  let added = 0, skipped = 0, policy = 0
  const ts = nowIso()
  const cfg = data.config
  const titleOk = t => { const x = (t || '').toLowerCase(); return !(cfg.title_exclude || []).some(e => x.includes(e)) && (cfg.title_include || []).some(e => x.includes(e)) }
  for (const j of items) {
    if (!j?.url || !j?.role_title) { skipped++; continue }
    if (seen.has(norm(j.url))) { skipped++; continue }
    if (!j.force && !titleOk(j.role_title)) { skipped++; continue }
    const la = locationAllowed(j, cfg)
    if (cfg.exclude_non_matching_location && !la.ok && !j.force) { policy++; continue }
    const sc = scoreJob(j, cfg)
    data.discovered.push({ id: uid('d_'), source: j.source || 'manual', external_id: j.external_id || null, company: j.company || '?', role_title: j.role_title, level: sc.level, location: j.location || '', remote: !!j.remote || la.why === 'remote', location_policy: la.why, url: j.url, posted_at: j.posted_at || null, salary_min: sc.salary_min ?? j.salary_min ?? null, salary_max: sc.salary_max ?? j.salary_max ?? null, score: sc.score, grade: sc.grade, score_reasons: sc.reasons, keywords_matched: sc.matched, keywords_missing: sc.missing, perks: sc.perks, growth: sc.growth, description_excerpt: excerpt(j.description || ''), salary_penalized: sc.reasons.some(r => r.startsWith('-20 comp')), status: tracked.has(norm(j.url)) ? 'tracked' : 'new', first_seen: ts, last_seen: ts, job_id: null })
    seen.add(norm(j.url)); added++
  }
  const h = hygiene(data)
  if (added) addJournal(data, { type: 'agent', title: `Ingest: ${added} roles from ${source.replace('agent:', '')}`, body: `${skipped} skipped (dup/title), ${policy} outside Dallas-or-remote policy, ${h.merged} merged`, source })
  return { added, skipped, policy, merged: h.merged }
}
