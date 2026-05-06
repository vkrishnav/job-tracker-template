export const STATUSES = [
  'Researching',
  'Applied',
  'Phone Screen',
  'Technical Screen',
  'Onsite',
  'Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
]

export const LEVELS = ['Senior', 'Lead', 'Staff', 'Principal', 'Distinguished', 'Fellow']

export const STATUS_COLORS = {
  Researching:       'bg-slate-700 text-slate-200',
  Applied:           'bg-blue-900 text-blue-200',
  'Phone Screen':    'bg-cyan-900 text-cyan-200',
  'Technical Screen':'bg-violet-900 text-violet-200',
  Onsite:            'bg-indigo-900 text-indigo-200',
  Offer:             'bg-emerald-900 text-emerald-200',
  Accepted:          'bg-green-900 text-green-200',
  Rejected:          'bg-red-900 text-red-200',
  Withdrawn:         'bg-zinc-700 text-zinc-300',
}

export const PRIORITY_LABELS = ['', '★', '★★', '★★★', '★★★★', '★★★★★']

function today() {
  return new Date().toISOString().split('T')[0]
}

function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export const SAMPLE_JOBS = [
  {
    id: '1',
    company: 'Stripe',
    role_title: 'Staff Engineer',
    level: 'Staff',
    location: 'Remote',
    remote: true,
    salary_min: 280000,
    salary_max: 340000,
    equity_notes: 'RSUs, 4yr vest',
    parental_leave_weeks: 16,
    parental_leave_notes: 'Primary + secondary caregiver',
    status: 'Researching',
    applied_date: '',
    next_action_date: daysFromNow(2),
    deadline: '',
    resume_version: 'v3-fintech',
    job_url: 'https://stripe.com/jobs',
    notes: 'Strong eng culture. Payments infra team is interesting.',
    priority: 5,
    contacts: [{ name: 'Alex Kim', title: 'Engineering Manager', linkedin: '', email: '' }],
  },
  {
    id: '2',
    company: 'Microsoft',
    role_title: 'Principal SWE',
    level: 'Principal',
    location: 'Remote',
    remote: true,
    salary_min: 240000,
    salary_max: 310000,
    equity_notes: 'RSUs + ESPP',
    parental_leave_weeks: 20,
    parental_leave_notes: 'Primary caregiver',
    status: 'Researching',
    applied_date: '',
    next_action_date: daysFromNow(5),
    deadline: '',
    resume_version: 'v2-cloud',
    job_url: 'https://careers.microsoft.com',
    notes: 'Azure Infra team. Good WLB reputation.',
    priority: 4,
    contacts: [],
  },
  {
    id: '3',
    company: 'Google',
    role_title: 'Staff SWE',
    level: 'Staff',
    location: 'Remote',
    remote: true,
    salary_min: 300000,
    salary_max: 380000,
    equity_notes: 'GSUs, 4yr vest, refresh grants',
    parental_leave_weeks: 18,
    parental_leave_notes: 'Birthing + non-birthing parent',
    status: 'Researching',
    applied_date: '',
    next_action_date: daysFromNow(-1),
    deadline: '',
    resume_version: 'v3-faang',
    job_url: 'https://careers.google.com',
    notes: 'Need to nail system design. Target Infra or Payments.',
    priority: 5,
    contacts: [],
  },
  {
    id: '4',
    company: 'Capital One',
    role_title: 'Principal Engineer',
    level: 'Principal',
    location: 'Remote',
    remote: true,
    salary_min: 200000,
    salary_max: 260000,
    equity_notes: 'RSUs',
    parental_leave_weeks: 16,
    parental_leave_notes: '',
    status: 'Researching',
    applied_date: '',
    next_action_date: daysFromNow(7),
    deadline: '',
    resume_version: 'v3-fintech',
    job_url: 'https://www.capitalonecareers.com',
    notes: 'Kafka + distributed systems focus. Good fintech experience match.',
    priority: 3,
    contacts: [],
  },
  {
    id: '5',
    company: 'Salesforce',
    role_title: 'Staff Engineer',
    level: 'Staff',
    location: 'Remote',
    remote: true,
    salary_min: 250000,
    salary_max: 320000,
    equity_notes: 'RSUs + ESPP',
    parental_leave_weeks: 26,
    parental_leave_notes: 'Industry-leading policy',
    status: 'Researching',
    applied_date: '',
    next_action_date: daysFromNow(3),
    deadline: '',
    resume_version: 'v2-cloud',
    job_url: 'https://salesforce.com/careers',
    notes: '26 week parental leave is exceptional. Platform team.',
    priority: 4,
    contacts: [],
  },
]

export const SAMPLE_RESUMES = [
  {
    id: 'r1',
    name: 'v3-fintech',
    target_role_type: 'Staff/Principal — Fintech',
    notes: 'Emphasizes Kafka, payments, compliance patterns. Used for Stripe, Capital One.',
    date_created: today(),
    filename: 'resume-vamsi-v3-fintech.pdf',
  },
  {
    id: 'r2',
    name: 'v3-faang',
    target_role_type: 'Staff/Principal — Big Tech',
    notes: 'Leads with scale + system design. Optimized for Google/Meta ATS.',
    date_created: today(),
    filename: 'resume-vamsi-v3-faang.pdf',
  },
  {
    id: 'r3',
    name: 'v2-cloud',
    target_role_type: 'Principal — Cloud/Platform',
    notes: 'Azure/GCP cloud architecture. Used for Microsoft, Salesforce.',
    date_created: today(),
    filename: 'resume-vamsi-v2-cloud.pdf',
  },
]

export const SAMPLE_SKILLS = [
  {
    id: 's1',
    category: 'FAANG',
    skills: [
      { id: 'sk1', name: 'System Design (breadth)', done: false, notes: 'Designing Data-Intensive Applications — ch 5-9' },
      { id: 'sk2', name: 'LeetCode — 50 medium/hard', done: false, notes: 'Focus: trees, graphs, DP' },
      { id: 'sk3', name: 'React deep-dive (Meta/Google FE)', done: true, notes: 'Concurrent mode, Suspense, fiber internals' },
      { id: 'sk4', name: 'Behavioral — leadership stories', done: false, notes: 'Write STAR stories for 10 scenarios' },
    ],
  },
  {
    id: 's2',
    category: 'Fintech',
    skills: [
      { id: 'sk5', name: 'Distributed systems fundamentals', done: true, notes: 'Raft consensus, 2PC, SAGA pattern' },
      { id: 'sk6', name: 'Kafka depth', done: false, notes: 'Exactly-once semantics, consumer groups, compaction' },
      { id: 'sk7', name: 'Compliance patterns (PCI DSS)', done: false, notes: 'Tokenization, audit logging, key rotation' },
      { id: 'sk8', name: 'Payment flows end-to-end', done: false, notes: 'ACH, card networks, settlement' },
    ],
  },
  {
    id: 's3',
    category: 'General / Certs',
    skills: [
      { id: 'sk9', name: 'AWS Solutions Architect cert', done: false, notes: 'Exam scheduled for next quarter' },
      { id: 'sk10', name: 'Docker + Kubernetes depth', done: true, notes: 'Helm, operators, resource limits' },
      { id: 'sk11', name: 'Observability (OTel, Grafana)', done: false, notes: 'Spans, metrics, structured logging' },
      { id: 'sk12', name: 'Staff+ eng leadership reading', done: false, notes: 'Staff Engineer book + Tanya Reilly articles' },
    ],
  },
]
