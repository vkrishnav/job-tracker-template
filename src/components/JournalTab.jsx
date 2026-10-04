import { useMemo, useState } from 'react'
import { Plus, Trash2, Filter } from 'lucide-react'
import { addJournalEntry, deleteJournalEntry } from '../hooks/useJobsApi'
import { fmtTs } from '../lib/format'

const TYPE_STYLE = {
  note:          'bg-slate-800 text-slate-200 border-slate-700',
  status_change: 'bg-blue-950 text-blue-200 border-blue-800',
  email:         'bg-cyan-950 text-cyan-200 border-cyan-800',
  agent:         'bg-violet-950 text-violet-200 border-violet-800',
  followup:      'bg-amber-950 text-amber-200 border-amber-800',
  improvement:   'bg-orange-950 text-orange-200 border-orange-800',
  discovered:    'bg-emerald-950 text-emerald-200 border-emerald-800',
  outbox:        'bg-pink-950 text-pink-200 border-pink-800',
}
const TYPES = Object.keys(TYPE_STYLE)

function TypeBadge({ type }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium tracking-wide ${TYPE_STYLE[type] || TYPE_STYLE.note}`}>{(type || 'note').replace('_', ' ')}</span>
}

export default function JournalTab({ state, jobs, refresh }) {
  const [typeFilter, setTypeFilter] = useState('')
  const [jobFilter, setJobFilter] = useState('')
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'note', title: '', body: '', job_id: '' })
  const [busy, setBusy] = useState(false)

  const journal = useMemo(() => state?.journal || [], [state])
  const entries = useMemo(() => journal.filter(e =>
    (!typeFilter || e.type === typeFilter) &&
    (!jobFilter || e.job_id === jobFilter || (jobFilter === '__none' && !e.job_id)) &&
    (!q || `${e.title} ${e.body} ${e.company || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [journal, typeFilter, jobFilter, q])

  // group by day
  const groups = useMemo(() => {
    const g = []
    for (const e of entries) {
      const day = new Date(e.ts).toDateString()
      if (!g.length || g[g.length - 1].day !== day) g.push({ day, items: [] })
      g[g.length - 1].items.push(e)
    }
    return g
  }, [entries])

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setBusy(true)
    try {
      await addJournalEntry({ ...form, job_id: form.job_id || null, source: 'user' })
      setForm({ type: 'note', title: '', body: '', job_id: '' }); setShowForm(false); await refresh()
    } finally { setBusy(false) }
  }
  async function remove(id) { await deleteJournalEntry(id); await refresh() }

  const inp = 'bg-[#0f0f0f] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500'
  const jobName = id => { const j = jobs.find(x => x.id === id); return j ? `${j.company} — ${j.role_title}` : null }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-2 md:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={14} className="text-gray-500" />
          <select className={inp} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <select className={`${inp} max-w-[260px]`} value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
            <option value="">All jobs</option>
            <option value="__none">No job linked</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.company} — {j.role_title}</option>)}
          </select>
          <input className={`${inp} w-48`} placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="text-xs text-gray-500">{entries.length} of {journal.length}</span>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-2 rounded-lg">
          <Plus size={14} /> New entry
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {['note', 'followup', 'status_change', 'email'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <select className={`${inp} md:col-span-2`} value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
            <option value="">— no job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.company} — {j.role_title}</option>)}
          </select>
          <input className={inp} placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <textarea className={`${inp} md:col-span-4 h-20 resize-none`} placeholder="Details (what happened, what's next)…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          <div className="md:col-span-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400 px-3 py-2">Cancel</button>
            <button disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">Save entry</button>
          </div>
        </form>
      )}

      {groups.length === 0 && <div className="text-center text-gray-500 text-sm py-16">No journal entries yet. Agents and status changes will write here automatically.</div>}

      {groups.map(g => (
        <div key={g.day}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 sticky top-14 bg-[#0f0f0f] py-1">{g.day}</div>
          <ol className="relative border-l border-[#2a2a2a] ml-2 space-y-2">
            {g.items.map(e => (
              <li key={e.id} className="ml-4 group">
                <span className="absolute -left-[5px] mt-2 w-2 h-2 rounded-full bg-indigo-500/80" />
                <div className="bg-[#141414] border border-[#232323] rounded-lg px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] text-gray-500 font-mono w-14 shrink-0 pt-0.5">{fmtTs(e.ts)}</span>
                    <TypeBadge type={e.type} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100">{e.title}</div>
                      {e.body && <div className="text-xs text-gray-400 whitespace-pre-wrap mt-0.5 break-words">{e.body}</div>}
                      <div className="text-[11px] text-gray-600 mt-1 flex gap-2 flex-wrap">
                        {e.job_id && jobName(e.job_id) && <span className="text-indigo-400/80">{jobName(e.job_id)}</span>}
                        {!e.job_id && e.company && <span>{e.company}</span>}
                        <span>· {e.source}</span>
                      </div>
                    </div>
                    <button onClick={() => remove(e.id)} title="Delete" className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition"><Trash2 size={13} /></button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
