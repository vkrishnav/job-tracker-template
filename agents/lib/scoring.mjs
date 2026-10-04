// Fit scoring for discovered roles. Deterministic, explainable, no API cost.
// Score 0-100 → grade A-F. Components:
//   level match   25   title contains a target level (staff/principal/…)
//   keywords      30   resume keyword coverage in title+description
//   location      15   remote anywhere, or Dallas-metro onsite
//   salary        10   parsed comp range vs min_salary (unknown = half credit; below floor = -20)
//   perks         10   401k match, equity/RSU, parental leave, PTO, learning budget (from posting text)
//   growth         7   high-growth tech company (config.growth_companies) + growth language in posting
//   recency        3   posted within 7 days

export function parseSalary(text = '') {
  // matches "$250,000 - $340,000", "$250K–$340K", "250,000 to 340,000 USD"
  const re = /\$?\s?(\d{2,3})(?:,(\d{3})|(k))?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3})(?:,(\d{3})|(k))?/i
  const m = text.match(re)
  if (!m) return { min: null, max: null }
  const toNum = (a, b, k) => {
    if (k) return Number(a) * 1000
    if (b) return Number(a + b)
    return Number(a) >= 100 ? Number(a) * 1000 : null
  }
  const min = toNum(m[1], m[2], m[3])
  const max = toNum(m[4], m[5], m[6])
  if (!min || !max || min < 50000 || max > 2000000 || max < min) return { min: null, max: null }
  return { min, max }
}

export function isRemote(job) {
  const loc = `${job.location || ''} ${job.workplace_type || ''}`.toLowerCase()
  return job.remote === true || /remote|anywhere|distributed/.test(loc)
}

export function isDallas(job, config) {
  const loc = (job.location || '').toLowerCase()
  return (config.onsite_locations_ok || []).some(l => loc.includes(l))
}

