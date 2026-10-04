// Runs an agent without clobbering concurrent edits: long-running agents work on a
// snapshot, then their additions are merged into a freshly loaded copy of the file.
import { load, mutate } from './store.mjs'
import { runFetch } from '../fetch.mjs'
import { runScan } from '../scan.mjs'
import { runDigest } from '../digest.mjs'
import { hygiene } from './ingest.mjs'

const running = new Map() // agent → started_at

const normUrl = (u = '') => u.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()

function mergeAppendOnly(fresh, snap, key) {
  const ids = new Set(fresh[key].map(x => x.id))
  for (const x of snap[key]) if (!ids.has(x.id)) fresh[key].push(x)
}

export function isRunning(agent) { return running.has(agent) }
export function runningAgents() { return Object.fromEntries(running) }

export async function runAgent(name, { trigger = 'api', send = null, log = () => {} } = {}) {
  if (running.has(name)) throw new Error(`${name} is already running`)
  running.set(name, new Date().toISOString())
  try {
    if (name === 'fetch') {
      const snap = load()
      const r = await runFetch(snap, { trigger, log })
      mutate(fresh => {
        const byUrl = new Map(fresh.discovered.map(d => [normUrl(d.url), d]))
        for (const d of snap.discovered) {
          const ex = byUrl.get(normUrl(d.url))
          if (ex) { ex.last_seen = d.last_seen; if (ex.status === 'expired' && d.status === 'new') ex.status = 'new' }
          else fresh.discovered.push(d)
        }
        mergeAppendOnly(fresh, snap, 'runs'); mergeAppendOnly(fresh, snap, 'journal')
        hygiene(fresh)
      })
      return { run: r.run, stats: r.stats }
    }
    if (name === 'scan') {
      return mutate(data => { const r = runScan(data, { trigger }); return { run: r.run, stats: r.stats } })
    }
    if (name === 'digest') {
      const snap = load()
      const r = await runDigest(snap, { trigger, send })
      mutate(fresh => { mergeAppendOnly(fresh, snap, 'runs'); mergeAppendOnly(fresh, snap, 'journal'); mergeAppendOnly(fresh, snap, 'outbox') })
      return { run: r.run, file: r.file, sent: r.sent }
    }
    if (name === 'all') {
      const out = {}
      running.delete(name)
      out.fetch = await runAgent('fetch', { trigger, log })
      out.scan = await runAgent('scan', { trigger })
      out.digest = await runAgent('digest', { trigger, send })
      return out
    }
    throw new Error(`unknown agent ${name}`)
  } finally {
    running.delete(name)
  }
}
