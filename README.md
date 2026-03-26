# 💼 Job Tracker

Automated job tracker that scrapes opportunities from top tech companies, filters by your location preferences, matches against your skills, and generates tailored LaTeX resumes.

## ✨ Features

- 🔍 **Smart Scraping** — Fetches jobs from 30+ companies via Greenhouse, Lever, and Ashby APIs
- 📍 **Location Filtering** — Target specific cities + remote positions
- 💰 **Pay Sorting** — Top jobs sorted by salary (descending), then match score
- 📝 **Auto-Tailoring** — Generates customized LaTeX resumes for high-match jobs
- 📊 **Dashboard** — Web UI to track status, apply, and download resumes
- ⏰ **Automation** — Schedule daily runs with cron/launchd

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/job-tracker.git
cd job-tracker

# Copy example config
cp config.example.json config.json
```

### 2. Configure

Edit `config.json` with your info:

```json
{
  "name": "Your Name",
  "email": "you@example.com",
  "master_resume": "~/Documents/resume.tex",
  "target_locations": ["remote", "san francisco", "new york"],
  "skills": {
    "strong": ["python", "javascript", "react"],
    "proficient": ["aws", "docker", "sql"],
    "familiar": ["kubernetes", "go"]
  }
}
```

### 3. Run

```bash
# Scrape jobs and generate resumes
python3 scripts/daily_monitor.py

# Compile LaTeX to PDF (requires MacTeX)
./scripts/compile_pdfs.sh

# Start dashboard
python3 -m http.server 8080
# Open: http://localhost:8080
```

## 📁 Project Structure

```
job-tracker/
├── config.json              # Your config (gitignored)
├── config.example.json      # Template config
├── index.html               # Web dashboard
├── scripts/
│   ├── daily_monitor.py     # Main scraper
│   └── compile_pdfs.sh      # LaTeX → PDF compiler
├── data/                    # Generated (gitignored)
│   ├── jobs.json            # All tracked jobs
│   ├── daily-jobs.json      # Today's results
│   └── status.json          # Application status
└── tailored-resumes/        # Generated (gitignored)
    └── YYYY-MM-DD/
        ├── Your_Name_Company.tex
        └── Your_Name_Company.pdf
```

## ⚙️ Configuration

### `config.json` Fields

| Field | Description |
|-------|-------------|
| `name` | Your full name (used in resume filenames) |
| `master_resume` | Path to your LaTeX resume template (supports `~`) |
| `target_locations` | Cities/regions to include (e.g., `["remote", "austin", "texas"]`) |
| `exclude_locations` | Regions to exclude (e.g., `["india", "uk only"]`) |
| `min_match_percent` | Minimum match % to generate tailored resume (default: 70) |
| `top_jobs_count` | Number of top jobs to track daily (default: 15) |
| `skills.strong` | Skills you're expert in (weighted 3x) |
| `skills.proficient` | Skills you're good at (weighted 2x) |
| `skills.familiar` | Skills you know basics of (weighted 1x) |
| `target_roles` | Job titles to match (e.g., `["software engineer", "full stack"]`) |
| `companies` | Custom company list (optional, uses defaults if omitted) |

### Adding Companies

```json
{
  "companies": {
    "company-name": {
      "api": "greenhouse",
      "board": "company-board-id"
    }
  }
}
```

Supported APIs:
- `greenhouse` — `boards-api.greenhouse.io/v1/boards/{board}/jobs`
- `lever` — `api.lever.co/v0/postings/{board}`
- `ashby` — `jobs.ashbyhq.com/{board}`

## 📅 Automation

### macOS (LaunchAgent)

```bash
# Copy plist
cp scripts/launchd.plist ~/Library/LaunchAgents/com.jobtracker.daily.plist

# Edit the plist to update paths, then load
launchctl load ~/Library/LaunchAgents/com.jobtracker.daily.plist
```

### Cron

```bash
# Run daily at 8 AM
0 8 * * * cd /path/to/job-tracker && python3 scripts/daily_monitor.py >> logs/cron.log 2>&1
```

## 📄 Resume Requirements

Your master resume should be a LaTeX file. The tracker inserts a comment header with tailoring info but doesn't modify the content (yet).

Recommended template: [Jake's Resume](https://github.com/jakegut/resume)

## 🖥️ Dashboard

The web dashboard (`index.html`) provides:

- 📊 Stats overview (total jobs, resume ready, applied, avg match)
- 🔍 Filters (All, Resume Ready, New, Applied, 80%+ Match)
- 📋 Sortable table (Company, Role, Salary, Match)
- 🔗 **Apply** button → links to job application page
- 📄 **Resume** button → downloads tailored resume

### Running the Dashboard

```bash
cd job-tracker
python3 -m http.server 8080
```

Open http://localhost:8080

## 🛠️ Requirements

- **Python 3.8+** — No external dependencies (stdlib only)
- **MacTeX** (optional) — For PDF compilation
  ```bash
  brew install --cask mactex
  # or lighter version:
  brew install --cask basictex
  ```

## 📝 Job Statuses

| Status | Description |
|--------|-------------|
| `new` | Just scraped, below match threshold |
| `resume_ready` | Tailored resume generated |
| `applied` | Application submitted |
| `interviewing` | In interview process |
| `offer` | Received offer |
| `rejected` | Not selected |

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## 📜 License

MIT License — see [LICENSE](LICENSE)
