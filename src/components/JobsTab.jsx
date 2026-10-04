import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, ExternalLink, Search, X, MousePointerClick } from 'lucide-react'
import { STATUSES, LEVELS, STATUS_COLORS } from '../data/sampleData'
import { queueApply } from '../hooks/useJobsApi'

// ── Defaults & helpers ────────────────────────────────────────────────────────

const BLANK = {
  company: '',
  role_title: '',
  level: '',
  location: '',
  remote: false,
  salary_min: '',
  salary_max: '',
  equity_notes: '',
  retirement_match: '',
  growth_notes: '',
  parental_leave_weeks: '',
  parental_leave_notes: '',
  status: 'Researching',
  applied_date: '',
  next_action_date: '',
  deadline: '',
  resume_version: null,
  job_url: '',
  notes: '',
  priority: 3,
  contacts: [],
  // resume-intelligence fields
  ats_score: null,
  keyword_gaps: [],
  interview_prep_done: false,
  prep_questions_count: 0,
  fit_score: null,
}

/** Merge missing resume-intelligence fields into any job loaded from disk */
function withDefaults(job) {
  return {
    ats_score: null,
    keyword_gaps: [],
    interview_prep_done: false,
    prep_questions_count: 0,
    fit_score: null,
    ...job,
  }
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// ── Resume-intelligence display components ────────────────────────────────────

/**
 * ATS Score — green ≥ 80, yellow 60-79, red < 60, dash if null.
 * Formula: 0.4×required_skills + 0.2×nice_to_have + 0.2×quantification + 0.1×section_completeness + 0.1×keyword_distribution
 */
function AtsScore({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls =
    score >= 80 ? 'text-emerald-400' :
    score >= 60 ? 'text-yellow-400' :
    'text-red-400'
  return <span className={`text-xs font-mono font-semibold ${cls}`}>{score}</span>
}

/**
 * Resume Version Badge.
 *  "ai"         → violet [AI] pill
 *  "fullstack"  → cyan   [FS] pill
 *  null/''      → gray dot
 *  anything else (legacy like "v3-fintech") → gray truncated pill
 */
function ResumeBadge({ version }) {
  if (!version) {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-gray-700"
        title="No resume version set"
      />
    )
  }
  if (version === 'ai') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-900/70 text-violet-300 border border-violet-700/50 tracking-wide">
        AI
      </span>
    )
  }
  if (version === 'fullstack') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-900/70 text-cyan-300 border border-cyan-700/50 tracking-wide">
        FS
      </span>
    )
  }
  // Legacy version string (e.g. "v3-fintech") — show truncated
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700/40"
      title={version}
    >
      {version.length > 7 ? version.slice(0, 7) + '…' : version}
    </span>
  )
}

/**
 * Fit Score — green ≥ 8, yellow 6-7, red ≤ 5, dash if null.
 */
