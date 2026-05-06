import { useState, useEffect, useCallback } from 'react'
import { LayoutDashboard, Briefcase, FileText, BookOpen } from 'lucide-react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { fetchJobs, saveAllJobs } from './hooks/useJobsApi'
import { SAMPLE_JOBS, SAMPLE_RESUMES, SAMPLE_SKILLS } from './data/sampleData'
import Dashboard from './components/Dashboard'
import JobsTab from './components/JobsTab'
import ResumeTab from './components/ResumeTab'
import LearningTab from './components/LearningTab'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs',      label: 'Jobs',      icon: Briefcase },
  { id: 'resumes',   label: 'Resumes',   icon: FileText },
  { id: 'learning',  label: 'Learning',  icon: BookOpen },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  // Jobs are now backed by the file API; localStorage is the fallback
  const [jobs, setJobsState] = useState([])
  const [jobsLoading, setJobsLoading] = useState(true)

  // Resumes and skills remain in localStorage (not needed by external scripts)
  const [resumes, setResumes] = useLocalStorage('jt_resumes', SAMPLE_RESUMES)
  const [skills, setSkills] = useLocalStorage('jt_skills', SAMPLE_SKILLS)

  // Load jobs on mount — try API first, fall back to localStorage
  useEffect(() => {
    fetchJobs()
      .then(apiJobs => {
        // If the API returns an empty list and localStorage has data, use that
        // (first-time migration: seed the API from existing localStorage data)
        if (apiJobs.length === 0) {
          try {
            const saved = localStorage.getItem('jt_jobs')
            const localJobs = saved ? JSON.parse(saved) : SAMPLE_JOBS
            if (localJobs.length > 0) {
              // Migrate local data to the file backend
              saveAllJobs(localJobs).catch(() => {})
              setJobsState(localJobs)
            } else {
              setJobsState(SAMPLE_JOBS)
              saveAllJobs(SAMPLE_JOBS).catch(() => {})
            }
          } catch {
            setJobsState(SAMPLE_JOBS)
          }
        } else {
          setJobsState(apiJobs)
        }
      })
      .catch(() => {
        console.warn('API unreachable, falling back to localStorage')
        try {
          const saved = localStorage.getItem('jt_jobs')
          setJobsState(saved ? JSON.parse(saved) : SAMPLE_JOBS)
        } catch {
          setJobsState(SAMPLE_JOBS)
        }
      })
      .finally(() => setJobsLoading(false))
  }, [])

  // Wrapper for setJobs: updates state + syncs to file backend
  // Accepts either a new array or an updater function, matching useState's API
  const setJobs = useCallback((valueOrUpdater) => {
    setJobsState(prev => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater
      // Sync to API (fire-and-forget; fall back to localStorage on error)
      saveAllJobs(next).catch(() => {
        console.warn('API sync failed, persisting to localStorage')
        try { localStorage.setItem('jt_jobs', JSON.stringify(next)) } catch {}
      })
      return next
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] bg-[#0f0f0f] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">J</div>
              <span className="font-semibold text-white tracking-tight hidden sm:block">JobTracker</span>
            </div>
            <nav className="flex items-center gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === id
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:block">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {jobsLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <>
            {tab === 'dashboard' && (
              <Dashboard jobs={jobs} onNavigate={setTab} />
            )}
            {tab === 'jobs' && (
              <JobsTab
                jobs={jobs}
                setJobs={setJobs}
                resumes={resumes}
              />
            )}
            {tab === 'resumes' && (
              <ResumeTab
                resumes={resumes}
                setResumes={setResumes}
                jobs={jobs}
              />
            )}
            {tab === 'learning' && (
              <LearningTab skills={skills} setSkills={setSkills} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
