#!/usr/bin/env node
// CLI runner so the pipeline works without the Express server (cron, launchd, Claude scheduled tasks).
//   node agents/run.mjs fetch            poll boards → discovered feed
//   node agents/run.mjs scan             improvement scan → data.improvements
//   node agents/run.mjs digest [--send]  write digest md (+ email)
//   node agents/run.mjs ingest '<json>'  add an email signal {from,subject,snippet,date,thread_id}
//   node agents/run.mjs ingest-file f    add many signals from a JSON array file
//   node agents/run.mjs apply <signalId> apply an email signal's feedback to its job
//   node agents/run.mjs ingest-discovered f [--source=jobspy]  add roles from a JSON array file
//   node agents/run.mjs all [--send]     fetch → scan → digest
//   node agents/run.mjs status           print agent status JSON
//   node agents/run.mjs packet <jobId>  print the browser-apply packet (profile, answers, resume, rules)
//   node agents/run.mjs apply-queue <jobId|d_discoveredId>   queue a role for /apply
//   node agents/run.mjs apply-result <jobId> <in_progress|ready_to_submit|submitted|blocked|failed|cancelled> [notes]
//   node agents/run.mjs rescore          rescore unreviewed feed records with current config/resume keywords
//   node agents/run.mjs reset-feed       drop unreviewed feed entries (keeps tracked/dismissed) so the next fetch rescores
import fs from 'fs'
import { load, save, lastRun, DATA_FILE, AGENTS } from './lib/store.mjs'
import { runFetch } from './fetch.mjs'
import { runScan } from './scan.mjs'
import { runDigest } from './digest.mjs'
import { ingestSignal, applySignal } from './lib/email.mjs'
import { ingestDiscovered, rescore, hygiene } from './lib/ingest.mjs'
import { buildPacket, queueApply, recordApplyResult } from './lib/apply.mjs'

const [, , cmd, ...rest] = process.argv
const flags = new Set(rest.filter(a => a.startsWith('--')))
const args = rest.filter(a => !a.startsWith('--'))
const log = m => console.log(m)

export function agentStatus(data) {
  return AGENTS.map(name => {
    const r = lastRun(data, name)
    return { agent: name, last_run: r ? { status: r.status, started_at: r.started_at, finished_at: r.finished_at, summary: r.summary, stats: r.stats, error: r.error } : null }
  })
}

async function main() {
  const data = load()
  switch (cmd) {
    case 'fetch': { const r = await runFetch(data, { trigger: 'cli', log }); save(data); log(r.run.summary); break }
    case 'scan': { const r = runScan(data, { trigger: 'cli' }); save(data); log(r.run.summary); for (const i of r.improvements) log(`  [${i.severity}] ${i.title}`); break }
    case 'digest': { const r = await runDigest(data, { trigger: 'cli', send: flags.has('--send') ? true : null }); save(data); log(r.run.summary); break }
    case 'all': {
      const f = await runFetch(data, { trigger: 'cli', log }); log(f.run.summary)
      const s = runScan(data, { trigger: 'cli' }); log(s.run.summary)
      const d = await runDigest(data, { trigger: 'cli', send: flags.has('--send') ? true : null }); log(d.run.summary)
      save(data); break
    }
    case 'ingest': {
      const raw = JSON.parse(args[0] || '{}')
      const sig = ingestSignal(data, raw); save(data)
      log(sig ? JSON.stringify({ id: sig.id, classification: sig.classification, company: sig.company, job_id: sig.job_id }) : 'duplicate'); break
    }
    case 'ingest-file': {
      const arr = JSON.parse(fs.readFileSync(args[0], 'utf8'))
      let n = 0; const out = []
      for (const raw of arr) { const s = ingestSignal(data, raw); if (s) { n++; out.push({ id: s.id, classification: s.classification, company: s.company, job_id: s.job_id, subject: s.subject }) } }
      save(data); log(JSON.stringify({ ingested: n, signals: out }, null, 2)); break
    }
    case 'ingest-discovered': {
      const arr = JSON.parse(fs.readFileSync(args[0], 'utf8'))
      const src = [...flags].find(f => f.startsWith('--source='))?.split('=')[1] || 'external'
      const r = ingestDiscovered(data, Array.isArray(arr) ? arr : arr.items || [], { source: `agent:${src}` }); save(data); log(JSON.stringify(r)); break
    }
    case 'apply': { const r = applySignal(data, args[0]); save(data); log(`${r.job.company} → ${r.job.status}`); break }
    case 'packet': log(JSON.stringify(buildPacket(data, args[0]), null, 2)); break
    case 'apply-queue': { const j = queueApply(data, args[0]?.startsWith('d_') ? { discovered_id: args[0] } : { job_id: args[0] }); save(data); log(`queued ${j.id}: ${j.company} — ${j.role_title}`); break }
    case 'apply-result': { const j = recordApplyResult(data, args[0], { status: args[1], notes: args.slice(2).join(' ') }); save(data); log(`${j.company}: apply_status=${j.apply_status} status=${j.status}`); break }
    case 'rescore': { const n = rescore(data); const h = hygiene(data); save(data); log(`rescored ${n} feed records (${h.merged} merged)`); break }
    case 'reset-feed': {
      const before = data.discovered.length
      data.discovered = data.discovered.filter(d => ['tracked', 'dismissed'].includes(d.status))
      data.improvements = data.improvements.filter(i => i.type !== 'discovered')
      save(data); log(`feed reset: removed ${before - data.discovered.length}, kept ${data.discovered.length}`); break
    }
    case 'status': log(JSON.stringify({ data_file: DATA_FILE, agents: agentStatus(data), counts: { jobs: data.jobs.length, discovered_new: data.discovered.filter(d => d.status === 'new').length, signals_pending: data.email_signals.filter(s => !s.applied && !s.dismissed).length, improvements: data.improvements.length, outbox_drafts: data.outbox.filter(o => o.status === 'draft').length } }, null, 2)); break
    default:
      console.error('usage: node agents/run.mjs <fetch|scan|digest|all|ingest|ingest-file|ingest-discovered|apply|packet|apply-queue|apply-result|status|rescore|reset-feed> [--send]'); process.exit(1)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
