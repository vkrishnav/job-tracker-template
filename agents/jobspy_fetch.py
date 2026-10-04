#!/usr/bin/env python3
"""Optional: broaden discovery with JobSpy (Indeed/LinkedIn/Glassdoor/ZipRecruiter/Google).
Install:  uv venv .venv-jobspy && .venv-jobspy/bin/pip install python-jobspy
Run:      .venv-jobspy/bin/python agents/jobspy_fetch.py > /tmp/jobspy.json
Then:     node agents/run.mjs ingest-discovered /tmp/jobspy.json   (or POST /api/discovered/bulk)
Searches both "Dallas, TX" (onsite ok) and remote-USA per the location policy.
"""
import json, sys
try:
    from jobspy import scrape_jobs
except ImportError:
    print(json.dumps({"error": "python-jobspy not installed"})); sys.exit(1)

TERMS = ["staff software engineer", "principal software engineer", "staff full stack engineer", "principal engineer platform", "forward deployed engineer"]
out = []
for term in TERMS:
    for loc, remote in (("Dallas, TX", False), ("United States", True)):
        try:
            df = scrape_jobs(site_name=["indeed", "linkedin", "zip_recruiter", "glassdoor"], search_term=term,
                             location=loc, results_wanted=25, hours_old=72, country_indeed="USA", is_remote=remote)
        except Exception as e:
            print(f"warn {term}/{loc}: {e}", file=sys.stderr); continue
        def sv(v):
            return "" if v is None or (isinstance(v, float) and v != v) else str(v)
        def num(v):
            try:
                return None if v is None or (isinstance(v, float) and v != v) else float(v)
            except (TypeError, ValueError):
                return None
        for _, r in df.iterrows():
            out.append({
                "source": f"jobspy:{sv(r.get('site'))}", "external_id": sv(r.get('id')) or sv(r.get('job_url')),
                "company": sv(r.get('company')), "role_title": sv(r.get('title')), "location": sv(r.get('location')) or ("Remote" if remote else loc),
                "remote": bool(r.get('is_remote')) or remote, "url": sv(r.get('job_url_direct')) or sv(r.get('job_url')),
                "posted_at": sv(r.get('date_posted')) or None,
                "description": sv(r.get('description'))[:12000],
                "salary_min": num(r.get('min_amount')),
                "salary_max": num(r.get('max_amount')),
            })
seen = set(); dedup = []
for j in out:
    if not j["url"] or j["url"] in seen: continue
    seen.add(j["url"]); dedup.append(j)
print(json.dumps(dedup))
