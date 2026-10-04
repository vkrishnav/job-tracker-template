# ATS notes for /apply

## Greenhouse (`job-boards.greenhouse.io/<co>/jobs/<id>`, `boards.greenhouse.io`, company pages with `?gh_jid=`)
- Single page. Form is at the bottom or behind "Apply" / "Apply for this job". Company-hosted pages often embed the same form in an iframe — use `find` for "First Name".
- Fields: First Name, Last Name, Email, Phone, Resume/CV (Attach → file input), Cover Letter (optional), LinkedIn Profile, Website, then custom questions, then a voluntary EEOC block (Gender, Hispanic/Latino, Race, Veteran, Disability) — each has a "Decline To Self Identify" option.
- Location fields are often a typeahead: type "Dallas, Texas" and pick the first suggestion.
- Submit button label: "Submit Application" — do not click.

## Lever (`jobs.lever.co/<co>/<uuid>` → `/apply`)
- Append `/apply` to the posting URL or click "Apply for this job".
- Fields: Full name (single field), Email, Phone, Current company, Current location, LinkedIn/GitHub/Portfolio URLs, "Additional information" textarea, custom questions, EEO block at the bottom with "Decline to self-identify".
- Resume: "ATTACH RESUME/CV" file input. Lever may auto-parse and overwrite name/email — re-check.
- Submit label: "Submit application" — do not click.

## Ashby (`jobs.ashbyhq.com/<co>/<uuid>` → `/application`)
- Click "Apply for this Job" or open `<url>/application`. Multi-section single page.
- Resume upload first ("Autofill from resume"); wait, then verify fields. Fields: Name, Email, Phone, Location (typeahead), LinkedIn, GitHub, Website, then custom questions (radio/select/text). EEO optional at end.
- Submit label: "Submit Application" — do not click.

## Workday (`*.myworkdayjobs.com`)
- Requires an account. Click "Apply" → if a sign-in / create-account screen appears, STOP and ask the user to sign in (never create the account yourself). Continue only after they confirm.
- Multi-step wizard: My Information → My Experience (resume upload + parsed work history; verify each entry) → Application Questions → Voluntary Disclosures → Self Identify → Review. Use "Save and Continue" between steps (that is not Submit). The final step's "Submit" — do not click.

## iCIMS / SmartRecruiters / Jobvite / Taleo / SuccessFactors / Eightfold / Rippling
- Usually account-gated or multi-step. Same policy: sign-in is the human's; fill what you can; stop before Submit. If the flow is unclear, screenshot and ask.

## LinkedIn Easy Apply / Indeed Apply
- Only proceed if the user is already logged in. These use the platform's stored profile and resume; verify the resume shown is `Vamsi_Resume.pdf` (upload from the packet path if not). Multi-step modal; "Next" is fine, "Submit application" / "Review" then "Submit" — stop before the final Submit.

## Common pitfalls
- Phone fields with country pickers: select United States (+1) first, then type digits only.
- "How did you hear about us?" selects: pick "Company website / Careers page" or closest.
- Date pickers: type ISO or MM/DD/YYYY as the field expects; for "earliest start date" use today + 14 days if the packet says "2 weeks notice".
- Resume parse may inject a different email; the tracker email is authoritative: `vamsi.k.veerapaneni@gmail.com`.
- If the page shows a CAPTCHA, stop and ask the user to solve it.
