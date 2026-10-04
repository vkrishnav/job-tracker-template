# job-tracker-template — agent notes

Personal job tracker (React/Vite + Express) with an agentic pipeline. Data lives in `~/Documents/job-data.json`
(override `JOB_DATA_PATH`). Top-level keys: `jobs`, `discovered`, `journal`, `runs`, `email_signals`, `outbox`, `improvements`, `config`.

## Run
- `npm run dev:all` → API :3001 + web :3002 (Vite proxies `/api`). Or `npm run server` / `npm run dev`.
- `npm run agent:all` → fetch → scan → digest without the server. `npm run agent:status` prints state.
- `npm run agent:jobspy` → JobSpy (Indeed/LinkedIn/Glassdoor/ZipRecruiter) Dallas + remote search → feed.

## Agents (`agents/`)
- `fetch.mjs` polls `config.watchlist` (Greenhouse/Ashby/Lever public APIs), filters titles + Dallas-or-remote, scores vs `config.resume_keywords`, upserts `discovered`.
- `scan.mjs` writes `improvements` (follow-ups due, overdue, stale, missing ATS, keyword gaps, unreviewed A/B roles, pending email signals).
- `digest.mjs` writes `~/Documents/job-hunt-digest-YYYY-MM-DD.md` and queues it in `outbox` (sends if `config.email.auto_send_digest`).
- Email sync has no Node implementation on purpose: the Claude scheduled task `job-hunt-agent` reads Gmail via the connector and POSTs `/api/emails/ingest` (or `node agents/run.mjs ingest-file`). Classification + job matching is in `agents/lib/email.mjs`.
- `lib/runner.mjs` merges long-running agent results into a fresh copy of the file so UI edits during a fetch are not lost. Always go through it from the server.

## Browser apply (`/apply <jobId|d_id|url>`)
Skill in `.claude/skills/apply/`. Human-in-the-loop: Claude opens the posting (Claude in Chrome preferred: logged-in sessions + file upload), fills the form from `config.application_profile` + `config.screening_answers` + the resume, and STOPS before Submit. Never creates accounts, types passwords, solves CAPTCHAs, or invents legal/salary/demographic answers (blank profile fields → ask). Packet: `node agents/run.mjs packet <id>`; outcomes: `apply-result <id> <in_progress|ready_to_submit|submitted|blocked|failed|cancelled>` (submitted → status Applied + follow-up date). API: `/api/apply/queue`, `/api/apply/:id/packet`, `/api/apply/:id/result`.

## Conventions
- Every state change gets a journal entry (`addJournal`). Sources: `user`, `email`, `agent:<name>`.
- Scores are deterministic; reasons are stored with the score. Don't add LLM calls to fetch/scan.
- Never auto-submit applications or auto-send email to third parties. Digest to self is opt-in.
- Preference: best perks (401k match, equity, leave) and growth in tech. Scoring has `perks` (10) and `growth` (7) dimensions; `config.growth_companies` gives the company bonus. Tracker jobs carry `retirement_match` and `growth_notes`.
- Location policy: `config.location_mode = 'dallas_or_remote'`. Onsite accepted only for `config.onsite_locations_ok`.
- Communication email (digests, Reply-To, signatures): **vamsi.k.veerapaneni@gmail.com** — the address on the resume. Gmail SMTP authenticates as the app-password account in gmail-mcp/.env; From may differ, Reply-To does not.
- Resume of record: `/Users/vamsiv/Downloads/Vamsi_Resume.pdf` (Principal Full Stack Engineer: Angular + Java 17/Spring Boot + .NET, Strands/AWS Bedrock agentic workflows, Rancher/Kiali, AWS CodePipeline). Renamed 2026-09-08 from `full_time_latest.pdf` — filename now collides with the OLDER, superseded resume at `/Users/vamsiv/Desktop/Resume with AI proj/Vamsi_Resume.pdf` (React/MCP-flavored). Always use the full path, not just the filename, when referring to "the resume"; the Downloads one is current. Also on file: ~/Documents/Vamsi_Veerapaneni_BigTech_Resume.txt.

## Resume formatting MCP (`mcp/overleaf-resume/`)
Local stdio MCP server (declared in `.mcp.json`). Keeps a LaTeX **working copy** of the resume at
`~/Documents/resume/Vamsi_Resume.tex` (override `RESUME_TEX_PATH`) — separate from the PDF resume of record.
Tools: `resume_status`, `get_resume_source`, `set_resume_source`, `init_resume_template` (bundled Jake Gutierrez
ATS layout, `\TODO{}` markers), `lint_resume`, `compile_resume` (hosted: ytotech → texlive.net fallback, no local
TeX), `open_in_overleaf` (writes a self-submitting form to `overleaf.com/docs` — no Overleaf login). Third-party
compile services receive the `.tex`; only put shareable content in it. See `mcp/overleaf-resume/README.md`.

## API quick ref
`GET /api/state` · `POST /api/agents/{fetch|scan|digest|all}/run[?wait=1]` · `POST /api/discovered/bulk` · `POST /api/discovered/:id/track {status}` ·
`POST /api/emails/ingest [{from,subject,snippet,date,thread_id}]` · `POST /api/emails/:id/apply` · `POST /api/outbox` · `POST /api/outbox/:id/send` · `POST /api/email/send {to,subject,body,html}` · `POST /api/journal`.