function FitScore({ score }) {
  if (score == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const cls =
    score >= 8 ? 'text-emerald-400' :
    score >= 6 ? 'text-yellow-400' :
    'text-red-400'
  return (
    <span className={`text-xs font-mono font-semibold ${cls}`}>
      {score}<span className="text-gray-600 font-normal">/10</span>
    </span>
  )
}

// ── Add / Edit form (slide-in panel) ─────────────────────────────────────────

function JobForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...initial }))
  const [kgInput, setKgInput] = useState(() =>
    (initial?.keyword_gaps ?? []).join(', ')
  )

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      salary_min: numOrNull(form.salary_min),
      salary_max: numOrNull(form.salary_max),
      parental_leave_weeks: numOrNull(form.parental_leave_weeks),
      ats_score: numOrNull(form.ats_score),
      fit_score: numOrNull(form.fit_score),
      prep_questions_count: numOrNull(form.prep_questions_count) ?? 0,
      keyword_gaps: kgInput.split(',').map(s => s.trim()).filter(Boolean),
      resume_version: form.resume_version || null,
    })
  }

  const inp =
    'w-full bg-[#0f0f0f] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500'
  const sel =
    'w-full bg-[#0f0f0f] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500'
  const lbl = 'block text-xs text-gray-400 mb-1'
  const section = 'text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl h-screen bg-[#111] border-l border-[#2a2a2a] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a] shrink-0">
          <h2 className="text-white font-semibold">
            {form.id ? 'Edit Job' : 'Add Job'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Core */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Company *</label>
              <input className={inp} value={form.company} onChange={e => set('company', e.target.value)} required placeholder="Acme Corp" />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Role Title *</label>
              <input className={inp} value={form.role_title} onChange={e => set('role_title', e.target.value)} required placeholder="Staff Engineer" />
            </div>
            <div>
              <label className={lbl}>Level</label>
              <select className={sel} value={form.level} onChange={e => set('level', e.target.value)}>
                <option value="">—</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select className={sel} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Location</label>
              <input className={inp} value={form.location} onChange={e => set('location', e.target.value)} placeholder="Remote / NYC" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="jf_remote"
                checked={!!form.remote}
                onChange={e => set('remote', e.target.checked)}
                className="accent-indigo-500 w-4 h-4"
              />
              <label htmlFor="jf_remote" className="text-sm text-gray-300">Remote</label>
            </div>
          </div>

          {/* Compensation */}
          <div>
            <p className={section}>Compensation</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Salary Min ($)</label>
                <input className={inp} type="number" value={form.salary_min ?? ''} onChange={e => set('salary_min', e.target.value)} placeholder="200000" />
              </div>
              <div>
                <label className={lbl}>Salary Max ($)</label>
                <input className={inp} type="number" value={form.salary_max ?? ''} onChange={e => set('salary_max', e.target.value)} placeholder="280000" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Equity Notes</label>
                <input className={inp} value={form.equity_notes ?? ''} onChange={e => set('equity_notes', e.target.value)} placeholder="RSUs, 4yr vest" />
              </div>
              <div>
                <label className={lbl}>401k / Retirement Match</label>
                <input className={inp} value={form.retirement_match ?? ''} onChange={e => set('retirement_match', e.target.value)} placeholder="100% up to 6%" />
              </div>
              <div>
                <label className={lbl}>Growth Notes</label>
                <input className={inp} value={form.growth_notes ?? ''} onChange={e => set('growth_notes', e.target.value)} placeholder="Series C, path to Principal" />
              </div>
            </div>
          </div>

          {/* Parental leave */}
          <div>
            <p className={section}>Parental Leave</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Weeks</label>
                <input className={inp} type="number" value={form.parental_leave_weeks ?? ''} onChange={e => set('parental_leave_weeks', e.target.value)} placeholder="16" />
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <input className={inp} value={form.parental_leave_notes ?? ''} onChange={e => set('parental_leave_notes', e.target.value)} placeholder="Primary caregiver" />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div>
            <p className={section}>Dates</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Applied</label>
                <input className={inp} type="date" value={form.applied_date ?? ''} onChange={e => set('applied_date', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Next Action</label>
                <input className={inp} type="date" value={form.next_action_date ?? ''} onChange={e => set('next_action_date', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Deadline</label>
                <input className={inp} type="date" value={form.deadline ?? ''} onChange={e => set('deadline', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Priority + URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Priority (1–5)</label>
              <input className={inp} type="number" min="1" max="5" value={form.priority} onChange={e => set('priority', Number(e.target.value))} />
            </div>
            <div>
              <label className={lbl}>Job URL</label>
              <input className={inp} value={form.job_url ?? ''} onChange={e => set('job_url', e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {/* ── Resume Intelligence ── */}
          <div className="border border-indigo-900/50 rounded-xl p-4 space-y-4 bg-indigo-950/10">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
              Resume Intelligence
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>ATS Score (0–100)</label>
                <input
                  className={inp}
                  type="number" min="0" max="100"
                  value={form.ats_score ?? ''}
                  onChange={e => set('ats_score', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={lbl}>Fit Score (1–10)</label>
                <input
                  className={inp}
                  type="number" min="1" max="10"
                  value={form.fit_score ?? ''}
                  onChange={e => set('fit_score', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={lbl}>Resume Version</label>
                <select
                  className={sel}
                  value={form.resume_version ?? ''}
                  onChange={e => set('resume_version', e.target.value || null)}
                >
                  <option value="">None</option>
                  <option value="ai">AI-focused</option>
                  <option value="fullstack">Full-Stack</option>
                </select>
              </div>
            </div>

            <div>
              <label className={lbl}>Keyword Gaps (comma-separated)</label>
              <input
                className={inp}
                value={kgInput}
                onChange={e => setKgInput(e.target.value)}
                placeholder="distributed systems, Kafka, gRPC, incident command"
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Paste output from the Recruiter Keyword Scanner skill
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Interview Prep Questions</label>
                <input
                  className={inp}
                  type="number" min="0"
                  value={form.prep_questions_count ?? 0}
                  onChange={e => set('prep_questions_count', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="jf_prep"
                  checked={!!form.interview_prep_done}
                  onChange={e => set('interview_prep_done', e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <label htmlFor="jf_prep" className="text-sm text-gray-300">
                  Interview Prep Done
                </label>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Notes</label>
            <textarea
              className={`${inp} h-24 resize-none`}
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Recruiter contact, impressions, next steps…"
            />
          </div>

          {/* Submit */}
          <div className="pb-6">
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {form.id ? 'Save Changes' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirm({ job, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 bg-[#1a1a1a] border border-[#3a3a3a] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-white font-semibold mb-2">Delete job?</h3>
        <p className="text-gray-400 text-sm mb-5">
          Remove <span className="text-white font-medium">{job.company}</span> —{' '}
          {job.role_title}? This can't be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-[#3a3a3a] text-gray-300 hover:text-white py-2 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function JobsTab({ jobs, setJobs }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState(null)     // null = closed, {} = new job, job obj = edit
  const [deleting, setDeleting] = useState(null)   // job to delete or null

  const filtered = useMemo(() => {
    let list = jobs.map(withDefaults)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(j =>
        j.company.toLowerCase().includes(q) ||
        j.role_title.toLowerCase().includes(q) ||
        (j.notes ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter) {
      list = list.filter(j => j.status === statusFilter)
    }
    return [...list].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }, [jobs, query, statusFilter])

  function handleSave(job) {
    if (job.id) {
      // Edit existing
      setJobs(prev => prev.map(j => j.id === job.id ? job : j))
    } else {
      // New
      setJobs(prev => [...prev, { ...job, id: Date.now().toString() }])
    }
    setEditing(null)
  }

  function handleDelete() {
    if (!deleting) return
    setJobs(prev => prev.filter(j => j.id !== deleting.id))
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 w-full sm:max-w-md">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="Search companies, roles…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {/* Status filter */}
          <select
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={14} /> Add Job
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-16">
            {jobs.length === 0
              ? 'No jobs yet — add your first one above.'
              : 'No jobs match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Company / Role</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-center px-3 py-3 font-medium" title="ATS Score (0–100)">ATS</th>
                  <th className="text-center px-3 py-3 font-medium" title="Resume version used">Resume</th>
                  <th className="text-center px-3 py-3 font-medium" title="Recruiter fit score (1–10)">Fit</th>
                  <th className="text-center px-3 py-3 font-medium">★</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {filtered.map(job => (
                  <tr
                    key={job.id}
                    className="hover:bg-[#1f1f1f] transition-colors group"
                  >
                    {/* Company / Role */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{job.company}</span>
                        <span className="text-gray-400">— {job.role_title}</span>

                        {/* Keyword gaps count pill */}
                        {job.keyword_gaps?.length > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-950/60 text-orange-400 border border-orange-800/30 whitespace-nowrap"
                            title={`Missing: ${job.keyword_gaps.join(', ')}`}
                          >
                            {job.keyword_gaps.length} gap{job.keyword_gaps.length !== 1 ? 's' : ''}
                          </span>
                        )}

                        {/* Prep done badge */}
                        {job.interview_prep_done && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/30">
                            prep ✓
                          </span>
                        )}

                        {job.job_url && (
                          <a
                            href={job.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-600 hover:text-indigo-400 transition-colors"
                            title="Open job posting"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>

                      {/* Salary sub-line */}
                      {job.salary_min && job.salary_max && (
                        <div className="text-xs text-gray-600 mt-0.5">
                          ${Math.round(job.salary_min / 1000)}–${Math.round(job.salary_max / 1000)}k
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] ?? 'bg-gray-700 text-gray-300'}`}>
                        {job.status}
                      </span>
                    </td>

                    {/* ATS Score */}
                    <td className="px-3 py-3 text-center">
                      <AtsScore score={job.ats_score} />
                    </td>

                    {/* Resume Version */}
                    <td className="px-3 py-3 text-center">
                      <ResumeBadge version={job.resume_version} />
                    </td>

                    {/* Fit Score */}
                    <td className="px-3 py-3 text-center">
                      <FitScore score={job.fit_score} />
                    </td>

                    {/* Priority stars */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-yellow-500/80 text-xs tracking-tighter">
                        {'★'.repeat(job.priority ?? 0)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditing(job)}
                          className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-gray-500 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        {!['Applied', 'Phone Screen', 'Technical Screen', 'Onsite', 'Offer', 'Accepted'].includes(job.status) && job.job_url && (
                          <button
                            onClick={() => queueApply({ job_id: job.id }).then(() => { location.hash = 'agents'; location.reload() }).catch(e => alert(e.message))}
                            className="p-1.5 rounded-md hover:bg-violet-950/50 text-gray-500 hover:text-violet-300 transition-colors"
                            title="Queue for browser apply (/apply)"
                          >
                            <MousePointerClick size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleting(job)}
                          className="p-1.5 rounded-md hover:bg-red-950/40 text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-[#222] text-xs text-gray-600">
            {filtered.length} job{filtered.length !== 1 ? 's' : ''}
            {(statusFilter || query) && jobs.length !== filtered.length
              ? ` · filtered from ${jobs.length}`
              : ''}
          </div>
        )}
      </div>

      {/* ATS legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-600">
        <span>ATS score:</span>
        <span><span className="text-emerald-400 font-mono font-semibold">80+</span> strong</span>
        <span><span className="text-yellow-400 font-mono font-semibold">60–79</span> fair</span>
        <span><span className="text-red-400 font-mono font-semibold">&lt;60</span> weak</span>
        <span className="mx-2 text-gray-700">·</span>
        <span>Resume: <span className="text-violet-300 text-[10px] font-bold">AI</span> AI-focused &nbsp;<span className="text-cyan-300 text-[10px] font-bold">FS</span> Full-Stack</span>
      </div>

      {/* Add / Edit panel */}
      {editing !== null && (
        <JobForm
          initial={editing?.id ? editing : undefined}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <DeleteConfirm
          job={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
