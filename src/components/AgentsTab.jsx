import { useEffect, useMemo, useState } from 'react'
import { Play, RefreshCw, Rss, ScanSearch, Mail, FileText, ExternalLink, Check, X, Send, Zap, Settings, ListChecks, Inbox, History, AlertTriangle, Link2, MousePointerClick, Copy } from 'lucide-react'
import { fetchHealth, runAgent, trackDiscovered, patchDiscovered, applySignal, patchSignal, emailTemplates, createDraft, patchDraft, deleteDraft, sendDraft, dismissImprovement, updateConfig, queueApply, cancelApply, applyResult, applyPacket } from '../hooks/useJobsApi'
import { STATUS_COLORS } from '../data/sampleData'
import { fmtTs, ago, until, money } from '../lib/format'

// ── helpers ──────────────────────────────────────────────────────────────────
const GRADE_CLS = { A: 'bg-emerald-900/70 text-emerald-200 border-emerald-700', B: 'bg-lime-900/60 text-lime-200 border-lime-700', C: 'bg-yellow-900/60 text-yellow-200 border-yellow-700', D: 'bg-orange-900/60 text-orange-200 border-orange-700', F: 'bg-red-900/60 text-red-200 border-red-700' }
const SIG_CLS = { offer: 'bg-emerald-900 text-emerald-200', interview: 'bg-cyan-900 text-cyan-200', assessment: 'bg-violet-900 text-violet-200', rejection: 'bg-red-900 text-red-200', recruiter: 'bg-amber-900 text-amber-200', ack: 'bg-slate-800 text-slate-300', other: 'bg-zinc-800 text-zinc-400' }
const SEV_CLS = { high: 'border-red-800/60 bg-red-950/30', medium: 'border-amber-800/50 bg-amber-950/20', low: 'border-[#2a2a2a] bg-[#141414]' }
const btn = 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40'
const btnPrimary = `${btn} bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500`
const btnGhost = `${btn} border-[#3a3a3a] text-gray-300 hover:text-white hover:bg-[#1f1f1f]`
const btnGood = `${btn} bg-emerald-700/80 border-emerald-600 text-white hover:bg-emerald-600`
const inp = 'bg-[#0f0f0f] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500'
const Grade = ({ g, s }) => <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${GRADE_CLS[g] || GRADE_CLS.F}`}>{g}{s}</span>


// ── Agent cards + pipeline flow ─────────────────────────────────────────────
const AGENT_META = {
  fetch:        { label: 'Fetch',       icon: Rss,        desc: 'Polls 33 public job boards (Greenhouse · Ashby · Lever). Filters Staff/Principal titles, Dallas-or-remote, scores vs resume.' },
  scan:         { label: 'Scan',        icon: ScanSearch, desc: 'Improvement scanner: follow-ups due, overdue actions, stale apps, missing ATS scores, keyword gaps, unreviewed A/B roles.' },
  'email-sync': { label: 'Email Sync',  icon: Mail,       desc: 'Claude scheduled task reads Gmail via the connector, classifies replies (interview / rejection / OA / offer) and posts them here.' },
  digest:       { label: 'Digest',      icon: FileText,   desc: 'Writes ~/Documents/job-hunt-digest-DATE.md and queues (or sends) the email digest.' },
}

function AgentCard({ a, onRun, busy }) {
  const meta = AGENT_META[a.agent]
  const Icon = meta.icon
  const lr = a.last_run
  const dot = a.running ? 'bg-sky-400 animate-pulse' : !lr ? 'bg-gray-600' : lr.status === 'ok' ? 'bg-emerald-400' : lr.status === 'error' ? 'bg-red-400' : 'bg-amber-400'
  return (
    <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <Icon size={15} className="text-indigo-400" />
          <span className="font-semibold text-white text-sm">{meta.label}</span>
        </div>
        {a.agent !== 'email-sync' ? (
          <button disabled={busy || a.running} onClick={() => onRun(a.agent)} className={btnPrimary}><Play size={11} /> {a.running ? 'Running' : 'Run'}</button>
        ) : <span className="text-[10px] text-gray-500 border border-[#3a3a3a] rounded px-1.5 py-0.5">Claude task</span>}
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">{meta.desc}</p>
      <div className="text-[11px] text-gray-400 mt-auto">
        <div>Last: <span className={lr?.status === 'error' ? 'text-red-400' : 'text-gray-200'}>{lr ? `${lr.status} · ${ago(lr.started_at)}` : 'never'}</span>{a.interval_min && <span className="text-gray-600"> · every {a.interval_min >= 60 ? `${a.interval_min / 60}h` : `${a.interval_min}m`}{a.next_due ? ` · next ${until(a.next_due)}` : ''}</span>}</div>
        {lr?.summary && <div className="text-gray-500 truncate" title={lr.summary}>{lr.summary}</div>}
        {lr?.error && <div className="text-red-400 truncate" title={lr.error}>{lr.error}</div>}
      </div>
    </div>
  )
}

const Node = ({ children, hi }) => <span className={`px-2 py-1 rounded-md border text-[11px] whitespace-nowrap ${hi ? 'border-indigo-600 bg-indigo-950/50 text-indigo-200' : 'border-[#333] bg-[#141414] text-gray-400'}`}>{children}</span>
const Arrow = () => <span className="text-gray-600 text-xs">→</span>
function Flow() {
  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl px-4 py-3 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max">
        <Node>Job boards</Node><Arrow /><Node hi>Fetch</Node><Arrow /><Node hi>Score</Node><Arrow /><Node>Feed</Node><Arrow /><Node>Track → Jobs</Node>
        <span className="mx-3 text-gray-700">|</span>
        <Node>Gmail</Node><Arrow /><Node hi>Email Sync</Node><Arrow /><Node>Signals</Node><Arrow /><Node>Apply → Status</Node>
        <span className="mx-3 text-gray-700">|</span>
        <Node hi>Scan</Node><Arrow /><Node>Improvements</Node><Arrow /><Node hi>Digest</Node><Arrow /><Node>Outbox → Email</Node>
        <span className="mx-3 text-gray-700">|</span>
        <Node>Everything → Journal</Node>
      </div>
    </div>
  )
}

// ── Compose modal ────────────────────────────────────────────────────────────
function Compose({ initial, jobs, emailOk, onClose, onDone }) {
  const [draft, setDraft] = useState({ to: '', cc: '', subject: '', body: '', job_id: '', kind: 'followup', ...initial })
  const [tpl, setTpl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { emailTemplates(draft.job_id || 'none').then(setTpl).catch(() => {}) }, [draft.job_id])
  function applyTemplate(k) { if (!tpl?.[k]) return; setDraft(d => ({ ...d, kind: k, subject: tpl[k].subject, body: tpl[k].body })) }
  async function save(send) {
    setBusy(true); setErr('')
    try {
      const saved = draft.id ? await patchDraft(draft.id, draft) : await createDraft(draft)
      if (send) await sendDraft(saved.id)
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const mailto = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Mail size={14} /> Compose email</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={inp} value={draft.job_id || ''} onChange={e => setDraft(d => ({ ...d, job_id: e.target.value }))}>
              <option value="">— link to job —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.company} — {j.role_title}</option>)}
            </select>
            <div className="flex gap-1 flex-wrap items-center">
              <span className="text-[11px] text-gray-500 mr-1">Template:</span>
              {['followup', 'thankyou', 'inquiry', 'withdraw'].map(k => <button key={k} onClick={() => applyTemplate(k)} className={`${btnGhost} ${draft.kind === k ? 'border-indigo-500 text-indigo-300' : ''}`}>{k}</button>)}
            </div>
          </div>
          <input className={`${inp} w-full`} placeholder="To (recruiter / hiring manager email)" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} />
          <input className={`${inp} w-full`} placeholder="Subject" value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
          <textarea className={`${inp} w-full h-64 resize-y font-mono text-[13px]`} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
          {err && <div className="text-xs text-red-400">{err}</div>}
          {!emailOk && <div className="text-xs text-amber-400">Gmail SMTP not configured on the server (GMAIL_USER / GMAIL_APP_PASSWORD). You can still save drafts or open in your mail app.</div>}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#2a2a2a]">
          <a href={mailto} className={btnGhost}><ExternalLink size={12} /> Open in Mail app</a>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => save(false)} className={btnGhost}>Save draft</button>
            <button disabled={busy || !emailOk || !draft.to} onClick={() => save(true)} className={btnGood}><Send size={12} /> Send via Gmail</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────────────────
function Feed({ discovered, refresh, onQueued }) {
  const [grade, setGrade] = useState('AB')
  const [q, setQ] = useState('')
  const [loc, setLoc] = useState('')
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const list = useMemo(() => discovered
    .filter(d => d.status === 'new')
    .filter(d => grade === 'ALL' || grade.includes(d.grade))
    .filter(d => !loc || d.location_policy === loc)
    .filter(d => !q || `${d.company} ${d.role_title} ${d.location}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.score - a.score || (b.first_seen || '').localeCompare(a.first_seen || '')), [discovered, grade, q, loc])
  async function act(fn, id) { setBusy(id); try { await fn(); await refresh() } finally { setBusy(null) } }
  const counts = useMemo(() => ({ new: discovered.filter(d => d.status === 'new').length, tracked: discovered.filter(d => d.status === 'tracked').length, dismissed: discovered.filter(d => d.status === 'dismissed').length }), [discovered])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={inp} value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="AB">Grade A–B</option><option value="ABC">Grade A–C</option><option value="ALL">All grades</option>
        </select>
        <select className={inp} value={loc} onChange={e => setLoc(e.target.value)}>
          <option value="">Remote + Dallas</option><option value="remote">Remote only</option><option value="dallas-onsite">Dallas onsite</option>
        </select>
        <input className={`${inp} w-56`} placeholder="Filter company / title…" value={q} onChange={e => setQ(e.target.value)} />
        <span className="text-xs text-gray-500 ml-auto">{list.length} shown · {counts.new} new · {counts.tracked} tracked · {counts.dismissed} dismissed</span>
      </div>
      {list.length === 0 && <div className="text-sm text-gray-500 py-10 text-center">Nothing in the feed for this filter. Run <b>Fetch</b> or widen the grade filter.</div>}
      <div className="space-y-2">
        {list.map(d => (
          <div key={d.id} className="bg-[#141414] border border-[#232323] rounded-lg">
            <div className="flex items-center gap-3 px-3 py-2">
              <Grade g={d.grade} s={d.score} />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(open === d.id ? null : d.id)}>
                <div className="text-sm text-white truncate"><span className="font-medium">{d.company}</span> <span className="text-gray-400">—</span> {d.role_title}
                  {(d.perks || []).map(p => <span key={p} className={`ml-1.5 text-[9px] px-1 py-0.5 rounded border align-middle ${p === '401k match' ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40' : 'border-[#3a3a3a] text-gray-400'}`}>{p}</span>)}
                  {(d.growth || []).length > 0 && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded border border-violet-800 text-violet-300 bg-violet-950/40 align-middle">growth</span>}
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  <span className={d.location_policy === 'remote' ? 'text-emerald-400/80' : 'text-sky-400/80'}>{d.location_policy === 'remote' ? 'Remote' : 'Dallas'}</span> · {d.location || '—'}{d.alt_locations?.length ? ` +${d.alt_locations.length} more` : ''} · {(d.salary_min || d.salary_max) ? `${money(d.salary_min)}–${money(d.salary_max)}` : 'comp n/a'} · {d.source} · seen {ago(d.first_seen)}
                </div>
              </div>
              <a href={d.url} target="_blank" rel="noreferrer" className={btnGhost}><ExternalLink size={12} /> Open</a>
              <button disabled={busy === d.id} onClick={() => act(() => trackDiscovered(d.id, 'Researching'), d.id)} className={btnPrimary}><Check size={12} /> Track</button>
              <button disabled={busy === d.id} onClick={() => act(() => trackDiscovered(d.id, 'Applied'), d.id)} className={btnGood} title="Track as Applied (today)"><Zap size={12} /> Applied</button>
              <button disabled={busy === d.id} onClick={() => act(async () => { const j = await queueApply({ discovered_id: d.id }); onQueued(j) }, d.id)} className={`${btn} bg-violet-700/80 border-violet-600 text-white hover:bg-violet-600`} title="Queue for browser apply (Claude fills the form, you submit)"><MousePointerClick size={12} /> Apply</button>
              <button disabled={busy === d.id} onClick={() => act(() => patchDiscovered(d.id, { status: 'dismissed' }), d.id)} className={btnGhost} title="Dismiss"><X size={12} /></button>
            </div>
            {open === d.id && (
              <div className="px-3 pb-3 text-xs text-gray-400 space-y-2 border-t border-[#232323] pt-2">
                <div><span className="text-gray-500">Score:</span> {d.score_reasons?.join(' · ')}</div>
                <div><span className="text-gray-500">Matched:</span> <span className="text-emerald-300/80">{d.keywords_matched?.join(', ') || '—'}</span></div>
                <div><span className="text-gray-500">Missing:</span> <span className="text-amber-300/80">{d.keywords_missing?.join(', ') || '—'}</span></div>
                {d.alt_urls?.length > 0 && <div><span className="text-gray-500">Also posted:</span> {d.alt_urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline mr-2">{d.alt_locations?.[i] || `link ${i + 1}`}</a>)}</div>}
                {d.description_excerpt && <p className="text-gray-500 whitespace-pre-wrap line-clamp-6">{d.description_excerpt}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Signals({ signals, jobs, refresh, onCompose }) {
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(null)
  const list = signals.filter(s => showAll || (!s.applied && !s.dismissed))
  async function act(fn, id) { setBusy(id); try { await fn(); await refresh() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const jobOf = s => jobs.find(j => j.id === s.job_id)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-indigo-500" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> show applied / dismissed</label>
        <span className="ml-auto">{list.length} signals</span>
      </div>
      <div className="text-[11px] text-gray-500 bg-[#111] border border-[#232323] rounded-lg px-3 py-2">
        Signals arrive from the <b>job-hunt-agent</b> Claude scheduled task (Gmail connector) or from <code className="text-gray-400">POST /api/emails/ingest</code>. Applying a signal updates the job's status and writes a journal entry.
      </div>
      {list.length === 0 && <div className="text-sm text-gray-500 py-10 text-center">No pending email signals.</div>}
      {list.map(s => {
        const j = jobOf(s)
        return (
          <div key={s.id} className={`bg-[#141414] border rounded-lg px-3 py-2 ${s.applied ? 'border-[#1f1f1f] opacity-60' : 'border-[#2a2a2a]'}`}>
            <div className="flex items-start gap-3">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${SIG_CLS[s.classification] || SIG_CLS.other}`}>{s.classification}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{s.subject || '(no subject)'}</div>
                <div className="text-[11px] text-gray-500 truncate">{s.from} · {fmtTs(s.date)}</div>
                {s.snippet && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{s.snippet}</div>}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Link2 size={11} className="text-gray-600" />
                  <select className={`${inp} py-1 text-xs max-w-[300px]`} value={s.job_id || ''} onChange={e => act(() => patchSignal(s.id, { job_id: e.target.value || null }), s.id)}>
                    <option value="">— link to job —</option>
                    {jobs.map(x => <option key={x.id} value={x.id}>{x.company} — {x.role_title}</option>)}
                  </select>
                  {j && <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[j.status] || ''}`}>{j.status}</span>}
                  {s.applied && <span className="text-[10px] text-emerald-400">applied {ago(s.applied_at)}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button disabled={busy === s.id || s.applied || !s.job_id || !['rejection', 'interview', 'assessment', 'offer'].includes(s.classification)} onClick={() => act(() => applySignal(s.id), s.id)} className={btnGood} title="Update job status from this email"><Check size={12} /> Apply</button>
                <button onClick={() => onCompose({ job_id: s.job_id || '', to: (s.from.match(/<([^>]+)>/)?.[1] || s.from), subject: `Re: ${s.subject}`, kind: s.classification === 'interview' ? 'thankyou' : 'followup' })} className={btnGhost}><Send size={12} /> Reply</button>
                {!s.applied && <button disabled={busy === s.id} onClick={() => act(() => patchSignal(s.id, { dismissed: true }), s.id)} className={btnGhost}><X size={12} /></button>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Improvements({ improvements, jobs, refresh, onCompose, onNavigate, setSection }) {
  const [busy, setBusy] = useState(null)
  async function dismiss(key) { setBusy(key); try { await dismissImprovement(key); await refresh() } finally { setBusy(null) } }
  function action(i) {
    const j = jobs.find(x => x.id === i.job_id)
    if (i.action?.startsWith('compose:')) onCompose({ job_id: i.job_id || '', kind: i.action.split(':')[1] })
    else if (i.action === 'feed') setSection('feed')
    else if (i.action === 'signals') setSection('signals')
    else if (i.action === 'learning') onNavigate('learning')
    else if (i.action === 'edit' && j) onNavigate('jobs')
    else if (i.action?.startsWith('skill:')) alert(`Run the ${i.action.split(':')[1] === 'ats' ? 'ATS Diagnoser' : 'Interview Simulator'} skill in Claude Code — it writes results back through PATCH /api/jobs/:id.`)
  }
  if (!improvements.length) return <div className="text-sm text-gray-500 py-10 text-center">No findings. Run <b>Scan</b> to re-check.</div>
  return (
    <div className="space-y-2">
      {improvements.map(i => (
        <div key={i.key} className={`border rounded-lg px-3 py-2 flex items-start gap-3 ${SEV_CLS[i.severity]}`}>
          <AlertTriangle size={14} className={i.severity === 'high' ? 'text-red-400 mt-0.5' : i.severity === 'medium' ? 'text-amber-400 mt-0.5' : 'text-gray-500 mt-0.5'} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white">{i.title} <span className="text-[10px] text-gray-500 ml-1 uppercase">{i.type}</span></div>
            <div className="text-xs text-gray-400 mt-0.5">{i.body}</div>
            <div className="text-[10px] text-gray-600 mt-1">since {i.created}</div>
          </div>
          <div className="flex gap-1">
            {i.action && <button onClick={() => action(i)} className={btnPrimary}>{i.action.startsWith('compose') ? 'Compose' : i.action === 'feed' ? 'Open feed' : i.action === 'signals' ? 'Signals' : i.action === 'learning' ? 'Learning' : i.action.startsWith('skill') ? 'How' : 'Open'}</button>}
            <button disabled={busy === i.key} onClick={() => dismiss(i.key)} className={btnGhost}><X size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Outbox({ outbox, jobs, refresh, onCompose, emailOk }) {
  const [busy, setBusy] = useState(null)
  const [preview, setPreview] = useState(null)
  async function act(fn, id) { setBusy(id); try { await fn(); await refresh() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const jobName = id => { const j = jobs.find(x => x.id === id); return j ? `${j.company}` : '' }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{outbox.filter(o => o.status === 'draft').length} drafts · {outbox.filter(o => o.status === 'sent').length} sent · Gmail SMTP {emailOk ? <span className="text-emerald-400">ready</span> : <span className="text-amber-400">not configured</span>}</span>
        <button onClick={() => onCompose({})} className={btnPrimary}><Mail size={12} /> New email</button>
      </div>
      {outbox.length === 0 && <div className="text-sm text-gray-500 py-10 text-center">No drafts. Use <b>Reply</b> on a signal, <b>Compose</b> on an improvement, or run <b>Digest</b>.</div>}
      {outbox.map(o => (
        <div key={o.id} className="bg-[#141414] border border-[#232323] rounded-lg px-3 py-2">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${o.status === 'sent' ? 'bg-emerald-900 text-emerald-200' : o.status === 'failed' ? 'bg-red-900 text-red-200' : 'bg-zinc-800 text-zinc-300'}`}>{o.status}</span>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPreview(preview === o.id ? null : o.id)}>
              <div className="text-sm text-white truncate">{o.subject}</div>
              <div className="text-[11px] text-gray-500 truncate">to {o.to || '—'} · {o.kind}{o.job_id ? ` · ${jobName(o.job_id)}` : ''} · {fmtTs(o.sent_at || o.ts)}{o.error ? ` · ${o.error}` : ''}</div>
            </div>
            {o.status !== 'sent' && <button onClick={() => onCompose(o)} className={btnGhost}>Edit</button>}
            {o.status !== 'sent' && <button disabled={busy === o.id || !emailOk || !o.to} onClick={() => act(() => sendDraft(o.id), o.id)} className={btnGood}><Send size={12} /> Send</button>}
            <button disabled={busy === o.id} onClick={() => act(() => deleteDraft(o.id), o.id)} className={btnGhost}><X size={12} /></button>
          </div>
          {preview === o.id && <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap border-t border-[#232323] pt-2 max-h-80 overflow-y-auto">{o.body}</pre>}
        </div>
      ))}
    </div>
  )
}

const APPLY_CLS = { queued: 'bg-zinc-800 text-zinc-300', in_progress: 'bg-sky-900 text-sky-200', ready_to_submit: 'bg-amber-900 text-amber-200', submitted: 'bg-emerald-900 text-emerald-200', blocked: 'bg-red-900 text-red-200', failed: 'bg-red-900 text-red-200' }

function Applications({ jobs, refresh, queued, profile }) {
  const [busy, setBusy] = useState(null)
  const [packet, setPacket] = useState(null)
  const [copied, setCopied] = useState('')
  const list = jobs.filter(j => j.apply_status && j.apply_status !== 'cancelled').sort((a, b) => (b.apply_updated_at || b.apply_queued_at || '').localeCompare(a.apply_updated_at || a.apply_queued_at || ''))
  const missing = ['work_authorization', 'requires_sponsorship', 'salary_expectation'].filter(k => !profile?.[k])
  async function act(fn, id) { setBusy(id); try { await fn(); await refresh() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  function copy(text, id) { navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(''), 1500) }) }
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-gray-400 bg-[#111] border border-[#232323] rounded-lg px-3 py-2 space-y-1">
        <div><b className="text-gray-200">How browser apply works.</b> Queue a role here, then in Claude Code run <code className="text-indigo-300">/apply &lt;jobId&gt;</code>. Claude opens the posting in Chrome, fills the form from your application profile and resume, answers screening questions from the answer bank, uploads <code>{profile?.resume_path?.split('/').pop()}</code>, and <b className="text-amber-300">stops before Submit</b> so you review and click it. It never creates accounts, types passwords, or invents legal/salary answers.</div>
        {missing.length > 0 && <div className="text-amber-400">Profile fields still blank (Claude will ask each time until set in Config → Application profile): {missing.join(', ')}</div>}
      </div>
      {queued && <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-lg px-3 py-2 flex items-center gap-2">Queued {queued.company} — {queued.role_title}. Run: <code className="text-white">/apply {queued.id}</code> <button onClick={() => copy(`/apply ${queued.id}`, 'q')} className={btnGhost}><Copy size={11} /> {copied === 'q' ? 'copied' : 'copy'}</button></div>}
      {list.length === 0 && <div className="text-sm text-gray-500 py-10 text-center">No applications queued. Use <b>Apply</b> on a feed role or a tracked job.</div>}
      {list.map(j => (
        <div key={j.id} className="bg-[#141414] border border-[#232323] rounded-lg px-3 py-2">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase whitespace-nowrap ${APPLY_CLS[j.apply_status] || APPLY_CLS.queued}`}>{j.apply_status.replace(/_/g, ' ')}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate"><span className="font-medium">{j.company}</span> — {j.role_title}</div>
              <div className="text-[11px] text-gray-500 truncate">{j.job_url} · {fmtTs(j.apply_updated_at || j.apply_queued_at)}{j.apply_notes ? ` · ${j.apply_notes}` : ''}</div>
            </div>
            <button onClick={() => copy(`/apply ${j.id}`, j.id)} className={btnGhost} title="Copy the Claude Code command"><Copy size={12} /> {copied === j.id ? 'copied' : `/apply ${j.id}`}</button>
            <button onClick={() => applyPacket(j.id).then(setPacket).catch(e => alert(e.message))} className={btnGhost}>Packet</button>
            <a href={j.job_url} target="_blank" rel="noreferrer" className={btnGhost}><ExternalLink size={12} /></a>
            {j.apply_status === 'ready_to_submit' && <button disabled={busy === j.id} onClick={() => act(() => applyResult(j.id, { status: 'submitted', notes: 'marked submitted from dashboard' }), j.id)} className={btnGood}><Check size={12} /> I submitted</button>}
            {j.apply_status !== 'submitted' && <button disabled={busy === j.id} onClick={() => act(() => cancelApply(j.id), j.id)} className={btnGhost}><X size={12} /></button>}
          </div>
        </div>
      ))}
      {packet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPacket(null)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a2a]"><h3 className="text-white font-semibold text-sm">Application packet — {packet.job.company}</h3><button onClick={() => setPacket(null)} className="text-gray-400 hover:text-white"><X size={16} /></button></div>
            <div className="p-5 overflow-y-auto text-xs text-gray-300 space-y-3">
              <div><span className="text-gray-500">ATS:</span> {packet.ats} · <span className="text-gray-500">Resume:</span> {packet.resume.path} {packet.resume.exists ? <span className="text-emerald-400">found</span> : <span className="text-red-400">missing</span>}</div>
              {packet.missing_profile_fields.length > 0 && <div className="text-amber-400">Will ask for: {packet.missing_profile_fields.join(', ')}</div>}
              <div><div className="text-gray-500 mb-1">Talking points</div><ul className="list-disc ml-4 space-y-0.5">{packet.talking_points.map(t => <li key={t}>{t}</li>)}</ul></div>
              <div><div className="text-gray-500 mb-1">Why interested (draft)</div><p className="whitespace-pre-wrap">{packet.profile.why_interested}</p></div>
              <div><div className="text-gray-500 mb-1">Screening answer bank ({packet.screening_answers.length})</div><table className="w-full"><tbody>{packet.screening_answers.map(a => <tr key={a.match} className="border-t border-[#1f1f1f]"><td className="py-1 pr-2 font-mono text-[10px] text-gray-500 align-top">{a.match}</td><td className="py-1 text-gray-200">{a.answer || <span className="text-amber-400">(blank → will ask)</span>}</td></tr>)}</tbody></table></div>
              <div><div className="text-gray-500 mb-1">Rules</div><ul className="list-disc ml-4">{packet.rules.map(r => <li key={r}>{r}</li>)}</ul></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Runs({ runs }) {
  if (!runs.length) return <div className="text-sm text-gray-500 py-10 text-center">No runs yet.</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500 text-left"><tr><th className="py-1.5 pr-3">Agent</th><th className="pr-3">Status</th><th className="pr-3">Started</th><th className="pr-3">Duration</th><th className="pr-3">Trigger</th><th>Summary</th></tr></thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id} className="border-t border-[#1f1f1f] text-gray-300">
              <td className="py-1.5 pr-3 font-medium text-white">{r.agent}</td>
              <td className={`pr-3 ${r.status === 'ok' ? 'text-emerald-400' : r.status === 'error' ? 'text-red-400' : 'text-sky-400'}`}>{r.status}</td>
              <td className="pr-3 whitespace-nowrap">{fmtTs(r.started_at)}</td>
              <td className="pr-3">{r.finished_at ? `${Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000)}s` : '…'}</td>
              <td className="pr-3">{r.trigger}</td>
              <td className="text-gray-400 max-w-[520px] truncate" title={r.summary || r.error}>{r.summary || r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Config({ config, refresh }) {
  const [cfg, setCfg] = useState(config)
  const [busy, setBusy] = useState(false)
  const [add, setAdd] = useState({ company: '', board: 'greenhouse', slug: '' })
  async function save() { setBusy(true); try { await updateConfig(cfg); await refresh() } finally { setBusy(false) } }
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs text-gray-400">Fetch every (min)<input type="number" className={`${inp} w-full mt-1`} value={cfg.fetch_interval_min} onChange={e => set('fetch_interval_min', Number(e.target.value))} /></label>
        <label className="text-xs text-gray-400">Scan every (min)<input type="number" className={`${inp} w-full mt-1`} value={cfg.scan_interval_min} onChange={e => set('scan_interval_min', Number(e.target.value))} /></label>
        <label className="text-xs text-gray-400">Salary floor<input type="number" className={`${inp} w-full mt-1`} value={cfg.min_salary} onChange={e => set('min_salary', Number(e.target.value))} /></label>
        <label className="text-xs text-gray-400">Follow up after (days)<input type="number" className={`${inp} w-full mt-1`} value={cfg.followup_after_days} onChange={e => set('followup_after_days', Number(e.target.value))} /></label>
        <label className="text-xs text-gray-400 col-span-2">Digest email to<input className={`${inp} w-full mt-1`} value={cfg.email?.to || ''} onChange={e => set('email', { ...cfg.email, to: e.target.value })} /></label>
        <label className="text-xs text-gray-400 flex items-end gap-2 pb-2"><input type="checkbox" className="accent-indigo-500" checked={!!cfg.email?.auto_send_digest} onChange={e => set('email', { ...cfg.email, auto_send_digest: e.target.checked })} /> Auto-send digest</label>
        <label className="text-xs text-gray-400 flex items-end gap-2 pb-2"><input type="checkbox" className="accent-indigo-500" checked={!!cfg.exclude_non_matching_location} onChange={e => set('exclude_non_matching_location', e.target.checked)} /> Enforce Dallas-or-remote</label>
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">Title must include (comma-separated)</div>
        <input className={`${inp} w-full`} value={cfg.title_include.join(', ')} onChange={e => set('title_include', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">High-growth tech companies (scoring bonus; perks like 401k match are detected from posting text)</div>
        <input className={`${inp} w-full`} value={(cfg.growth_companies || []).join(', ')} onChange={e => set('growth_companies', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">Dallas-metro onsite locations accepted</div>
        <input className={`${inp} w-full`} value={cfg.onsite_locations_ok.join(', ')} onChange={e => set('onsite_locations_ok', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-400">Watchlist ({cfg.watchlist.length} boards)</span></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {cfg.watchlist.map((w, i) => (
            <label key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${w.enabled === false ? 'border-[#222] text-gray-600' : 'border-[#2a2a2a] text-gray-300'}`}>
              <input type="checkbox" className="accent-indigo-500" checked={w.enabled !== false} onChange={e => set('watchlist', cfg.watchlist.map((x, k) => k === i ? { ...x, enabled: e.target.checked } : x))} />
              <span className="truncate flex-1">{w.company}</span><span className="text-gray-600">{w.board}</span>
              <button onClick={() => set('watchlist', cfg.watchlist.filter((_, k) => k !== i))} className="text-gray-600 hover:text-red-400"><X size={11} /></button>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input className={inp} placeholder="Company" value={add.company} onChange={e => setAdd(a => ({ ...a, company: e.target.value }))} />
          <select className={inp} value={add.board} onChange={e => setAdd(a => ({ ...a, board: e.target.value }))}><option>greenhouse</option><option>ashby</option><option>lever</option></select>
          <input className={inp} placeholder="board slug" value={add.slug} onChange={e => setAdd(a => ({ ...a, slug: e.target.value }))} />
          <button disabled={!add.company || !add.slug} onClick={() => { set('watchlist', [...cfg.watchlist, { ...add }]); setAdd({ company: '', board: 'greenhouse', slug: '' }) }} className={btnGhost}>Add board</button>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">Application profile (used by <code>/apply</code>; blank legal/salary fields make Claude ask first)</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(cfg.application_profile || {}).map(([k, v]) => (
            <label key={k} className="text-[11px] text-gray-500">{k.replace(/_/g, ' ')}
              <input className={`${inp} w-full mt-0.5 ${['work_authorization', 'requires_sponsorship', 'salary_expectation'].includes(k) && !v ? 'border-amber-700' : ''}`} value={v ?? ''} onChange={e => set('application_profile', { ...cfg.application_profile, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">Screening answer bank (regex → answer; <code>{'{{field}}'}</code> pulls from the profile)</div>
        <div className="space-y-1">
          {(cfg.screening_answers || []).map((a, i) => (
            <div key={i} className="flex gap-2">
              <input className={`${inp} flex-1 font-mono text-[11px]`} value={a.match} onChange={e => set('screening_answers', cfg.screening_answers.map((x, k) => k === i ? { ...x, match: e.target.value } : x))} />
              <input className={`${inp} flex-1`} value={a.answer} onChange={e => set('screening_answers', cfg.screening_answers.map((x, k) => k === i ? { ...x, answer: e.target.value } : x))} />
              <button onClick={() => set('screening_answers', cfg.screening_answers.filter((_, k) => k !== i))} className="text-gray-600 hover:text-red-400"><X size={12} /></button>
            </div>
          ))}
          <button onClick={() => set('screening_answers', [...(cfg.screening_answers || []), { match: '', answer: '' }])} className={btnGhost}>Add answer</button>
        </div>
      </div>
      <div className="flex justify-end"><button disabled={busy} onClick={save} className={btnPrimary}><Settings size={12} /> Save config</button></div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'feed', label: 'Feed', icon: Rss }, { id: 'apply', label: 'Applications', icon: MousePointerClick }, { id: 'signals', label: 'Email signals', icon: Inbox }, { id: 'improvements', label: 'Improvements', icon: ListChecks },
  { id: 'outbox', label: 'Outbox', icon: Send }, { id: 'runs', label: 'Runs', icon: History }, { id: 'config', label: 'Config', icon: Settings },
]

export default function AgentsTab({ state, jobs, refresh, onNavigate }) {
  const [section, setSection] = useState('feed')
  const [busy, setBusy] = useState(false)
  const [compose, setCompose] = useState(null)
  const [msg, setMsg] = useState('')
  const [queued, setQueued] = useState(null)

  if (!state) return <div className="text-sm text-gray-500 py-16 text-center">Agent state unavailable — start the API server (<code>npm run server</code>).</div>

  async function run(name) {
    setBusy(true); setMsg(`${name} started…`)
    try {
      await runAgent(name)
      // poll a few times for completion
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 2500))
        await refresh()
        const h = await fetchHealth()
        const stillRunning = name === 'all' ? Object.keys(h.running || {}).length > 0 : !!h.running?.[name]
        if (!stillRunning) break
      }
      setMsg(`${name} finished`)
    } catch (e) { setMsg(e.message) } finally { setBusy(false); setTimeout(() => setMsg(''), 4000) }
  }

  const counts = {
    feed: state.discovered.filter(d => d.status === 'new' && ['A', 'B'].includes(d.grade)).length,
    signals: state.email_signals.filter(s => !s.applied && !s.dismissed).length,
    improvements: state.improvements.filter(i => i.severity !== 'low').length,
    outbox: state.outbox.filter(o => o.status === 'draft').length,
    apply: jobs.filter(j => j.apply_status && !['submitted', 'cancelled'].includes(j.apply_status)).length,
    runs: state.runs.length, config: null,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-white font-semibold">Agentic workflow</h2>
          <p className="text-xs text-gray-500">Scheduler {state.scheduler ? 'on' : 'off'} · data {state.meta?.updated_at ? ago(state.meta.updated_at) : ''} · {state.discovered.length} discovered · {state.journal.length} journal entries</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-indigo-300">{msg}</span>}
          <button onClick={refresh} className={btnGhost}><RefreshCw size={12} /> Refresh</button>
          <button disabled={busy} onClick={() => run('all')} className={btnPrimary}><Zap size={12} /> Run all (fetch → scan → digest)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {state.agents.map(a => <AgentCard key={a.agent} a={a} onRun={run} busy={busy} />)}
      </div>
      <Flow />

      <div className="flex gap-1 border-b border-[#2a2a2a] overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${section === s.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            <s.icon size={13} /> {s.label}
            {counts[s.id] > 0 && <span className={`text-[10px] px-1.5 rounded-full ${s.id === 'signals' || s.id === 'improvements' ? 'bg-amber-500 text-black' : 'bg-[#2a2a2a] text-gray-300'}`}>{counts[s.id]}</span>}
          </button>
        ))}
      </div>

      {section === 'feed' && <Feed discovered={state.discovered} refresh={refresh} onQueued={j => { setQueued(j); setSection('apply') }} />}
      {section === 'apply' && <Applications jobs={jobs} refresh={refresh} queued={queued} profile={state.config.application_profile} />}
      {section === 'signals' && <Signals signals={state.email_signals} jobs={jobs} refresh={refresh} onCompose={setCompose} />}
      {section === 'improvements' && <Improvements improvements={state.improvements} jobs={jobs} refresh={refresh} onCompose={setCompose} onNavigate={onNavigate} setSection={setSection} />}
      {section === 'outbox' && <Outbox outbox={state.outbox} jobs={jobs} refresh={refresh} onCompose={setCompose} emailOk={state.email_configured} />}
      {section === 'runs' && <Runs runs={state.runs} />}
      {section === 'config' && <Config key={state.meta?.updated_at} config={state.config} refresh={refresh} />}

      {compose && <Compose initial={compose} jobs={jobs} emailOk={state.email_configured} onClose={() => setCompose(null)} onDone={async () => { setCompose(null); await refresh(); setSection('outbox') }} />}
    </div>
  )
}
