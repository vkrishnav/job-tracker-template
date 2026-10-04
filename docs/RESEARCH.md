# Research: best open-source job-applying / tracking repos (Sept 2026)

Surveyed via GitHub search (sorted by stars, filtered to recent activity) and web search.
What this repo borrowed from each is noted, so the design decisions are traceable.

## Trackers

| Repo | Stars | Stack | What it does well | Borrowed here |
|---|---|---|---|---|
| [Gsync/jobsync](https://github.com/Gsync/jobsync) | ~1.0k | TS, Next.js, Docker, Ollama/cloud LLM, **MCP server** | Self-hosted tracker + AI resume review + **scheduled "automations" that poll job-board APIs and AI-match against the resume**; MCP server so Claude Desktop can add jobs | Scheduled board polling → scored feed → one-click track. MCP-style agent access is covered here by the REST API + Claude scheduled task. |
| [shyamsridhar123/BOB](https://github.com/shyamsridhar123/BOB) | small | Python, FastAPI, React, Claude Code | **Scans 46 companies via Greenhouse/Ashby public APIs at zero cost**, grades A–F on 5 dimensions, Kanban, auto follow-ups at 1w/2w/1m, STAR prep | Greenhouse/Ashby/Lever public-API fetchers, A–F grading, follow-up-due scanner, Claude Code as the conversational surface. |
| [ganainy/VibeHired-ai](https://github.com/ganainy/VibeHired-ai), [benidevo/vega-ai](https://github.com/benidevo/vega-ai) | small | misc | Per-job CV tailoring + ATS scoring in the tracker | ATS/fit fields already existed here; kept. |

## Discovery / scraping

| Repo | Stars | Notes | Borrowed here |
|---|---|---|---|
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | ~4.2k | `pip install python-jobspy`; scrapes LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google concurrently into a DataFrame | `agents/jobspy_fetch.py` runs Dallas + remote-US searches and feeds `POST /api/discovered/bulk`. Installed in `.venv-jobspy`. |
| [hendrixfreire/linkedin-job-scraper](https://github.com/hendrixfreire/linkedin-job-scraper) | 75 | LinkedIn guest API + SQLite + audit trail + dry-run/auto-submit/manual modes; never types passwords or solves CAPTCHA | The "audit everything to a journal" and "never auto-submit without a human" posture. |

## Auto-apply (evaluated, deliberately NOT integrated)

| Repo | Stars | Why not |
|---|---|---|
| [Pickle-Pixel/ApplyPilot](https://github.com/Pickle-Pixel/ApplyPilot) | ~1.6k, AGPL | Full autonomous submit ("1,000 jobs in 2 days"). For Staff/Principal roles volume-spraying hurts; ATS duplicate detection at Anthropic/OpenAI-tier companies is real. Its 6-stage pipeline (discover → enrich → score → tailor → cover letter → apply) informed the agent split here, minus the apply stage. |
| [GodsScion/Auto_job_applier_linkedIn](https://github.com/GodsScion/Auto_job_applier_linkedIn) | large | LinkedIn Easy Apply bot; ToS risk, low signal for senior roles. |
| [proficientlyjobs/proficiently-claude-skills](https://github.com/proficientlyjobs/proficiently-claude-skills) | 368 | `/proficiently:apply` fills Greenhouse/Lever/Workday forms from Claude Code — the closest "human-in-the-loop apply" pattern. Worth installing as a plugin when you want assisted form filling. |

## Claude Code skills for the resume side

| Repo | Stars | Use |
|---|---|---|
| [Paramchoudhary/ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) | ~2.2k | 14 skills: `resume-ats-optimizer`, `job-description-analyzer`, `resume-tailor`, `interview-prep-generator`, `salary-negotiation-prep`, … Drop into `~/.claude/skills/`. Maps 1:1 onto the four resume-intelligence fields this tracker already renders (`ats_score`, `keyword_gaps`, `fit_score`, `interview_prep_done`). |
| [NullSpace-BitCradle/ats-resume-agent](https://github.com/NullSpace-BitCradle/ats-resume-agent) | small | Zero-fabrication LaTeX resume from a master career doc. Good for the per-job tailored PDF. |

## Design decisions taken

1. **Zero-cost, no-auth discovery first.** Greenhouse (`boards-api.greenhouse.io`), Ashby (`api.ashbyhq.com/posting-api`), Lever (`api.lever.co/v0/postings`) are public JSON. 33 boards fetch in ~17 s. JobSpy is the optional second tier.
2. **Deterministic, explainable scoring** (`agents/lib/scoring.mjs`) instead of LLM scoring per job: level 30 · resume-keyword coverage 40 · location 15 · comp 10 · recency 5. Every score carries its reasons. LLM effort is reserved for the resume skills on roles you choose to track.
3. **Location policy is enforced at fetch time**: onsite/hybrid only in the Dallas metro; everything else must be remote. Toggle in Agents → Config.
4. **No autonomous submission.** The feed has *Track* / *Applied* buttons; email has *Send via Gmail* behind an explicit click. Everything an agent does is written to the Journal.
5. **Email feedback loop via the Gmail connector**, not IMAP credentials in this repo: the `job-hunt-agent` Claude scheduled task reads replies, classifies (rules in `agents/lib/email.mjs`), posts to `/api/emails/ingest`, and *Apply* flips the job status.
