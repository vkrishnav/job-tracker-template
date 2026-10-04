import { useState } from 'react'
import { FileText, Plus, Trash2, Edit2, X } from 'lucide-react'

function today() {
  return new Date().toISOString().split('T')[0]
}

const BLANK_RESUME = {
  name: '',
  target_role_type: '',
  filename: '',
  notes: '',
  date_created: today(),
}

function ResumeForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...BLANK_RESUME, ...initial })

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

  const inp =
    'w-full bg-[#0f0f0f] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500'
  const lbl = 'block text-xs text-gray-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">{form.id ? 'Edit Resume' : 'Add Resume'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); onSave(form) }}
          className="space-y-3"
        >
          <div>
            <label className={lbl}>Version Name *</label>
            <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} required placeholder="v3-faang" />
          </div>
          <div>
            <label className={lbl}>Target Role Type</label>
            <input className={inp} value={form.target_role_type} onChange={e => set('target_role_type', e.target.value)} placeholder="Staff/Principal — Big Tech" />
          </div>
          <div>
            <label className={lbl}>Filename</label>
            <input className={inp} value={form.filename} onChange={e => set('filename', e.target.value)} placeholder="resume-vamsi-v3-faang.pdf" />
          </div>
          <div>
            <label className={lbl}>Notes</label>
            <textarea className={`${inp} h-20 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="What's emphasized, which roles it's optimized for…" />
          </div>
          <button
            type="submit"
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {form.id ? 'Save Changes' : 'Add Resume'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResumeTab({ resumes, setResumes, jobs }) {
  const [editing, setEditing] = useState(null)

  // Count how many jobs reference each resume by name
  function usageCount(resumeName) {
    return jobs.filter(j => j.resume_version === resumeName).length
  }

  function handleSave(resume) {
    if (resume.id) {
      setResumes(prev => prev.map(r => r.id === resume.id ? resume : r))
    } else {
      setResumes(prev => [...prev, { ...resume, id: `r${Date.now()}` }])
    }
    setEditing(null)
  }

  function handleDelete(id) {
    setResumes(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Resume Versions</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Track which resume version you submitted per job
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Add Version
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl py-16 text-center text-gray-500 text-sm">
          No resume versions yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map(r => (
            <div
              key={r.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-900/50 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={15} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm">{r.name}</p>
                    {r.target_role_type && (
                      <p className="text-gray-400 text-xs mt-0.5">{r.target_role_type}</p>
                    )}
                    {r.filename && (
                      <p className="text-gray-600 text-xs mt-0.5 font-mono truncate">{r.filename}</p>
                    )}
                    {r.notes && (
                      <p className="text-gray-500 text-xs mt-1.5">{r.notes}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditing(r)}
                    className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-gray-500 hover:text-white transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="p-1.5 rounded-md hover:bg-red-950/40 text-gray-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2a2a]">
                <span className="text-gray-600 text-xs">Created {r.date_created || '—'}</span>
                <span className="text-xs text-gray-500">
                  Used in{' '}
                  <span className="text-indigo-400 font-medium">{usageCount(r.name)}</span>{' '}
                  job{usageCount(r.name) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <ResumeForm
          initial={editing?.id ? editing : undefined}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
