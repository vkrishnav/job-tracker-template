# JobTracker — agentic job search command center

Personal job application tracker with an autonomous discovery / scoring / email-feedback pipeline and a workflow dashboard to monitor it. React + Vite frontend, Express backend, everything persisted to `~/Documents/job-data.json` so Claude Code skills and scheduled tasks can read and write the same file.

```
┌──────────── Agents tab ────────────┐
Job boards ──► Fetch ──► Score ──► Feed ──► Track ──► Jobs
Gmail ───────► Email Sync ──► Signals ──► Apply ──► Status
Scan ──► Improvements ──► Digest ──► Outbox ──► Gmail (send)
                     everything ──► Journal
```

## Running

```bash
npm install
npm run dev:all        # API :3001 (with in-process scheduler) + web :3002
```

Other entry points:

| Command | What it does |
|---|---|
| `npm run agent:all` | fetch → scan → digest, no server needed |
| `npm run agent:fetch` / `agent:scan` / `agent:digest` | individual agents |
| `npm run agent:status` | JSON status of agents + counts |
| `npm run agent:jobspy` | JobSpy scrape (Indeed/LinkedIn/Glassdoor/ZipRecruiter) for Dallas + remote, ingested into the feed |
| `npm run launchd:install` | keep the API + scheduler running in the background (user LaunchAgent) |
| `node agents/run.mjs digest --send` | write and email today's digest |

Config lives in the data file under `config` and is editable in **Agents → Config** (watchlist, intervals, salary floor, location policy, digest recipient). See `.env.example` for environment overrides.

## Agents

| Agent | Trigger | Source | Output |
|---|---|---|---|
| **Fetch** | every `fetch_interval_min` (default 3h) in the server, or CLI | 33 public boards: Greenhouse, Ashby, Lever APIs (no auth, no cost); optional JobSpy | `discovered[]` — scored, graded A–F, deduped by company+title, location-policy filtered |
| **Scan** | every `scan_interval_min` (6h), after every fetch, or CLI | jobs, journal, feed, signals | `improvements[]` — follow-ups due, overdue actions, stale apps, missing ATS scores, keyword gaps, unreviewed A/B roles, unapplied email signals |
| **Email Sync** | Claude scheduled tasks `job-hunt-agent` (8:00 Mon–Sat) and `job-hunt-email-sync` (13:30 Mon–Fri) | Gmail connector | `email_signals[]` — classified rejection / interview / assessment / offer / recruiter / ack, matched to a job; **Apply** flips the job status |
| **Digest** | daily task, or CLI | everything | `~/Documents/job-hunt-digest-YYYY-MM-DD.md` + outbox draft (auto-send optional) |

**Scoring** (`agents/lib/scoring.mjs`, deterministic and explained per role): level 25 · resume-keyword coverage 30 · location 15 · comp 10 (−20 below floor) · perks 10 (401k match, equity, parental leave, PTO, learning budget, detected from the posting) · growth 7 (`config.growth_companies` + growth language) · recency 3. Keywords come from `config.resume_keywords`, seeded from the resume.

**Location policy**: onsite/hybrid only in the Dallas metro (`config.onsite_locations_ok`); everywhere else must be remote and US-eligible (`config.remote_exclude_regions`).

**Browser apply** (`/apply <jobId>` in Claude Code): queue a role from the Feed or Jobs tab, run the skill, and Claude opens the posting in Chrome, fills the ATS form (Greenhouse, Lever, Ashby, Workday notes in `.claude/skills/apply/ats-adapters.md`) from **Agents → Config → Application profile**, uploads the resume, answers screening questions from the answer bank, and stops before Submit for you to review and click. Marking it submitted flips the job to Applied with a follow-up date.

**Safety**: nothing is auto-submitted. Email is sent only by an explicit *Send via Gmail* click or by the digest to your own address. Every agent action and status change is written to the Journal.

## Dashboard tabs

