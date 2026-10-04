import { useState, useEffect, useCallback, useRef } from 'react'
import { LayoutDashboard, Briefcase, FileText, BookOpen, Bot, NotebookPen } from 'lucide-react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { fetchJobs, saveAllJobs, fetchState } from './hooks/useJobsApi'
import { SAMPLE_JOBS, SAMPLE_RESUMES, SAMPLE_SKILLS } from './data/sampleData'
import Dashboard from './components/Dashboard'
import JobsTab from './components/JobsTab'
import ResumeTab from './components/ResumeTab'
import LearningTab from './components/LearningTab'
import AgentsTab from './components/AgentsTab'
import JournalTab from './components/JournalTab'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs',      label: 'Jobs',      icon: Briefcase },
  { id: 'agents',    label: 'Agents',    icon: Bot },
  { id: 'journal',   label: 'Journal',   icon: NotebookPen },
  { id: 'resumes',   label: 'Resumes',   icon: FileText },
  { id: 'learning',  label: 'Learning',  icon: BookOpen },
]

const POLL_MS = 30000

export default function App() {
  const [tab, setTab] = useState(() => (location.hash.replace('#', '') || 'dashboard'))
  const [jobs, setJobsState] = useState([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [state, setState] = useState(null)      // full agentic state from /api/state
  const [apiOk, setApiOk] = useState(true)
  const [resumes, setResumes] = useLocalStorage('jt_resumes', SAMPLE_RESUMES)
  const [skills, setSkills] = useLocalStorage('jt_skills', SAMPLE_SKILLS)
  const pollRef = useRef(null)

  useEffect(() => { location.hash = tab }, [tab])

  // Load everything from the file-backed API; fall back to localStorage if the server is down
  const refresh = useCallback(async () => {
    try {
      const s = await fetchState()
      setState(s)
      setJobsState(s.jobs)
      setApiOk(true)
      if (s.jobs.length === 0) {
        const saved = localStorage.getItem('jt_jobs')
        const localJobs = saved ? JSON.parse(saved) : SAMPLE_JOBS
        if (localJobs.length) { await saveAllJobs(localJobs).catch(() => {}); setJobsState(localJobs) }
      }
    } catch {
      setApiOk(false)
      try {
        const apiJobs = await fetchJobs()
        setJobsState(apiJobs)
      } catch {
        const saved = localStorage.getItem('jt_jobs')
        setJobsState(saved ? JSON.parse(saved) : SAMPLE_JOBS)
      }
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => { Promise.resolve().then(refresh) }, [refresh])

  // Poll while an agent-heavy tab is visible
  useEffect(() => {
    clearInterval(pollRef.current)
    if (['agents', 'dashboard', 'journal'].includes(tab)) pollRef.current = setInterval(refresh, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [tab, refresh])

  const setJobs = useCallback((valueOrUpdater) => {
    setJobsState(prev => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater
      saveAllJobs(next).then(() => refresh()).catch(() => {
        console.warn('API sync failed, persisting to localStorage')
        try { localStorage.setItem('jt_jobs', JSON.stringify(next)) } catch { /* storage unavailable */ }
      })
      return next
    })
  }, [refresh])

  const agentBadge = state ? (state.improvements?.filter(i => i.severity === 'high').length || 0) + (state.email_signals?.filter(s => !s.applied && !s.dismissed && ['interview', 'offer', 'assessment', 'rejection'].includes(s.classification)).length || 0) : 0

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-100 flex flex-col">
      <header className="border-b border-[#2a2a2a] bg-[#0f0f0f] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">J</div>
              <span className="font-semibold text-white tracking-tight hidden sm:block">JobTracker</span>
              {!apiOk && <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-800">API offline · localStorage</span>}
            </div>
            <nav className="flex items-center gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-[#1a1a1a]'}`}>
                  <Icon size={15} />
                  <span className="hidden sm:block">{label}</span>
                  {id === 'agents' && agentBadge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">{agentBadge}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {jobsLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Loading…</div>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard jobs={jobs} state={state} onNavigate={setTab} />}
            {tab === 'jobs' && <JobsTab jobs={jobs} setJobs={setJobs} resumes={resumes} />}
            {tab === 'agents' && <AgentsTab state={state} jobs={jobs} refresh={refresh} onNavigate={setTab} />}
            {tab === 'journal' && <JournalTab state={state} jobs={jobs} refresh={refresh} />}
            {tab === 'resumes' && <ResumeTab resumes={resumes} setResumes={setResumes} jobs={jobs} />}
            {tab === 'learning' && <LearningTab skills={skills} setSkills={setSkills} />}
          </>
        )}
      </main>
    </div>
  )
}