function regionBlocked(job, config) {
  const text = `${job.role_title || ''} | ${job.location || ''}`.toLowerCase()
  return (config.remote_exclude_regions || []).some(r => new RegExp(`(^|[^a-z])${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text))
}

/** Location policy check used by the fetch filter. Returns { ok, why }. */
export function locationAllowed(job, config) {
  if (isRemote(job)) {
    if (regionBlocked(job, config)) return { ok: false, why: 'remote but region-restricted' }
    return { ok: true, why: 'remote' }
  }
  if (isDallas(job, config)) return { ok: true, why: 'dallas-onsite' }
  if (config.location_mode !== 'dallas_or_remote') {
    const loc = (job.location || '').toLowerCase()
    if ((config.locations_ok || []).some(l => loc.includes(l))) return { ok: true, why: 'us' }
  }
  return { ok: false, why: 'not remote and not Dallas' }
}

export function titleLevel(title = '') {
  const t = title.toLowerCase()
  if (/distinguished|fellow/.test(t)) return 'Distinguished'
  if (/principal/.test(t)) return 'Principal'
  if (/senior staff|staff\+|staff/.test(t)) return 'Staff'
  if (/\blead\b/.test(t)) return 'Lead'
  if (/architect/.test(t)) return 'Lead'
  if (/senior|sr\.?\b/.test(t)) return 'Senior'
  return ''
}

const PERK_RULES = [
  ['401k match', /401\s?\(?k\)?[^.]{0,80}(match|contribut)|(match|contribut)[^.]{0,80}401\s?\(?k\)?/i, 5],
  ['401k', /401\s?\(?k\)?|retirement plan|pension/i, 2],
  ['equity', /\b(equity|rsu|rsus|stock options?|espp|ownership stake)\b/i, 2],
  ['parental leave', /parental leave|maternity|paternity|family leave/i, 1],
  ['flexible PTO', /unlimited (pto|vacation|time off)|flexible (pto|time off)|generous (pto|vacation)/i, 1],
  ['learning budget', /learning (budget|stipend)|education (budget|stipend|reimbursement)|tuition|conference budget|professional development/i, 1],
  ['health premium covered', /100% (of )?(medical|health)|fully (paid|covered) (medical|health)|premiums? (fully )?(paid|covered)/i, 1],
]

export function detectPerks(text = '') {
  const found = []
  let pts = 0
  const has401kMatch = PERK_RULES[0][1].test(text)
  for (const [name, re, w] of PERK_RULES) {
    if (name === '401k' && has401kMatch) continue // don't double count
    if (re.test(text)) { found.push(name); pts += w }
  }
  return { found, points: Math.min(10, pts) }
}

const GROWTH_RE = /fast[- ]growing|hyper[- ]?growth|high[- ]growth|series [a-f]\b|recently raised|unicorn|pre-?ipo|rapid(ly)? (growth|scaling|growing)|career growth|growth opportunit|path to (staff|principal|distinguished)|promotion|mentorship|learning budget|frontier|cutting[- ]edge|state[- ]of[- ]the[- ]art/i

export function detectGrowth(job, text = '', config) {
  const reasons = []
  let pts = 0
  const co = (job.company || '').toLowerCase()
  if ((config.growth_companies || []).some(c => co.includes(c.toLowerCase()))) { pts += 4; reasons.push('high-growth tech company') }
  const m = text.match(GROWTH_RE)
  if (m) { pts += 3; reasons.push(`growth language ("${m[0].toLowerCase()}")`) }
  return { points: Math.min(7, pts), reasons }
}

export function scoreJob(job, config) {
  const reasons = []
  const title = (job.role_title || '').toLowerCase()
  const desc = (job.description || '').toLowerCase()
  const text = title + ' ' + desc

  // level (30)
  let level = 0
  const lvl = titleLevel(title)
  if (['Staff', 'Principal', 'Distinguished'].includes(lvl)) { level = 25; reasons.push(`+25 ${lvl}-level title`) }
  else if (lvl === 'Lead') { level = 17; reasons.push('+17 lead/architect title') }
  else if (lvl === 'Senior') { level = 8; reasons.push('+8 senior title (below target)') }
  else reasons.push('+0 level not stated in title')

  // keywords (30)
  const kws = config.resume_keywords || []
  const matched = kws.filter(k => text.includes(k.toLowerCase()))
  const missing = kws.filter(k => !text.includes(k.toLowerCase()))
  const coverage = kws.length ? matched.length / kws.length : 0
  // saturate: 25% coverage of a ~90-term list already counts as excellent
  const kwScore = Math.round(Math.min(1, coverage / 0.25) * 30)
  reasons.push(`+${kwScore} keywords (${matched.length}/${kws.length})`)

  // location (15): remote anywhere, or onsite/hybrid in the Dallas metro
  let loc = 0
  const la = locationAllowed(job, config)
  if (la.why === 'remote') { loc = 15; reasons.push('+15 remote') }
  else if (la.why === 'dallas-onsite') { loc = 15; reasons.push('+15 Dallas onsite/hybrid') }
  else if (la.ok) { loc = 6; reasons.push('+6 US location (not remote)') }
  else reasons.push('+0 location outside policy (not remote, not Dallas)')

  // salary (10)
  let sal = 5
  let { salary_min, salary_max } = job
  if (salary_min == null && salary_max == null) {
    const p = parseSalary(job.description || '')
    salary_min = p.min; salary_max = p.max
  }
  if (salary_max != null) {
    if (salary_max >= (config.min_salary || 0)) { sal = 10; reasons.push(`+10 comp up to $${Math.round(salary_max / 1000)}k`) }
    else if (salary_max < (config.min_salary || 0) * 0.9) { sal = -20; reasons.push(`-20 comp max $${Math.round(salary_max / 1000)}k below $${Math.round((config.min_salary || 0) / 1000)}k floor`) }
    else { sal = 0; reasons.push(`+0 comp max $${Math.round(salary_max / 1000)}k just under floor`) }
  } else reasons.push('+5 comp not listed')

  // perks (10)
  const perks = detectPerks(job.description || '')
  if (perks.points) reasons.push(`+${perks.points} perks (${perks.found.join(', ')})`)
  else reasons.push('+0 no perks stated')

  // growth (7)
  const growth = detectGrowth(job, text, config)
  if (growth.points) reasons.push(`+${growth.points} growth (${growth.reasons.join('; ')})`)

  // recency (3)
  let rec = 0
  if (job.posted_at) {
    const age = (Date.now() - new Date(job.posted_at).getTime()) / 86400000
    if (age <= 7) { rec = 3; reasons.push('+3 posted this week') }
    else if (age <= 14) { rec = 1; reasons.push('+1 posted in last 2 weeks') }
  }

  const score = Math.max(0, Math.min(100, level + kwScore + loc + sal + perks.points + growth.points + rec))
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F'
  return { score, grade, reasons, matched, missing: missing.slice(0, 12), salary_min, salary_max, level: lvl, perks: perks.found, growth: growth.reasons }
}