- **Dashboard** — KPIs, pipeline, follow-up alerts, plus an agent-health strip.
- **Jobs** — the tracker (ATS score, keyword gaps, resume version, fit score).
- **Agents** — the workflow monitor: agent cards with last/next run and *Run* buttons, pipeline flow, and sections for Feed (Track / Applied / Dismiss), Email signals (link, Apply, Reply), Improvements, Outbox (compose with templates, Send via Gmail or open in Mail), Runs, Config.
- **Journal** — timeline of everything (status changes, emails, agent runs, notes), filterable by job and type, with manual entries.
- **Resumes**, **Learning** — unchanged.

## Data schema (`~/Documents/job-data.json`)

Top-level: `jobs`, `discovered`, `journal`, `runs`, `email_signals`, `outbox`, `improvements`, `config`, `meta`. v1 files (jobs only) migrate in place on first load. Writes are atomic with a `.bak` sibling.

`jobs[]` keeps the original schema (see below). New collections:

| Collection | Key fields |
|---|---|
| `discovered[]` | `company, role_title, location, location_policy (remote/dallas-onsite), url, alt_urls, score, grade, score_reasons, keywords_matched/missing, salary_min/max, status (new/tracked/dismissed/expired), job_id` |
| `journal[]` | `ts, type (note/status_change/email/agent/followup/improvement/discovered/outbox), title, body, job_id, company, source` |
| `runs[]` | `agent, trigger, started_at, finished_at, status, summary, stats` |
| `email_signals[]` | `from, subject, snippet, date, thread_id, classification, job_id, applied` |
| `outbox[]` | `to, subject, body, kind, job_id, status (draft/sent/failed), sent_at` |
| `improvements[]` | `key, type, severity, title, body, job_id, action` |

### Job fields

Core: `id, company, role_title, level, location, remote, salary_min, salary_max, equity_notes, parental_leave_weeks, parental_leave_notes, status, applied_date, next_action_date, deadline, job_url, notes, priority, contacts[]`.
Statuses: Researching · Applied · Phone Screen · Technical Screen · Onsite · Offer · Accepted · Rejected · Withdrawn · Closed.

Resume intelligence (written by Claude skills such as [ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) via `PATCH /api/jobs/:id`): `ats_score` (0–100), `keyword_gaps[]`, `resume_version`, `interview_prep_done`, `prep_questions_count`, `fit_score` (1–10). UI colours: ATS green ≥ 80 / yellow 60–79 / red < 60; fit green ≥ 8 / yellow 6–7 / red ≤ 5.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health`, `/api/state` | liveness; full dashboard state |
| GET/PUT/POST/PATCH/DELETE | `/api/jobs[/:id]` | tracker CRUD (status changes are journaled) |
| GET/PUT | `/api/config` | agent configuration |
| GET | `/api/discovered` · PATCH `/api/discovered/:id` · POST `/api/discovered/:id/track {status}` · POST `/api/discovered/bulk [..]` | feed |
| GET/POST/DELETE | `/api/journal[/:id]` | journal |
| GET | `/api/runs`, `/api/improvements` · POST `/api/improvements/:key/dismiss` | agent output |
| POST | `/api/emails/ingest [{from,subject,snippet,date,thread_id}]` · `/api/emails/:id/apply` · PATCH `/api/emails/:id` | email signals |
| GET/POST/PATCH/DELETE | `/api/outbox[/:id]` · POST `/api/outbox/:id/send` · GET `/api/outbox/templates/:jobId` · POST `/api/email/send` | outbox and sending (Gmail SMTP; credentials from env or `gmail-mcp/.env`) |
| POST | `/api/agents/{fetch,scan,digest,all}/run[?wait=1]` | trigger an agent |
| GET/POST | `/api/apply/queue` · GET `/api/apply/:jobId/packet` · POST `/api/apply/:jobId/result {status,notes}` · DELETE `/api/apply/:jobId` | browser-apply queue, packet, outcome |

## Research

`docs/RESEARCH.md` lists the open-source repos surveyed (JobSpy, JobSync, ApplyPilot, BOB, ResumeSkills, Proficiently, …) and what was borrowed from each.
