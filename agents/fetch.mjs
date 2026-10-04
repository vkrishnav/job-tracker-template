// Fetch agent: poll public job boards on the watchlist, filter to target titles and
// the Dallas-or-remote location policy, score against the resume, dedupe, and
// upsert into data.discovered. Pure Node, no API keys.
import { fetchBoard, fetchGreenhouseContent } from './lib/boards.mjs'
import { scoreJob, locationAllowed } from './lib/scoring.mjs'
import { addJournal, startRun, finishRun, uid, nowIso, daysBetween, excerpt } from './lib/store.mjs'
import { hygiene } from './lib/ingest.mjs'

function titleOk(title, config) {
  const t = (title || '').toLowerCase()
  if ((config.title_exclude || []).some(x => t.includes(x))) return false
  return (config.title_include || []).some(x => t.includes(x))
}

function normUrl(u = '') { return u.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase() }

export async function runFetch(data, { trigger = 'manual', log = () => {}, boards = null } = {}) {
  const config = data.config
  const run = startRun(data, 'fetch', trigger)
  const stats = { boards: 0, boards_failed: 0, listed: 0, title_match: 0, location_ok: 0, fresh: 0, new: 0, updated: 0, errors: [] }
  const seenUrls = new Set([
    ...data.discovered.map(d => normUrl(d.url)),
  ])
  const trackedUrls = new Set(data.jobs.map(j => normUrl(j.job_url)).filter(Boolean))
  const newOnes = []
  const runTs = nowIso()
  const watch = boards || config.watchlist || []

  for (const entry of watch) {
    if (entry.enabled === false) continue
    stats.boards++
    let listings
    try {
      listings = await fetchBoard(entry)
    } catch (e) {
      stats.boards_failed++
      stats.errors.push(`${entry.company}: ${e.message}`)
      log(`✗ ${entry.company}: ${e.message}`)
      continue
    }
    stats.listed += listings.length
    let matched = listings.filter(j => titleOk(j.role_title, config))
    stats.title_match += matched.length
    matched = matched.filter(j => !config.exclude_non_matching_location || locationAllowed(j, config).ok)
    stats.location_ok += matched.length
    matched = matched.filter(j => {
      const age = daysBetween(j.posted_at)
      return age == null || age <= (config.max_age_days || 14) * 3 // keep a wider window; scoring penalizes age
    })
    stats.fresh += matched.length

    for (let j of matched) {
      const key = normUrl(j.url)
      const existing = data.discovered.find(d => normUrl(d.url) === key)
      if (existing) {
        existing.last_seen = runTs
        if (existing.status === 'expired') existing.status = 'new'
        stats.updated++
        continue
      }
      if (j._needs_content) j = await fetchGreenhouseContent(j)
      const sc = scoreJob(j, config)
      const rec = {
        id: uid('d_'),
        source: j.source,
        external_id: j.external_id,
        company: j.company,
        role_title: j.role_title,
        level: sc.level,
        location: j.location,
        remote: !!j.remote || locationAllowed(j, config).why === 'remote',
        location_policy: locationAllowed(j, config).why,
        url: j.url,
        posted_at: j.posted_at,
        salary_min: sc.salary_min ?? j.salary_min ?? null,
        salary_max: sc.salary_max ?? j.salary_max ?? null,
        score: sc.score,
        grade: sc.grade,
        score_reasons: sc.reasons,
        keywords_matched: sc.matched,
        keywords_missing: sc.missing, perks: sc.perks, growth: sc.growth,
        description_excerpt: excerpt(j.description || ''),
        salary_penalized: sc.reasons.some(r => r.startsWith('-20 comp')),
        status: trackedUrls.has(key) ? 'tracked' : 'new',
        first_seen: runTs,
        last_seen: runTs,
        job_id: trackedUrls.has(key) ? data.jobs.find(x => normUrl(x.job_url) === key)?.id ?? null : null,
      }
      data.discovered.push(rec)
      seenUrls.add(key)
      if (rec.status === 'new') newOnes.push(rec)
      stats.new++
    }
    log(`✓ ${entry.company}: ${listings.length} listed → ${matched.length} match`)
  }

  const h = hygiene(data)
  stats.merged = h.merged; stats.policy_dismissed = h.policy
  const kept = new Set(data.discovered.map(d => d.id))
  const visible = newOnes.filter(d => kept.has(d.id) && d.status === 'new')
  newOnes.length = 0; newOnes.push(...visible)
  stats.new = visible.length
  newOnes.sort((a, b) => b.score - a.score)
  const top = newOnes.slice(0, 5).map(d => `${d.company} — ${d.role_title} (${d.grade}${d.score})`).join('; ')
  const summary = `${stats.new} new roles from ${stats.boards - stats.boards_failed}/${stats.boards} boards` + (top ? `. Top: ${top}` : '')
  finishRun(data, run.id, { status: stats.boards_failed === stats.boards && stats.boards > 0 ? 'error' : 'ok', summary, stats })
  if (stats.new > 0 || stats.errors.length) {
    addJournal(data, {
      type: 'agent',
      title: `Fetch: ${stats.new} new roles`,
      body: summary + (stats.errors.length ? `\nErrors: ${stats.errors.join('; ')}` : ''),
      source: 'agent:fetch',
      meta: { run_id: run.id, new_ids: newOnes.slice(0, 20).map(d => d.id) },
    })
  }
  return { run, stats, newOnes }
}
