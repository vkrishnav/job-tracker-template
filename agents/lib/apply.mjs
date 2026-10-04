// Browser-apply support: builds an "application packet" for the /apply skill and records outcomes.
// The packet is everything a browser-driving agent needs: candidate profile, screening answers,
// resume path, job details, ATS type, and tailored talking points. Submission itself is always
// left to the human (the skill stops before the Submit button).
import fs from 'fs'
import { addJournal, nowIso, today } from './store.mjs'

export const DEFAULT_APPLICATION_PROFILE = {
  first_name: 'Vamsi',
  last_name: 'Veerapaneni',
  full_name: 'Vamsi Veerapaneni',
  email: 'vamsi.k.veerapaneni@gmail.com',
  phone: '(210) 816-3869',
  phone_country: '+1',
  city: 'Dallas',
  state: 'Texas',
  country: 'United States',
  location: 'Dallas, TX, United States',
  linkedin: 'https://linkedin.com/in/vamsi-krishna-78bb37127',
  github: 'https://github.com/vkrishnav',
  website: '',
  resume_path: '/Users/vamsiv/Downloads/Vamsi_Resume.pdf',
  cover_letter_path: '',
  current_company: 'Freddie Mac',
  current_title: 'Principal Software Engineer / Lead Engineer (Full Stack)',
  years_experience: '8+',
  education: 'M.S. Computer Engineering, University of Texas at San Antonio',
  // Fill these in Agents → Config → Application profile. The skill will ASK before guessing.
  work_authorization: '',      // e.g. "Authorized to work in the US"
  requires_sponsorship: '',    // "Yes" / "No"
  salary_expectation: '',      // e.g. "$260,000 base" — leave blank to write "Open / market rate"
  earliest_start: '2 weeks notice',
  how_heard: 'Company careers page',
  remote_preference: 'Remote (or onsite in the Dallas metro)',
  willing_to_relocate: 'No (Dallas metro only); open to remote',
  // Voluntary self-identification: default to declining. Change only if you want to answer.
  gender: 'Male',
  race_ethnicity: 'Asian',
  veteran_status: 'No, not a veteran',
  disability_status: 'No, I do not have a disability',
  pronouns: '',
  ethnicity: 'Asian (India)',
  hispanic_latino: 'No',
}

// Screening-question bank. `match` is a case-insensitive regex tested against the question text.
export const DEFAULT_SCREENING_ANSWERS = [
  { match: 'legally authori[sz]ed|authori[sz]ed to work|eligible to work', answer: '{{work_authorization}}' },
  { match: 'sponsorship|visa', answer: '{{requires_sponsorship}}' },
  { match: 'salary|compensation expectation|desired pay', answer: '{{salary_expectation}}' },
  { match: 'start date|when (can|could) you start|notice period', answer: '{{earliest_start}}' },
  { match: 'how did you hear|referr', answer: '{{how_heard}}' },
  { match: 'relocat', answer: '{{willing_to_relocate}}' },
  { match: 'remote|hybrid|on-?site|in[- ]office', answer: '{{remote_preference}}' },
  { match: 'years? of (professional |relevant )?experience', answer: '{{years_experience}}' },
  { match: 'linkedin', answer: '{{linkedin}}' },
  { match: 'github|portfolio|website', answer: '{{github}}' },
  { match: 'current (employer|company)', answer: '{{current_company}}' },
  { match: 'current (title|role)', answer: '{{current_title}}' },
  { match: 'gender', answer: '{{gender}}' },
  { match: 'race|ethnicity', answer: '{{race_ethnicity}}' },
  { match: 'veteran', answer: '{{veteran_status}}' },
  { match: 'disabilit', answer: '{{disability_status}}' },
  { match: '18 years|age of majority', answer: 'Yes' },
  { match: 'previously (worked|employed)|former employee', answer: 'No' },
  { match: 'non-?compete|restrictive covenant', answer: 'No' },
  { match: 'why (are you interested|do you want)|why .* (company|role)', answer: '{{why_interested}}' },
]

export function detectAts(url = '') {
  const u = url.toLowerCase()
  if (/greenhouse\.io|gh_jid=/.test(u)) return 'greenhouse'
  if (/lever\.co/.test(u)) return 'lever'
  if (/ashbyhq\.com/.test(u)) return 'ashby'
  if (/myworkday|workday/.test(u)) return 'workday'
  if (/icims\.com/.test(u)) return 'icims'
  if (/smartrecruiters/.test(u)) return 'smartrecruiters'
  if (/linkedin\.com\/jobs/.test(u)) return 'linkedin'
  if (/indeed\.com/.test(u)) return 'indeed'
  if (/jobvite|bamboohr|taleo|successfactors|eightfold|rippling/.test(u)) return 'other-ats'
  return 'unknown'
}

function fill(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''))
}

