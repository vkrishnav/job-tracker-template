import { useMemo } from 'react'
import { TrendingUp, Briefcase, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight, DollarSign, Baby } from 'lucide-react'
import { STATUS_COLORS } from '../data/sampleData'

const ACTIVE_STATUSES = ['Applied', 'Phone Screen', 'Technical Screen', 'Onsite']

function fmt(n) {
  if (!n) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}

function isFollowUpDue(job) {
  if (!job.next_action_date) return false
  const today = new Date().toISOString().split('T')[0]
  return job.next_action_date <= today
}

export default function Dashboard({ jobs, onNavigate }) {
  const stats = useMemo(() => {
    const total = jobs.length
    const inProgress = jobs.filter(j => ACTIVE_STATUSES.includes(j.status)).length
    const offers = jobs.filter(j => j.status === 'Offer' || j.status === 'Accepted').length
    const rejected = jobs.filter(j => j.status === 'Rejected').length

    const withSalary = jobs.filter(j => j.salary_min && j.salary_max)
    const avgComp = withSalary.length
      ? Math.round(withSalary.reduce((sum, j) => sum + (j.salary_min + j.salary_max) / 2, 0) / withSalary.length)
      : 0

    const followUps = jobs.filter(isFollowUpDue).sort((a, b) => a.next_action_date.localeCompare(b.next_action_date))

    const avgParental = jobs.filter(j => j.parental_leave_weeks).length
      ? Math.round(jobs.filter(j => j.parental_leave_weeks).reduce((s, j) => s + j.parental_leave_weeks, 0) / jobs.filter(j => j.parental_leave_weeks).length)
      : 0

    return { total, inProgress, offers, rejected, avgComp, followUps, avgParental }
  }, [jobs])

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      {/* Follow-up alert */}
      {stats.followUps.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-amber-400" />
            <span className="text-amber-300 font-semibold text-sm">
              {stats.followUps.length} job{stats.followUps.length > 1 ? 's' : ''} need{stats.followUps.length === 1 ? 's' : ''} follow-up
            </span>
          </div>
          <div className="space-y-2">
            {stats.followUps.map(job => (
              <div key={job.id} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-3 py-2">
                <div>
                  <span className="text-white font-medium text-sm">{job.company}</span>
                  <span className="text-gray-400 text-sm"> — {job.role_title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                  <span className={`text-xs font-mono ${job.next_action_date < today ? 'text-red-400' : 'text-amber-400'}`}>
                    {job.next_action_date === today ? 'Today' : job.next_action_date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Briefcase size={18} className="text-indigo-400" />}
          label="Total Applied"
          value={stats.total}
          sub="tracked roles"
          color="indigo"
        />
        <StatCard
          icon={<Clock size={18} className="text-violet-400" />}
          label="In Progress"
          value={stats.inProgress}
          sub="active pipelines"
          color="violet"
        />
        <StatCard
          icon={<CheckCircle size={18} className="text-emerald-400" />}
          label="Offers"
          value={stats.offers}
          sub="received"
          color="emerald"
        />
        <StatCard
          icon={<XCircle size={18} className="text-red-400" />}
          label="Rejected"
          value={stats.rejected}
          sub="closed out"
          color="red"
        />
      </div>

      {/* Comp + parental leave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={16} className="text-indigo-400" />
            <span className="text-gray-400 text-sm">Avg Target Comp</span>
          </div>
          <p className="text-3xl font-bold text-white">{fmt(stats.avgComp)}</p>
          <p className="text-gray-500 text-xs mt-1">midpoint across {jobs.filter(j => j.salary_min).length} tracked roles</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Baby size={16} className="text-violet-400" />
            <span className="text-gray-400 text-sm">Avg Parental Leave</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.avgParental > 0 ? `${stats.avgParental} wk` : '—'}</p>
          <p className="text-gray-500 text-xs mt-1">across tracked companies</p>
        </div>
      </div>

      {/* Pipeline breakdown */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Pipeline Breakdown</h2>
          <button
            onClick={() => onNavigate('jobs')}
            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
        <PipelineBar jobs={jobs} />
      </div>

      {/* Top priority jobs */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Top Priority Roles</h2>
          <TrendingUp size={16} className="text-indigo-400" />
        </div>
        <div className="space-y-2">
          {[...jobs]
            .filter(j => j.priority >= 4 && j.status !== 'Rejected' && j.status !== 'Withdrawn')
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 5)
            .map(job => (
              <TopJobRow key={job.id} job={job} />
            ))}
          {jobs.filter(j => j.priority >= 4).length === 0 && (
            <p className="text-gray-500 text-sm">No high-priority jobs yet. Star your favorites in the Jobs tab.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  const borders = {
    indigo: 'border-indigo-900/50',
    violet: 'border-violet-900/50',
    emerald: 'border-emerald-900/50',
    red: 'border-red-900/50',
  }
  return (
    <div className={`bg-[#1a1a1a] border ${borders[color]} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-gray-400 text-sm">{label}</span></div>
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-gray-500 text-xs mt-1">{sub}</p>
    </div>
  )
}

function PipelineBar({ jobs }) {
  const stages = [
    { label: 'Researching', color: 'bg-slate-600' },
    { label: 'Applied',     color: 'bg-blue-600' },
    { label: 'Phone Screen', color: 'bg-cyan-600' },
    { label: 'Technical Screen', color: 'bg-violet-600' },
    { label: 'Onsite',     color: 'bg-indigo-600' },
    { label: 'Offer',       color: 'bg-emerald-600' },
    { label: 'Accepted',    color: 'bg-green-600' },
    { label: 'Rejected',    color: 'bg-red-700' },
    { label: 'Withdrawn',   color: 'bg-zinc-600' },
  ]
  return (
    <div className="space-y-2">
      {stages.map(({ label, color }) => {
        const count = jobs.filter(j => j.status === label).length
        if (count === 0) return null
        const pct = Math.max(4, (count / jobs.length) * 100)
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="text-gray-400 text-xs w-36 shrink-0">{label}</span>
            <div className="flex-1 bg-[#2a2a2a] rounded-full h-2">
              <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-gray-300 text-xs w-4 text-right">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

function TopJobRow({ job }) {
  const stars = '★'.repeat(job.priority) + '☆'.repeat(5 - job.priority)
  return (
    <div className="flex items-center justify-between bg-[#0f0f0f] rounded-lg px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="text-white font-medium text-sm">{job.company}</span>
        <span className="text-gray-400 text-sm"> — {job.role_title}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status]}`}>{job.status}</span>
        <span className="text-yellow-500 text-xs tracking-tighter">{stars}</span>
        <span className="text-gray-500 text-xs hidden sm:block">
          {job.salary_max ? `$${(job.salary_max / 1000).toFixed(0)}k` : '—'}
        </span>
      </div>
    </div>
  )
}
