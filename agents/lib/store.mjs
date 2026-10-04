// Data layer for ~/Documents/job-data.json.
// Every agent and the Express server go through this module so the file
// schema stays consistent and writes are atomic.
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { DEFAULT_APPLICATION_PROFILE, DEFAULT_SCREENING_ANSWERS } from './apply.mjs'

export const DATA_FILE =
  process.env.JOB_DATA_PATH || path.join(os.homedir(), 'Documents', 'job-data.json')

export const SCHEMA_VERSION = 2

export const DEFAULT_CONFIG = {
  // Contact details from Vamsi_Resume.pdf — used in signatures, templates, and the digest
  candidate: {
    name: 'Vamsi Veerapaneni',
    email: 'vamsi.k.veerapaneni@gmail.com',
    phone: '(210) 816-3869',
    title: 'Principal Full Stack Engineer',
    linkedin: 'https://linkedin.com/in/vamsi-krishna-78bb37127',
    github: 'https://github.com/vkrishnav',
    location: 'Dallas, TX (open to remote)',
    resume_path: '/Users/vamsiv/Downloads/Vamsi_Resume.pdf',
  },
  // Title filters (case-insensitive substring match)
  title_include: ['staff', 'principal', 'senior staff', 'lead', 'distinguished', 'architect', 'founding engineer'],
  title_exclude: ['manager', 'director', 'recruit', 'sales', 'account exec', 'intern', 'designer', 'marketing',
    'product manager', 'support', 'solutions', 'customer', 'analyst', 'counsel', 'finance', 'people', 'hr ', 'vp ', 'head of'],
  // Location policy: onsite/hybrid is acceptable ONLY in the Dallas metro; everywhere else must be remote.
  location_mode: 'dallas_or_remote',
  onsite_locations_ok: ['dallas', 'dfw', 'plano', 'irving', 'frisco', 'richardson', 'fort worth', 'addison', 'las colinas', 'grapevine', 'texas (dallas)'],
  // Locations that count as US-remote-friendly when a posting says "Remote - US" etc.
  locations_ok: ['remote', 'united states', 'usa', 'us ', 'anywhere', 'north america'],
  exclude_non_matching_location: true,
  // "Remote" postings restricted to a non-US region are not usable; matched against title + location
  remote_exclude_regions: ['emea', 'apac', 'europe', 'india', 'canada', 'uk', 'united kingdom', 'latam', 'brazil', 'germany', 'poland', 'ireland', 'australia', 'singapore', 'japan', 'mexico', 'argentina', 'spain', 'france', 'netherlands', 'israel'],
  min_salary: 200000,
  max_age_days: 14,
  // Keywords derived from the BigTech resume; used for fit scoring of descriptions
  // Derived from Vamsi_Resume.pdf (Downloads). Used for fit scoring of descriptions.
  resume_keywords: ['angular', 'typescript', 'javascript', 'rxjs', 'graphql', 'scss', 'micro-frontend', 'lighthouse',
    'java', 'spring boot', 'spring', 'j2ee', '.net', 'asp.net', 'c#', 'python', 'rest', 'soap', 'api', 'microservice',
    'agentic', 'agent', 'strands', 'bedrock', 'llm', 'generative ai', 'foundation model',
    'aws', 'eks', 's3', 'ec2', 'cloudwatch', 'azure', 'docker', 'kubernetes', 'rancher', 'kiali', 'istio', 'service mesh',
    'codepipeline', 'codebuild', 'codedeploy', 'ci/cd', 'jenkins', 'azure devops', 'gradle', 'maven', 'bitbucket', 'git',
    'junit', 'mockito', 'jest', 'cypress', 'postman', 'rest assured', 'swagger', 'test automation', 'tdd',
    'sql server', 't-sql', 'mongodb', 'db2', 'pl/sql', 'sql', 'kafka', 'websocket', 'event-driven', 'json', 'xml',
    'datadog', 'splunk', 'observability', 'monitoring', 'jira', 'agile', 'scrum',
    'distributed', 'platform', 'enterprise', 'full stack', 'full-stack', 'migration', 'legacy', 'modernization',
    'financial', 'fintech', 'mortgage', 'energy', 'scale', 'uptime', 'mentor', 'architecture', 'technical lead', 'lead'],
  // Public job boards polled by the fetch agent (no auth, no cost)
  watchlist: [
    { company: 'Anthropic', board: 'greenhouse', slug: 'anthropic' },
    { company: 'Stripe', board: 'greenhouse', slug: 'stripe' },
    { company: 'Coinbase', board: 'greenhouse', slug: 'coinbase' },
    { company: 'Robinhood', board: 'greenhouse', slug: 'robinhood' },
    { company: 'Databricks', board: 'greenhouse', slug: 'databricks' },
    { company: 'Datadog', board: 'greenhouse', slug: 'datadog' },
    { company: 'MongoDB', board: 'greenhouse', slug: 'mongodb' },
    { company: 'Cloudflare', board: 'greenhouse', slug: 'cloudflare' },
    { company: 'Vercel', board: 'greenhouse', slug: 'vercel' },
    { company: 'Scale AI', board: 'greenhouse', slug: 'scaleai' },
    { company: 'xAI', board: 'greenhouse', slug: 'xai' },
    { company: 'Airbnb', board: 'greenhouse', slug: 'airbnb' },
    { company: 'Reddit', board: 'greenhouse', slug: 'reddit' },
    { company: 'Discord', board: 'greenhouse', slug: 'discord' },
    { company: 'Affirm', board: 'greenhouse', slug: 'affirm' },
    { company: 'Brex', board: 'greenhouse', slug: 'brex' },
    { company: 'Chime', board: 'greenhouse', slug: 'chime' },
    { company: 'GitLab', board: 'greenhouse', slug: 'gitlab' },
    { company: 'Elastic', board: 'greenhouse', slug: 'elastic' },
    { company: 'Figma', board: 'greenhouse', slug: 'figma' },
    { company: 'OpenAI', board: 'ashby', slug: 'openai' },
    { company: 'Cursor', board: 'ashby', slug: 'cursor' },
    { company: 'Perplexity', board: 'ashby', slug: 'perplexity' },
    { company: 'Cohere', board: 'ashby', slug: 'cohere' },
    { company: 'Sierra', board: 'ashby', slug: 'sierra' },
    { company: 'Harvey', board: 'ashby', slug: 'harvey' },
    { company: 'Replit', board: 'ashby', slug: 'replit' },
    { company: 'Modal', board: 'ashby', slug: 'modal' },
    { company: 'Supabase', board: 'ashby', slug: 'supabase' },
    { company: 'Ramp', board: 'ashby', slug: 'ramp' },
    { company: 'Notion', board: 'ashby', slug: 'notion' },
    { company: 'Linear', board: 'ashby', slug: 'linear' },
    { company: 'Palantir', board: 'lever', slug: 'palantir' },
  ],
  // Preference: best perks (401k match, equity, leave) and growth in tech. Perks are detected from posting
  // text; these companies get a growth bonus in scoring. Edit in Agents → Config.
  growth_companies: ['Anthropic', 'OpenAI', 'Harvey', 'Cursor', 'Perplexity', 'Sierra', 'Cohere', 'Databricks', 'Scale AI', 'xAI',
    'Replit', 'Modal', 'Supabase', 'Ramp', 'Vercel', 'Notion', 'Linear', 'Coinbase', 'Stripe', 'Affirm', 'Datadog', 'Cloudflare',
    'Figma', 'Snowflake', 'Nvidia', 'Palantir', 'Robinhood', 'Brex', 'Chime', 'Airbnb'],
  // Browser-apply profile + screening answer bank (edit in Agents → Config). Blank legal/salary fields make the skill ask first.
  application_profile: DEFAULT_APPLICATION_PROFILE,
  screening_answers: DEFAULT_SCREENING_ANSWERS,
  // Scheduler (used by server.js in-process scheduler)
  fetch_interval_min: 180,
  scan_interval_min: 360,
  followup_after_days: 7,
  stale_after_days: 14,
  discovered_expire_days: 10,
  email: {
    // All communication uses the resume email. Digests go here; outgoing mail sets Reply-To here
    // (Gmail SMTP authenticates as the app-password account, so From may differ).
    to: 'vamsi.k.veerapaneni@gmail.com',
    reply_to: 'vamsi.k.veerapaneni@gmail.com',
    auto_send_digest: false,
    signature: 'Vamsi Veerapaneni\nvamsi.k.veerapaneni@gmail.com · (210) 816-3869\nlinkedin.com/in/vamsi-krishna-78bb37127 · github.com/vkrishnav',
  },
}

