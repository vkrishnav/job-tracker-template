// Email signal classification, feedback application, templates, and SMTP send.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { addJournal, uid, nowIso, today } from './store.mjs'

// ── Classification ───────────────────────────────────────────────────────────
const RULES = [
  ['offer',      /\boffer letter\b|\bpleased to offer\b|\bextend(ing)? an offer\b|\bcompensation package\b/i],
  ['rejection',  /not (be )?moving forward|decided (to )?not to move forward|not to move forward with|decided to (move|proceed) (forward )?with other|unfortunately|not selected|no longer (be )?consider|other candidates|will not be proceeding|pursue other candidates|position has been filled|not a (good |strong )?(fit|match) at this time/i],
  ['interview',  /\binterview\b|schedule (a|some) time|phone screen|hiring manager (call|chat)|onsite|on-site|panel|technical (screen|discussion)|coding (session|round)|next round|meet (with )?the team|availability/i],
  ['assessment', /assessment|take-home|take home|coding challenge|hackerrank|codesignal|online assessment|\bOA\b|technical test/i],
  ['recruiter',  /recruiter|talent (acquisition|partner)|sourc(er|ing)|reaching out|came across your (profile|background)|opportunity at|would love to (chat|connect)/i],
  ['ack',        /thank you for (applying|your application)|application (received|submitted|has been received)|we('ve| have) received your application|confirmation|successfully submitted/i],
]

export function classifySignal({ subject = '', snippet = '', from = '' }) {
  const text = `${subject}\n${snippet}`
  for (const [cls, re] of RULES) if (re.test(text)) return cls
  if (/no-?reply@|notifications@/i.test(from) && /application/i.test(text)) return 'ack'
  return 'other'
}

const GENERIC_DOMAINS = /greenhouse|lever\.co|ashbyhq|myworkday|workday|icims|smartrecruiters|jobvite|bamboohr|gmail|outlook|linkedin|indeed|hire\.|talent\.|recruit|no-?reply/i

function norm(s = '') { return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() }

/** Find the tracked job this email most likely belongs to. */
export function matchJob(signal, jobs) {
  const text = norm(`${signal.subject} ${signal.snippet} ${signal.from}`)
  const domain = (signal.from.match(/@([a-z0-9.-]+)/i)?.[1] || '').toLowerCase()
  const candidates = []
  for (const j of jobs) {
    const comp = norm(j.company)
    if (!comp) continue
    const compRoot = comp.split(' ')[0]
    let s = 0
    if (text.includes(comp)) s += 5
    else if (compRoot.length >= 4 && text.includes(compRoot)) s += 3
    if (domain && !GENERIC_DOMAINS.test(domain) && domain.includes(compRoot.replace(/\s/g, ''))) s += 6
    if (j.role_title && text.includes(norm(j.role_title))) s += 4
    // greenhouse job id present in subject/snippet/url
    const gid = (j.job_url || '').match(/jobs\/(\d{6,})/)?.[1]
    if (gid && text.includes(gid)) s += 8
    if (s > 0) candidates.push({ job: j, s })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.s - a.s || (b.job.applied_date || '').localeCompare(a.job.applied_date || ''))
  // Prefer an active application over a closed one at equal score
  const top = candidates[0]
  const active = candidates.filter(c => c.s === top.s && !['Rejected', 'Closed', 'Withdrawn', 'Accepted'].includes(c.job.status))
  return (active[0] || top).job
}

/** Add a raw email into email_signals (deduped by thread_id / message_id). Returns the stored signal or null if duplicate. */
export function ingestSignal(data, raw) {
  const key = raw.thread_id || raw.message_id || `${raw.from}|${raw.subject}|${raw.date}`
  if (data.email_signals.some(s => s.key === key)) return null
  const classification = raw.classification || classifySignal(raw)
  const job = raw.job_id ? data.jobs.find(j => j.id === raw.job_id) : matchJob(raw, data.jobs)
  const sig = {
    id: uid('e_'),
    key,
    ts: nowIso(),
    date: raw.date || nowIso(),
    from: raw.from || '',
    subject: raw.subject || '',
    snippet: (raw.snippet || '').slice(0, 600),
    thread_id: raw.thread_id || null,
    classification,
    job_id: job?.id ?? null,
    company: job?.company ?? raw.company ?? null,
    applied: false,
    dismissed: false,
  }
  data.email_signals.push(sig)
  addJournal(data, {
    type: 'email',
    title: `${classification.toUpperCase()} · ${sig.subject || '(no subject)'}`,
    body: sig.snippet,
    job_id: sig.job_id,
    company: sig.company,
    source: 'agent:email-sync',
    meta: { signal_id: sig.id, from: sig.from },
  })
  return sig
}

const STATUS_FOR = {
  rejection: () => 'Rejected',
  offer: () => 'Offer',
  assessment: () => 'Technical Screen',
  interview: cur => (['Applied', 'Researching', ''].includes(cur || '') ? 'Phone Screen' : cur),
}

/** Apply a signal's feedback to its linked job: status + next action + journal. */
export function applySignal(data, signalId, overrides = {}) {
  const sig = data.email_signals.find(s => s.id === signalId)
  if (!sig) throw new Error('signal not found')
  const jobId = overrides.job_id || sig.job_id
  const job = data.jobs.find(j => j.id === jobId)
  if (!job) throw new Error('signal has no linked job; set job_id first')
  const cls = overrides.classification || sig.classification
  const before = job.status
  const next = STATUS_FOR[cls]?.(before)
  if (next && next !== before) {
    job.status = next
    addJournal(data, { type: 'status_change', title: `${job.company}: ${before || '—'} → ${next}`, body: `From email: ${sig.subject}`, job_id: job.id, source: 'email' })
  }
  if (cls === 'interview' || cls === 'assessment') {
    const d = new Date(); d.setDate(d.getDate() + 2)
    job.next_action_date = d.toISOString().slice(0, 10)
  }
  if (cls === 'rejection') job.next_action_date = ''
  job.notes = `${job.notes || ''}\n[${today()} email:${cls}] ${sig.subject}`.trim()
  sig.applied = true
  sig.applied_at = nowIso()
  sig.job_id = job.id
  sig.company = job.company
  return { job, signal: sig }
}

// ── Templates ────────────────────────────────────────────────────────────────
export function emailTemplates(job, config) {
  const c = config.candidate || {}
  const name = c.name || 'Vamsi'
  const first = name.split(' ')[0]
  const sig = config.email?.signature || [name, [c.email, c.phone].filter(Boolean).join(' · '), [c.linkedin, c.github].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
  const role = job?.role_title || 'the role'
  const co = job?.company || 'your team'
  const applied = job?.applied_date ? ` on ${job.applied_date}` : ''
  return {
    followup: {
      subject: `Following up — ${role} application`,
      body: `Hi there,\n\nI applied for the ${role} position at ${co}${applied} and wanted to follow up. I'm very interested in the role. As ${c.title || 'a Principal Full Stack Engineer'} at Freddie Mac I lead an 8-engineer team on an Angular + Java 17/Spring Boot platform serving 2,000+ users and $50B+ in mortgage pipeline data, migrated 5 legacy .NET systems to microservices on AWS EKS, and built autonomous agentic workflows on Strands and AWS Bedrock, which maps closely to what the team is building.\n\nI'd welcome the chance to talk. Happy to share anything else that would be useful.\n\nBest,\n${sig}`,
    },
    thankyou: {
      subject: `Thank you — ${role} conversation`,
      body: `Hi,\n\nThank you for taking the time to speak with me about the ${role} role at ${co}. I enjoyed learning about the team's priorities, and the conversation reinforced my interest.\n\nIf there's anything further I can provide, please let me know. Looking forward to next steps.\n\nBest,\n${sig}`,
    },
    inquiry: {
      subject: `Status check — ${role} at ${co}`,
      body: `Hi,\n\nI hope you're doing well. I wanted to check on the status of my application for the ${role} position${applied}. I remain very interested and would appreciate any update on timing.\n\nThanks,\n${sig}`,
    },
    withdraw: {
      subject: `Withdrawing application — ${role}`,
      body: `Hi,\n\nI'd like to withdraw my application for the ${role} position at ${co}. Thank you for your consideration, and I hope our paths cross again.\n\nBest,\n${sig}`,
    },
    _first: first,
  }
}

// ── SMTP send (nodemailer, Gmail app password) ──────────────────────────────
function loadGmailCreds() {
  let user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD, from = process.env.DEFAULT_FROM_NAME
  if (!user || !pass) {
    // Reuse the credentials already configured for the gmail-mcp server
    const envPath = process.env.GMAIL_ENV_FILE || path.join(os.homedir(), 'Documents', 'GIT', 'gmail-mcp', '.env')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (!m) continue
        if (m[1] === 'GMAIL_USER' && !user) user = m[2].trim()
        if (m[1] === 'GMAIL_APP_PASSWORD' && !pass) pass = m[2].trim()
        if (m[1] === 'DEFAULT_FROM_NAME' && !from) from = m[2].trim()
      }
    }
  }
  return { user, pass, from }
}

export function emailConfigured() {
  const c = loadGmailCreds()
  return !!(c.user && c.pass)
}

export async function sendMail({ to, subject, body, html = false, cc, replyTo }) {
  const { user, pass, from } = loadGmailCreds()
  if (!user || !pass) throw new Error('Gmail credentials not configured (GMAIL_USER / GMAIL_APP_PASSWORD or gmail-mcp/.env)')
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user, pass: pass.replace(/\s|-/g, '') } })
  const msg = { from: from ? `"${from}" <${user}>` : user, to, cc, subject, replyTo: replyTo || process.env.REPLY_TO || undefined }
  if (html) msg.html = body; else msg.text = body
  const info = await transport.sendMail(msg)
  return { messageId: info.messageId, accepted: info.accepted }
}

/** Minimal markdown → HTML for digest emails (headings, lists, links, bold, tables become <pre>). */
export function mdToHtml(md = '') {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
  const lines = md.split('\n'); const out = []; let inList = false, inTable = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  const closeTable = () => { if (inTable) { out.push('</table>'); inTable = false } }
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^\|/.test(l)) {
      closeList()
      if (/^\|\s*-/.test(l)) continue
      if (!inTable) { out.push('<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px">'); inTable = true }
      const cells = l.split('|').slice(1, -1).map(c => `<td>${inline(c.trim())}</td>`).join('')
      out.push(`<tr>${cells}</tr>`); continue
    }
    closeTable()
    if (/^#{1,3} /.test(l)) { closeList(); const n = l.match(/^#+/)[0].length; out.push(`<h${n + 1}>${inline(l.replace(/^#+ /, ''))}</h${n + 1}>`) }
    else if (/^[-*] /.test(l)) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${inline(l.slice(2))}</li>`) }
    else if (l === '---') { closeList(); out.push('<hr>') }
    else if (l === '') { closeList() }
    else { closeList(); out.push(`<p>${inline(l)}</p>`) }
  }
  closeList(); closeTable()
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${out.join('\n')}</div>`
}
