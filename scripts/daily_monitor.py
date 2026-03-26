#!/usr/bin/env python3
"""
Job Tracker — Daily Monitor

Scrapes jobs from company career pages, filters by location and skills,
generates tailored LaTeX resumes, and compiles to PDF.

Usage:
    python3 scripts/daily_monitor.py
    python3 scripts/daily_monitor.py --config /path/to/config.json
"""

import argparse
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.error import URLError, HTTPError

# ============================================================================
# PATHS
# ============================================================================

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent
DATA_DIR = BASE_DIR / "data"
TAILORED_DIR = BASE_DIR / "tailored-resumes"
CONFIG_FILE = BASE_DIR / "config.json"
JOBS_FILE = DATA_DIR / "jobs.json"
DAILY_FILE = DATA_DIR / "daily-jobs.json"
STATUS_FILE = DATA_DIR / "status.json"

# ============================================================================
# LOAD CONFIG
# ============================================================================

def load_config(config_path: Optional[Path] = None) -> dict:
    path = config_path or CONFIG_FILE
    if not path.exists():
        print(f"[!] Config not found: {path}")
        print("[!] Copy config.example.json to config.json and customize it")
        sys.exit(1)
    with open(path) as f:
        return json.load(f)

def get_master_resume_path(config: dict) -> Path:
    """Resolve master resume path (supports ~ expansion)."""
    resume_path = config.get("master_resume", "master_resume.tex")
    return Path(os.path.expanduser(resume_path))

# ============================================================================
# DEFAULT COMPANIES (can be overridden in config)
# ============================================================================

DEFAULT_COMPANIES = {
    # Top tech
    "anthropic": {"api": "greenhouse", "board": "anthropic"},
    "openai": {"api": "ashby", "board": "openai"},
    "stripe": {"api": "greenhouse", "board": "stripe"},
    "coinbase": {"api": "greenhouse", "board": "coinbase"},
    "databricks": {"api": "greenhouse", "board": "databricks"},
    "figma": {"api": "greenhouse", "board": "figma"},
    "discord": {"api": "greenhouse", "board": "discord"},
    "ramp": {"api": "greenhouse", "board": "ramp"},
    "notion": {"api": "greenhouse", "board": "notion"},
    "plaid": {"api": "greenhouse", "board": "plaid"},
    "brex": {"api": "greenhouse", "board": "brex"},
    "rippling": {"api": "greenhouse", "board": "rippling"},
    "airtable": {"api": "greenhouse", "board": "airtable"},
    "retool": {"api": "greenhouse", "board": "retool"},
    "datadog": {"api": "greenhouse", "board": "datadog"},
    "cloudflare": {"api": "greenhouse", "board": "cloudflare"},
    "mongodb": {"api": "greenhouse", "board": "mongodb"},
    "elastic": {"api": "greenhouse", "board": "elastic"},
    "hashicorp": {"api": "greenhouse", "board": "hashicorp"},
    "twilio": {"api": "greenhouse", "board": "twilio"},
    
    # Finance
    "capital-one": {"api": "greenhouse", "board": "capitalone"},
    "fidelity": {"api": "greenhouse", "board": "fidelityinvestments"},
    
    # Enterprise
    "salesforce": {"api": "greenhouse", "board": "salesforce"},
    "servicenow": {"api": "greenhouse", "board": "servicenow"},
    "workday": {"api": "greenhouse", "board": "workday"},
    "splunk": {"api": "greenhouse", "board": "splunk"},
}

# ============================================================================
# HTTP HELPERS
# ============================================================================

SSL_CONTEXT = ssl.create_default_context()

def http_get(url: str, timeout: int = 30) -> Optional[dict]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError, json.JSONDecodeError):
        return None

def http_post_json(url: str, payload: dict, timeout: int = 30) -> Optional[dict]:
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={
            "User-Agent": "Mozilla/5.0", "Content-Type": "application/json"
        }, method="POST")
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError, json.JSONDecodeError):
        return None

# ============================================================================
# API FETCHERS
# ============================================================================

def fetch_greenhouse(board: str) -> list:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
    data = http_get(url)
    return data.get("jobs", []) if data else []

def fetch_lever(board: str) -> list:
    url = f"https://api.lever.co/v0/postings/{board}"
    data = http_get(url)
    return data if isinstance(data, list) else []