export const AGENTS = ['fetch', 'scan', 'email-sync', 'digest']

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
}

export function nowIso() {
  return new Date().toISOString()
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

function deepMergeConfig(base, over) {
  const out = { ...base }
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMergeConfig(base[k], over[k])
    } else {
      out[k] = over[k]
    }
  }
  return out
}

/** Ensure every top-level collection exists; migrate v1 (jobs only) files in place. */
export function ensureSchema(data) {
  data = data && typeof data === 'object' ? data : {}
  data.jobs = Array.isArray(data.jobs) ? data.jobs : []
  data.discovered = Array.isArray(data.discovered) ? data.discovered : []
  data.journal = Array.isArray(data.journal) ? data.journal : []
  data.runs = Array.isArray(data.runs) ? data.runs : []
  data.email_signals = Array.isArray(data.email_signals) ? data.email_signals : []
  data.outbox = Array.isArray(data.outbox) ? data.outbox : []
  data.improvements = Array.isArray(data.improvements) ? data.improvements : []
  data.config = deepMergeConfig(DEFAULT_CONFIG, data.config || {})
  data.meta = { ...(data.meta || {}), schema_version: SCHEMA_VERSION }
  return data
}

export function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = ensureSchema({})
    fresh.meta.created_at = nowIso()
    save(fresh)
    return fresh
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch (e) {
    throw new Error(`job-data.json is not valid JSON: ${e.message}`, { cause: e })
  }
  return ensureSchema(raw)
}