export function buildPacket(data, jobId) {
  const job = data.jobs.find(j => j.id === jobId)
  if (!job) throw new Error('job not found')
  const cfg = data.config
  const profile = { ...DEFAULT_APPLICATION_PROFILE, ...(cfg.application_profile || {}) }
  const disc = data.discovered.find(d => d.job_id === job.id || d.id === job.discovered_id)
  const matched = disc?.keywords_matched || []
  const why = `I'm drawn to ${job.company} because the ${job.role_title} role sits where my experience is deepest: leading an 8-engineer team on an Angular + Java 17/Spring Boot platform processing $50B+ in mortgage data, migrating legacy .NET systems to microservices on AWS EKS, and building autonomous agentic workflows on Strands and AWS Bedrock.` + (matched.length ? ` The posting's emphasis on ${matched.slice(0, 4).join(', ')} matches work I do every day.` : '')
  const vars = { ...profile, why_interested: why, company: job.company, role_title: job.role_title }
  const answers = (cfg.screening_answers || DEFAULT_SCREENING_ANSWERS).map(a => ({ match: a.match, answer: fill(a.answer, vars) }))
  const missing = ['work_authorization', 'requires_sponsorship', 'salary_expectation'].filter(k => !profile[k])
  return {
    generated_at: nowIso(),
    job: { id: job.id, company: job.company, role_title: job.role_title, url: job.job_url, location: job.location, remote: job.remote, status: job.status, notes: job.notes },
    ats: detectAts(job.job_url),
    profile: vars,
    resume: { path: profile.resume_path, exists: !!profile.resume_path && fs.existsSync(profile.resume_path) },
    cover_letter: { path: profile.cover_letter_path || null, exists: !!profile.cover_letter_path && fs.existsSync(profile.cover_letter_path) },
    screening_answers: answers,
    missing_profile_fields: missing,
    talking_points: [
      'Technical lead for 8 engineers; Angular + Java 17/Spring Boot platform, 2,000+ users, $50B+ mortgage pipeline data',
      'Migrated 5 legacy VB.NET/.NET apps to Spring Boot microservices + Angular SPAs: −35% infra cost, −60% page load',
      'Autonomous agentic workflows on Strands + AWS Bedrock (document verification, anomaly detection)',
      '12 microservices on AWS EKS, 99.9% uptime; CI/CD with AWS CodePipeline/CodeBuild/CodeDeploy: 4h → 20min deploys',
      'Cypress E2E + JUnit/Mockito at 85% coverage, −50% production defects',
    ],
    keywords_matched: matched,
    keywords_missing: disc?.keywords_missing || job.keyword_gaps || [],
    rules: [
      'Never click Submit / Send application — stop and hand off to the human.',
      'Never create accounts or type passwords; if the ATS requires login (Workday etc.), ask the human to sign in first.',
      'Never solve CAPTCHAs.',
      'If a required answer is not in the packet, ask the human; do not invent legal, salary, or demographic answers.',
      'Do not upload any file other than the resume/cover letter paths in this packet.',
    ],
  }
}

export function queueApply(data, { job_id, discovered_id }) {
  let job = job_id ? data.jobs.find(j => j.id === job_id) : null
  if (!job && discovered_id) {
    const x = data.discovered.find(d => d.id === discovered_id)
    if (!x) throw new Error('discovered role not found')
    if (x.job_id) job = data.jobs.find(j => j.id === x.job_id)
    if (!job) {
      job = { id: Date.now().toString(), company: x.company, role_title: x.role_title, level: x.level || '', location: x.location, remote: !!x.remote, salary_min: x.salary_min ?? null, salary_max: x.salary_max ?? null, equity_notes: '', retirement_match: (x.perks || []).includes('401k match') ? '401k match (per posting)' : '', growth_notes: (x.growth || []).join('; '), perks: x.perks || [], parental_leave_weeks: null, parental_leave_notes: '', status: 'Researching', applied_date: '', next_action_date: today(), deadline: '', resume_version: null, job_url: x.url, notes: `[feed ${today()}] ${x.grade}${x.score} · ${x.score_reasons.join('; ')}`, priority: x.grade === 'A' ? 5 : 4, contacts: [], ats_score: null, keyword_gaps: x.keywords_missing || [], interview_prep_done: false, prep_questions_count: 0, fit_score: Math.round(x.score / 10), source: x.source, discovered_id: x.id }
      data.jobs.push(job)
      x.status = 'tracked'; x.job_id = job.id
    }
  }
  if (!job) throw new Error('job not found')
  job.apply_status = 'queued'
  job.apply_queued_at = nowIso()
  addJournal(data, { type: 'note', title: `Queued for browser apply: ${job.company} — ${job.role_title}`, body: `Run /apply ${job.id} in Claude Code`, job_id: job.id, company: job.company, source: 'user' })
  return job
}

export function recordApplyResult(data, jobId, { status, notes = '' }) {
  const job = data.jobs.find(j => j.id === jobId)
  if (!job) throw new Error('job not found')
  const allowed = ['in_progress', 'ready_to_submit', 'submitted', 'blocked', 'failed', 'cancelled']
  if (!allowed.includes(status)) throw new Error(`status must be one of ${allowed.join(', ')}`)
  const before = job.status
  job.apply_status = status
  job.apply_updated_at = nowIso()
  if (notes) job.apply_notes = notes
  if (status === 'submitted') {
    job.status = 'Applied'
    job.applied_date = job.applied_date || today()
    const t = new Date(); t.setDate(t.getDate() + (data.config.followup_after_days || 7))
    job.next_action_date = t.toISOString().slice(0, 10)
    if (before !== 'Applied') addJournal(data, { type: 'status_change', title: `${job.company}: ${before || '—'} → Applied`, body: `Submitted via browser apply. ${notes}`.trim(), job_id: job.id, company: job.company, source: 'agent:apply' })
  } else {
    addJournal(data, { type: 'note', title: `Apply ${status.replace('_', ' ')}: ${job.company} — ${job.role_title}`, body: notes, job_id: job.id, company: job.company, source: 'agent:apply' })
  }
  return job
}