def fetch_ashby(board: str) -> list:
    url = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams"
    payload = {
        "operationName": "ApiJobBoardWithTeams",
        "variables": {"organizationHostedJobsPageName": board},
        "query": """query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
            jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
                jobPostings { id title locationName descriptionHtml }
            }
        }"""
    }
    data = http_post_json(url, payload)
    return data.get("data", {}).get("jobBoard", {}).get("jobPostings", []) if data else []

# ============================================================================
# MATCHING & FILTERING
# ============================================================================

def create_role_patterns(target_roles: list) -> list:
    """Create regex patterns from target roles."""
    patterns = []
    for role in target_roles:
        # Convert role to regex pattern
        pattern = role.lower().replace(" ", r".*")
        patterns.append(pattern)
    return patterns

def matches_role(title: str, patterns: list) -> bool:
    title_lower = title.lower()
    # Exclude manager/director roles
    if any(x in title_lower for x in ["manager", "director", "vp ", "vice president", "head of"]):
        return False
    return any(re.search(p, title_lower) for p in patterns)

def is_valid_location(loc: str, target_locs: list, exclude_locs: list) -> bool:
    if not loc:
        return True
    loc_lower = loc.lower()
    if any(x in loc_lower for x in exclude_locs):
        return False
    return any(x in loc_lower for x in target_locs)

def extract_salary(text: str) -> Optional[int]:
    patterns = [
        r'\$(\d{3}),?(\d{3})',
        r'\$(\d{2,3})[kK]',
        r'(\d{3}),?(\d{3})\s*(?:USD|usd)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            groups = match.groups()
            if len(groups) == 2 and groups[1]:
                return int(groups[0] + groups[1])
            elif len(groups) == 1:
                return int(groups[0]) * 1000
    return None

def extract_skills(text: str, all_skills: set) -> set:
    text = text.lower()
    return {skill for skill in all_skills if skill in text}

def calculate_match(job_text: str, skills_strong: set, skills_proficient: set, skills_familiar: set) -> dict:
    all_skills = skills_strong | skills_proficient | skills_familiar
    job_skills = extract_skills(job_text, all_skills)
    
    if not job_skills:
        return {"match": 50, "skillsHave": [], "skillsNeed": []}
    
    skills_have = job_skills & all_skills
    skills_need = job_skills - all_skills
    
    score = sum(
        3 if s in skills_strong else 
        2 if s in skills_proficient else 
        1 for s in skills_have
    )
    max_score = len(job_skills) * 2.5
    match_pct = min(98, int((score / max_score) * 100)) if max_score else 50
    
    return {
        "match": match_pct,
        "skillsHave": sorted([s.title() if len(s) > 3 else s.upper() for s in skills_have])[:10],
        "skillsNeed": sorted(list(skills_need))[:5],
    }

# ============================================================================
# RESUME TAILORING
# ============================================================================

def sanitize_name(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '_', name).strip('_')

def escape_latex(text: str) -> str:
    replacements = {
        '&': r'\&', '%': r'\%', '$': r'\$', '#': r'\#', '_': r'\_',
        '{': r'\{', '}': r'\}', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}',
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text

def generate_tailored_resume(job: dict, master_tex: str, config: dict) -> Optional[Path]:
    company = job.get("company", "Company")
    role = job.get("role", "Software Engineer")
    skills_have = job.get("skillsHave", [])
    match_pct = job.get("match", 0)
    
    today = datetime.now().strftime("%Y-%m-%d")
    date_dir = TAILORED_DIR / today
    date_dir.mkdir(parents=True, exist_ok=True)
    
    # Filename: Name_Company_ShortRole.tex
    name_clean = sanitize_name(config.get("name", "Resume"))
    company_clean = sanitize_name(company)
    # Extract a short role tag (first 2 meaningful words)
    role_words = [w for w in sanitize_name(role).split('_') if w.lower() not in ('software', 'engineer', 'senior', 'staff', 'principal')]
    role_tag = '_'.join(role_words[:2]) if role_words else 'SWE'
    base_filename = f"{name_clean}_{company_clean}_{role_tag}"
    tex_path = date_dir / f"{base_filename}.tex"
    
    # Add tailoring comment
    tailored_tex = master_tex.replace(
        r"\begin{document}",
        f"""% Tailored for: {escape_latex(company)} — {escape_latex(role)}
% Match Score: {match_pct}%
% Key Skills: {', '.join(skills_have[:6])}
% Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

\\begin{{document}}"""
    )
    
    tex_path.write_text(tailored_tex)
    
    # Try to compile PDF
    compile_latex_to_pdf(tex_path, date_dir)
    
    pdf_path = tex_path.with_suffix(".pdf")
    return pdf_path if pdf_path.exists() else tex_path

def compile_latex_to_pdf(tex_path: Path, output_dir: Path) -> bool:
    try:
        for _ in range(2):
            subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-output-directory", str(output_dir), str(tex_path)],
                capture_output=True, timeout=60, cwd=output_dir
            )
        # Cleanup aux files
        for ext in [".aux", ".log", ".out"]:
            aux_file = output_dir / tex_path.with_suffix(ext).name
            if aux_file.exists():
                aux_file.unlink()
        return tex_path.with_suffix(".pdf").exists()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False

