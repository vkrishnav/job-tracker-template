# overleaf-resume — local MCP server

Formats the resume as LaTeX, compiles it through a hosted LaTeX API (no local
TeX install), and hands the source off to Overleaf as a fresh project — **no
Overleaf account or credentials required**.

## Tools

| tool | what it does |
|------|--------------|
| `resume_status` | resolved paths, whether the `.tex` / `.pdf` exist, line count, lint summary |
| `get_resume_source` | read the working `.tex` (optional `from`/`to` line range) |
| `set_resume_source` | overwrite the working `.tex` (`content`); previous version kept at `<path>.bak`; returns lint |
| `init_resume_template` | write the bundled ATS-friendly template (`template.tex`); `force` to overwrite |
| `lint_resume` | heuristic checks: brace balance, `\begin`/`\end` pairing, stray tabs, `\TODO{}` count, unescaped `&`, long lines, placeholders |
| `compile_resume` | POST the `.tex` to `latex.ytotech.com` (falls back to `texlive.net`), save the PDF. Args: `engine` (`pdflatex`\|`xelatex`\|`lualatex`), `out` |
| `open_in_overleaf` | write a self-submitting HTML form that POSTs the `.tex` to `overleaf.com/docs`. Open the file in a browser → new Overleaf project. Also returns a direct `?encoded_snip=` URL when the source is small enough |

## Workflow

1. `init_resume_template` → working `.tex` at `~/Documents/resume/Vamsi_Resume.tex`
2. Fill every `\TODO{...}` (renders as bold `[TODO: ...]` in the draft PDF) via `get_resume_source` / `set_resume_source`
3. `lint_resume` until clean
4. `compile_resume` → `~/Documents/resume/Vamsi_Resume.pdf` for a local preview
5. `open_in_overleaf` → open `~/Documents/resume/open-in-overleaf.html` in a browser to continue editing in Overleaf

## Config (env)

| var | default |
|-----|---------|
| `RESUME_TEX_PATH` | `~/Documents/resume/Vamsi_Resume.tex` |
| `RESUME_PDF_PATH` | `<tex dir>/<tex basename>.pdf` |
| `OVERLEAF_HTML_PATH` | `<tex dir>/open-in-overleaf.html` |
| `RESUME_LATEX_ENGINE` | `pdflatex` |

## Registering

`.mcp.json` at the repo root already declares it:

```json
{ "mcpServers": { "overleaf-resume": { "command": "node", "args": ["mcp/overleaf-resume/server.mjs"] } } }
```

Claude Code picks up `.mcp.json` on next start (approve the server when prompted).
Run standalone for a smoke test: `node mcp/overleaf-resume/server.mjs` (speaks MCP over stdio).

## Notes

- The resume of record is a PDF (`/Users/vamsiv/Downloads/Vamsi_Resume.pdf`); this server keeps a **separate** LaTeX working copy and does not touch that file unless `RESUME_PDF_PATH` is pointed at it.
- Compile services are third-party. The `.tex` source is uploaded to them to render — fine for a resume you're about to publish, but don't put anything you wouldn't share in the file.
- `template.tex` is the Jake Gutierrez single-column layout (widely ATS-tested), pre-seeded with details from `CLAUDE.md`.
