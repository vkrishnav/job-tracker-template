## 2026-07-06 — job-tracker-template path audit

**Repo:** `/Users/vamsiv/Documents/GIT/job-tracker-template`

**Found:**
- `daily-job-hunt-digest` scheduled task (SKILL.md, Step 3) referenced the wrong path: `/Users/vamsiv/Documents/GIT/job-tracker-template/job-data.json`. The actual data file lives at `/Users/vamsiv/Documents/job-data.json` (matching what `server.js` always wrote to).
- `server.js`: `PORT` was hardcoded as `3001` with no env var override.
- `src/hooks/useJobsApi.js`: API base URL `http://localhost:3001/api` is hardcoded (minor — affects portability only).
- No `.env.example` existed to document config surface.

**Fixed:**
1. **Scheduled task prompt** (`daily-job-hunt-digest`): updated Step 3 path from `.../GIT/job-tracker-template/job-data.json` → `/Users/vamsiv/Documents/job-data.json` via `update_scheduled_task`.
2. **`server.js`** line 10: `JOB_DATA_PATH` env var support added — `process.env.JOB_DATA_PATH || path.join(process.env.HOME, 'Documents', 'job-data.json')`. Server already used `process.env.HOME` correctly; the digest task did not.
3. **`server.js`** line 9: PORT now reads `process.env.PORT || 3001`.
4. **`.env.example`** created — documents `JOB_DATA_PATH`, `PORT`, and flags the `useJobsApi.js` hardcoded URL.

**Still needs work:**
- `src/hooks/useJobsApi.js`: `http://localhost:3001/api` is hardcoded. If PORT changes, both server.js and this constant need updating. Proper fix: add a `VITE_API_URL` env var and reference `import.meta.env.VITE_API_URL` here, or set up a Vite proxy so the frontend hits the same origin.
- No `.env` file exists (only `.env.example`) — if you ever want to override `JOB_DATA_PATH`, copy `.env.example` to `.env` and set the value.
- `.gitignore` does not include `.env` — worth adding if you create one with real paths.
- Audit file saved here (`job-tracker-template/project-audit-personal-digest.md`) instead of `~/Documents/` — move it manually if you prefer the canonical location.