def generate_tailored_resume_pdf(job: dict, master_pdf: Path, config: dict) -> Optional[Path]:
    """Copy PDF resume with a tailored filename for each job."""
    company = job.get("company", "Company")
    role = job.get("role", "Software Engineer")
    today = datetime.now().strftime("%Y-%m-%d")
    date_dir = TAILORED_DIR / today
    date_dir.mkdir(parents=True, exist_ok=True)
    
    name_clean = sanitize_name(config.get("name", "Resume"))
    company_clean = sanitize_name(company)
    role_words = [w for w in sanitize_name(role).split('_') if w.lower() not in ('software', 'engineer', 'senior', 'staff', 'principal')]
    role_tag = '_'.join(role_words[:2]) if role_words else 'SWE'
    pdf_path = date_dir / f"{name_clean}_{company_clean}_{role_tag}.pdf"
    
    shutil.copy2(master_pdf, pdf_path)
    return pdf_path

# ============================================================================
# STATUS TRACKING
# ============================================================================

def load_status() -> dict:
    if STATUS_FILE.exists():
        with open(STATUS_FILE) as f:
            return json.load(f)
    return {"jobs": {}}

def save_status(status: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)

def update_job_status(job_id: str, status: str, resume_path: Optional[str] = None):
    data = load_status()
    if job_id not in data["jobs"]:
        data["jobs"][job_id] = {"created": datetime.now().isoformat()}
    
    data["jobs"][job_id]["status"] = status
    data["jobs"][job_id]["updated"] = datetime.now().isoformat()
    if resume_path:
        rel_path = str(resume_path).replace(str(BASE_DIR) + "/", "")
        data["jobs"][job_id]["resume"] = rel_path
    
    save_status(data)

# ============================================================================
# MAIN
# ============================================================================

def load_existing_ids() -> set:
    if JOBS_FILE.exists():
        with open(JOBS_FILE) as f:
            return {j.get("id") for j in json.load(f)}
    return set()

def scrape_and_filter(config: dict) -> list:
    # Load skills
    skills_strong = set(s.lower() for s in config["skills"]["strong"])
    skills_proficient = set(s.lower() for s in config["skills"]["proficient"])
    skills_familiar = set(s.lower() for s in config["skills"]["familiar"])
    
    # Load location filters
    target_locs = [loc.lower() for loc in config["target_locations"]]
    exclude_locs = [loc.lower() for loc in config["exclude_locations"]]
    
    # Load role patterns
    role_patterns = create_role_patterns(config.get("target_roles", ["software engineer"]))
    
    # Get companies to scrape
    companies = config.get("companies", DEFAULT_COMPANIES)
    
    existing_ids = load_existing_ids()
    all_jobs = []
    
    print(f"Scraping {len(companies)} companies...")
    
    for company, cfg in companies.items():
        api, board = cfg["api"], cfg["board"]
        
        raw = []
        if api == "greenhouse":
            raw = fetch_greenhouse(board)
        elif api == "lever":
            raw = fetch_lever(board)
        elif api == "ashby":
            raw = fetch_ashby(board)
        
        for r in raw:
            if api == "greenhouse":
                title = r.get("title", "")
                location = r.get("location", {}).get("name", "")
                content = r.get("content", "")
                url = r.get("absolute_url", "")
                job_id = f"{company}-gh-{r.get('id', '')}"
            elif api == "lever":
                title = r.get("text", "")
                location = r.get("categories", {}).get("location", "")
                content = r.get("descriptionPlain", "")
                url = r.get("hostedUrl", "")
                job_id = f"{company}-lv-{r.get('id', '')}"
            elif api == "ashby":
                title = r.get("title", "")
                location = r.get("locationName", "")
                content = r.get("descriptionHtml", "")
                url = f"https://jobs.ashbyhq.com/{board}/{r.get('id', '')}"
                job_id = f"{company}-ab-{r.get('id', '')}"
            
            if job_id in existing_ids:
                continue
            if not matches_role(title, role_patterns):
                continue
            if not is_valid_location(location, target_locs, exclude_locs):
                continue
            
            job_text = f"{title} {content}"
            match_data = calculate_match(job_text, skills_strong, skills_proficient, skills_familiar)
            salary = extract_salary(job_text)
            
            job = {
                "id": job_id,
                "company": company.title().replace("-", " "),
                "role": title,
                "location": location or "Remote",
                "url": url,
                "salary": salary,
                "scrapedAt": datetime.now(timezone.utc).isoformat(),
                **match_data,
            }
            all_jobs.append(job)
    
    print(f"Found {len(all_jobs)} matching jobs")
    all_jobs.sort(key=lambda x: (x.get("salary") or 0, x["match"]), reverse=True)
    return all_jobs