/** Atomic write: write to a temp file then rename over the original. Keeps a rolling backup. */
export function save(data) {
  data.meta = { ...(data.meta || {}), schema_version: SCHEMA_VERSION, updated_at: nowIso() }
  // Trim unbounded collections
  if (data.runs.length > 300) data.runs = data.runs.slice(-300)
  if (data.journal.length > 5000) data.journal = data.journal.slice(-5000)
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  try {
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak')
  } catch { /* backup is best-effort */ }
  fs.renameSync(tmp, DATA_FILE)
  return data
}

/** load → fn(data) → save. fn may return a value which is passed through. */
export function mutate(fn) {
  const data = load()
  const result = fn(data)
  save(data)
  return result
}

// ── Journal ──────────────────────────────────────────────────────────────────
// entry: { type, title, body, job_id, company, source, meta }
// types: note | status_change | email | agent | followup | improvement | discovered | outbox
export function addJournal(data, entry) {
  const e = {
    id: uid('j_'),
    ts: nowIso(),
    type: entry.type || 'note',
    title: entry.title || '',
    body: entry.body || '',
    job_id: entry.job_id ?? null,
    company: entry.company ?? (entry.job_id ? data.jobs.find(j => j.id === entry.job_id)?.company ?? null : null),
    source: entry.source || 'user',
    meta: entry.meta || {},
  }
  data.journal.push(e)
  return e
}

// ── Runs ─────────────────────────────────────────────────────────────────────
export function startRun(data, agent, trigger = 'manual') {
  const r = { id: uid('r_'), agent, trigger, started_at: nowIso(), finished_at: null, status: 'running', summary: '', stats: {}, error: null }
  data.runs.push(r)
  return r
}

export function finishRun(data, runId, { status = 'ok', summary = '', stats = {}, error = null } = {}) {
  const r = data.runs.find(x => x.id === runId)
  if (!r) return null
  r.finished_at = nowIso()
  r.status = status
  r.summary = summary
  r.stats = stats
  r.error = error
  return r
}

export function lastRun(data, agent) {
  for (let i = data.runs.length - 1; i >= 0; i--) if (data.runs[i].agent === agent) return data.runs[i]
  return null
}

/** Keep the start (role/requirements) and the end (benefits/perks) of a long posting. */
export function excerpt(text = '', head = 6000, tail = 3000) {
  if (text.length <= head + tail + 20) return text
  return text.slice(0, head) + '\n…\n' + text.slice(-tail)
}

export function daysBetween(a, b = new Date()) {
  if (!a) return null
  const d1 = new Date(a), d2 = new Date(b)
  if (isNaN(d1)) return null
  return Math.floor((d2 - d1) / 86400000)
}