def main():
    parser = argparse.ArgumentParser(description="Job Tracker Daily Monitor")
    parser.add_argument("--config", type=Path, help="Path to config.json")
    args = parser.parse_args()
    
    config = load_config(args.config)
    
    print(f"\n{'='*60}")
    print(f"Job Tracker — {config.get('name', 'User')}")
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    # Check master resume
    master_resume_path = get_master_resume_path(config)
    if not master_resume_path.exists():
        print(f"[!] Master resume not found: {master_resume_path}")
        print("[!] Update 'master_resume' in config.json with your resume path")
        return 1
    
    is_pdf_resume = master_resume_path.suffix.lower() == '.pdf'
    master_tex = None if is_pdf_resume else master_resume_path.read_text()
    
    if is_pdf_resume:
        print(f"[*] Using PDF master resume: {master_resume_path.name}")
    else:
        print(f"[*] Using LaTeX master resume: {master_resume_path.name}")
    
    # Scrape
    jobs = scrape_and_filter(config)
    
    # Top N
    top_n = config.get("top_jobs_count", 15)
    min_match = config.get("min_match_percent", 70)
    top_jobs = jobs[:top_n]
    
    print(f"\nTop {len(top_jobs)} jobs (by pay, then match):\n")
    
    resumes_created = []
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    for i, job in enumerate(top_jobs, 1):
        salary_str = f"${job['salary']:,}" if job.get("salary") else "N/A"
        print(f"{i:2}. [{job['match']:2}%] {job['company']:20} | {job['role'][:35]:35} | {salary_str}")
        
        if job["match"] >= min_match:
            if is_pdf_resume:
                path = generate_tailored_resume_pdf(job, master_resume_path, config)
            else:
                path = generate_tailored_resume(job, master_tex, config)
            if path:
                resumes_created.append((job, path))
                update_job_status(job["id"], "resume_ready", str(path))
                icon = "📄" if path.suffix == ".pdf" else "📝"
                print(f"     ✅ {icon} {path.name}")
        else:
            update_job_status(job["id"], "new")
    
    # Save results
    with open(DAILY_FILE, "w") as f:
        json.dump({
            "date": datetime.now().strftime("%Y-%m-%d"),
            "totalFound": len(jobs),
            "topJobs": top_jobs,
            "resumesCreated": len(resumes_created),
        }, f, indent=2)
    
    existing_jobs = []
    if JOBS_FILE.exists():
        with open(JOBS_FILE) as f:
            existing_jobs = json.load(f)
    existing_jobs.extend(top_jobs)
    with open(JOBS_FILE, "w") as f:
        json.dump(existing_jobs, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total found:       {len(jobs)}")
    print(f"Top jobs tracked:  {len(top_jobs)}")
    print(f"Resumes created:   {len(resumes_created)} (match >= {min_match}%)")
    print(f"\nOutput: {TAILORED_DIR / datetime.now().strftime('%Y-%m-%d')}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
