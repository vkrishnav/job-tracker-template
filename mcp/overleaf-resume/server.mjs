#!/usr/bin/env node
/**
 * overleaf-resume — local MCP server for formatting the resume in LaTeX,
 * compiling it via a hosted LaTeX API, and handing it off to Overleaf
 * (no Overleaf account or credentials required).
 *
 * Tools:
 *   resume_status         — resolved paths + whether the .tex / .pdf exist
 *   get_resume_source     — read the working .tex (optionally a line range)
 *   set_resume_source     — overwrite the working .tex (keeps a .bak), lints
 *   init_resume_template  — write the bundled ATS-friendly template
 *   lint_resume           — heuristic checks (unbalanced braces, TODOs, tabs, long lines)
 *   compile_resume        — POST .tex to a hosted LaTeX service, save the PDF
 *   open_in_overleaf      — write a self-submitting HTML form (POST to overleaf.com/docs)
 *
 * Config (env):
 *   RESUME_TEX_PATH   default ~/Documents/resume/Vamsi_Resume.tex
 *   RESUME_PDF_PATH   default <tex dir>/<tex basename>.pdf
 *   OVERLEAF_HTML_PATH default <tex dir>/open-in-overleaf.html
 *   RESUME_LATEX_ENGINE default pdflatex  (pdflatex | xelatex | lualatex)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();

const TEX_PATH = resolve(
  process.env.RESUME_TEX_PATH || join(HOME, "Documents", "resume", "Vamsi_Resume.tex"),
);
const TEX_DIR = dirname(TEX_PATH);
const PDF_PATH = resolve(
  process.env.RESUME_PDF_PATH || join(TEX_DIR, basename(TEX_PATH).replace(/\.tex$/i, "") + ".pdf"),
);
const OVERLEAF_HTML_PATH = resolve(
  process.env.OVERLEAF_HTML_PATH || join(TEX_DIR, "open-in-overleaf.html"),
);
const DEFAULT_ENGINE = (process.env.RESUME_LATEX_ENGINE || "pdflatex").toLowerCase();
const ENGINES = ["pdflatex", "xelatex", "lualatex"];
const TEMPLATE_PATH = join(HERE, "template.tex");

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

async function readTex() {
  return readFile(TEX_PATH, "utf8");
}

async function writeTex(content) {
  await mkdir(TEX_DIR, { recursive: true });
  if (existsSync(TEX_PATH)) await copyFile(TEX_PATH, TEX_PATH + ".bak");
  await writeFile(TEX_PATH, content, "utf8");
}

/* ---------- lint ---------- */
function lintTex(src) {
  const issues = [];
  const lines = src.split("\n");

  // brace balance (ignore \{ \})
  let depth = 0;
  for (const ch of src.replace(/\\[{}]/g, "")) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) {
    issues.push({ level: "error", msg: `Unbalanced braces (net ${depth > 0 ? "+" : ""}${depth}).` });
  }

  if (!/\\begin\{document\}/.test(src)) issues.push({ level: "error", msg: "Missing \\begin{document}." });
  if (!/\\end\{document\}/.test(src)) issues.push({ level: "error", msg: "Missing \\end{document}." });

  const beginCount = (src.match(/\\begin\{/g) || []).length;
  const endCount = (src.match(/\\end\{/g) || []).length;
  if (beginCount !== endCount) {
    issues.push({ level: "error", msg: `\\begin (${beginCount}) / \\end (${endCount}) count mismatch.` });
  }

  const todoMacros = (src.match(/\\TODO\{/g) || []).length;
  if (todoMacros) {
    issues.push({ level: "warn", msg: `${todoMacros} \\TODO{...} placeholder(s) still in the document.` });
  }

  lines.forEach((ln, i) => {
    const n = i + 1;
    if (/\t/.test(ln)) issues.push({ level: "warn", msg: `Line ${n}: literal tab character.` });
    if (/%+\s*TODO/i.test(ln)) {
      issues.push({ level: "warn", msg: `Line ${n}: TODO comment — ${ln.trim().slice(0, 90)}` });
    }
    // naked & outside a comment / not escaped (common paste error)
    const codePart = ln.replace(/(^|[^\\])%.*$/, "$1");
    if (/(^|[^\\&])&(?![a-zA-Z]+;)/.test(codePart) && !/tabular|extracolsep|align|array/.test(src)) {
      issues.push({ level: "warn", msg: `Line ${n}: unescaped "&" (use \\&) unless it is a table column separator.` });
    }
    if (ln.length > 400) issues.push({ level: "warn", msg: `Line ${n}: very long line (${ln.length} chars).` });
  });

  const placeholders = (src.match(/lorem ipsum|Company Name|Your Name|John Doe/gi) || []).length;
  if (placeholders) issues.push({ level: "warn", msg: `${placeholders} placeholder token(s) ("Company Name" / "Your Name" / …).` });

  return issues;
}

function formatIssues(issues) {
  if (!issues.length) return "clean — no lint issues.";
  const errs = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const out = [];
  if (errs.length) out.push(`${errs.length} error(s):`, ...errs.map((e) => `  ✗ ${e.msg}`));
  if (warns.length) out.push(`${warns.length} warning(s):`, ...warns.map((w) => `  • ${w.msg}`));
  return out.join("\n");
}

/* ---------- compile ---------- */
async function compileYtotech(tex, engine) {
  const res = await fetch("https://latex.ytotech.com/builds/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compiler: engine,
      resources: [{ main: true, content: tex }],
    }),
  });
  const ct = res.headers.get("content-type") || "";
  if (res.ok && ct.includes("application/pdf")) {
    return { ok: true, pdf: Buffer.from(await res.arrayBuffer()), service: "ytotech" };
  }
  let log = "";
  try {
    const j = await res.json();
    log = j.logs || j.error || JSON.stringify(j).slice(0, 4000);
  } catch {
    log = (await res.text()).slice(0, 4000);
  }
  return { ok: false, service: "ytotech", status: res.status, log };
}

async function compileTexliveNet(tex, engine) {
  const fd = new FormData();
  fd.append("filecontents[]", tex);
  fd.append("filename[]", "document.tex");
  fd.append("engine", engine);
  fd.append("return", "pdf");
  const res = await fetch("https://texlive.net/cgi-bin/latexcgi", { method: "POST", body: fd });
  const ct = res.headers.get("content-type") || "";
  if (res.ok && ct.includes("application/pdf")) {
    return { ok: true, pdf: Buffer.from(await res.arrayBuffer()), service: "texlive.net" };
  }
  return { ok: false, service: "texlive.net", status: res.status, log: (await res.text()).slice(0, 4000) };
}

/* ---------- overleaf handoff ---------- */
function overleafFormHtml(tex, engine) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<meta charset="utf-8">
<title>Open resume in Overleaf</title>
<body style="font:14px/1.5 system-ui;margin:2rem;max-width:40rem">
<h1>Opening in Overleaf…</h1>
<p>A new Overleaf project should open in a new tab. If it doesn't, click the button.</p>
<form id="f" action="https://www.overleaf.com/docs" method="post" target="_blank">
  <textarea name="snip" hidden>${esc(tex)}</textarea>
  <input type="hidden" name="engine" value="${esc(engine)}">
  <button type="submit" style="padding:.6rem 1rem;font-size:1rem">Open in Overleaf</button>
</form>
<script>setTimeout(function(){document.getElementById('f').submit();},400);</script>
</body>`;
}

/* ---------- server ---------- */
const server = new McpServer({ name: "overleaf-resume", version: "0.1.0" });

server.registerTool(
  "resume_status",
  {
    title: "Resume status",
    description: "Show resolved file paths and whether the working .tex and compiled .pdf exist.",
    inputSchema: {},
  },
  async () => {
    const lines = [];
    for (const [label, p] of [
      ["tex ", TEX_PATH],
      ["pdf ", PDF_PATH],
      ["html", OVERLEAF_HTML_PATH],
    ]) {
      if (existsSync(p)) {
        const s = await stat(p);
        lines.push(`${label}  ${p}  (${s.size} bytes, modified ${s.mtime.toISOString()})`);
      } else {
        lines.push(`${label}  ${p}  (missing)`);
      }
    }
    lines.push(`engine  ${DEFAULT_ENGINE}`);
    if (existsSync(TEX_PATH)) {
      const src = await readTex();
      lines.push(`tex lines: ${src.split("\n").length}`, "", formatIssues(lintTex(src)));
    } else {
      lines.push("", "No working .tex yet — run init_resume_template.");
    }
    return ok(lines.join("\n"));
  },
);

server.registerTool(
  "get_resume_source",
  {
    title: "Get resume source",
    description: "Return the working .tex. Optionally pass from/to (1-indexed line numbers) for a slice.",
    inputSchema: {
      from: z.number().int().positive().optional().describe("first line (1-indexed)"),
      to: z.number().int().positive().optional().describe("last line (inclusive)"),
    },
  },
  async ({ from, to }) => {
    if (!existsSync(TEX_PATH)) return fail(`No file at ${TEX_PATH}. Run init_resume_template first.`);
    const src = await readTex();
    if (!from && !to) return ok(src);
    const lines = src.split("\n");
    const slice = lines.slice((from ?? 1) - 1, to ?? lines.length);
    return ok(slice.map((l, i) => `${(from ?? 1) + i}\t${l}`).join("\n"));
  },
);

server.registerTool(
  "set_resume_source",
  {
    title: "Set resume source",
    description:
      "Overwrite the working .tex with the given content. The previous version is copied to <path>.bak. Returns a lint summary.",
    inputSchema: {
      content: z.string().min(20).describe("the complete .tex document"),
    },
  },
  async ({ content }) => {
    await writeTex(content);
    const issues = lintTex(content);
    return ok(`Wrote ${Buffer.byteLength(content)} bytes to ${TEX_PATH}\nBackup: ${TEX_PATH}.bak\n\n${formatIssues(issues)}`);
  },
);

server.registerTool(
  "init_resume_template",
  {
    title: "Init resume template",
    description:
      "Write the bundled ATS-friendly single-column LaTeX resume template to the working .tex path. Refuses to overwrite unless force=true.",
    inputSchema: {
      force: z.boolean().optional().describe("overwrite an existing working .tex"),
    },
  },
  async ({ force }) => {
    if (existsSync(TEX_PATH) && !force) {
      return fail(`${TEX_PATH} already exists. Pass force=true to overwrite (a .bak is kept).`);
    }
    const tpl = await readFile(TEMPLATE_PATH, "utf8");
    await writeTex(tpl);
    return ok(
      `Wrote template (${Buffer.byteLength(tpl)} bytes) to ${TEX_PATH}\n\n` +
        `Next: fill the %% TODO markers (get_resume_source / set_resume_source), then compile_resume or open_in_overleaf.\n\n` +
        formatIssues(lintTex(tpl)),
    );
  },
);

server.registerTool(
  "lint_resume",
  {
    title: "Lint resume",
    description:
      "Run heuristic checks on the working .tex (or on `content` if given): brace balance, begin/end pairing, stray tabs, unresolved TODOs, unescaped &, long lines, placeholder tokens.",
    inputSchema: {
      content: z.string().optional().describe("lint this text instead of the working file"),
    },
  },
  async ({ content }) => {
    let src = content;
    if (!src) {
      if (!existsSync(TEX_PATH)) return fail(`No file at ${TEX_PATH}.`);
      src = await readTex();
    }
    return ok(formatIssues(lintTex(src)));
  },
);

server.registerTool(
  "compile_resume",
  {
    title: "Compile resume to PDF",
    description:
      "Compile the working .tex via a hosted LaTeX service (ytotech, falling back to texlive.net) and save the PDF. No local LaTeX needed.",
    inputSchema: {
      engine: z.enum(["pdflatex", "xelatex", "lualatex"]).optional().describe(`default ${DEFAULT_ENGINE}`),
      out: z.string().optional().describe(`output PDF path (default ${PDF_PATH})`),
    },
  },
  async ({ engine, out }) => {
    if (!existsSync(TEX_PATH)) return fail(`No file at ${TEX_PATH}. Run init_resume_template first.`);
    const eng = ENGINES.includes((engine || DEFAULT_ENGINE)) ? engine || DEFAULT_ENGINE : DEFAULT_ENGINE;
    const tex = await readTex();
    const outPath = resolve(out || PDF_PATH);

    const preLint = lintTex(tex).filter((i) => i.level === "error");
    if (preLint.length) {
      return fail(`Refusing to compile — ${preLint.length} lint error(s):\n${formatIssues(preLint)}`);
    }

    let r;
    try {
      r = await compileYtotech(tex, eng);
      if (!r.ok) {
        const t = await compileTexliveNet(tex, eng);
        if (t.ok) r = t;
        else {
          return fail(
            `Both services failed.\n\n[ytotech ${r.status}]\n${r.log}\n\n[texlive.net ${t.status}]\n${t.log}`,
          );
        }
      }
    } catch (e) {
      return fail(`Compile request failed: ${e.message}`);
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, r.pdf);
    return ok(`Compiled with ${eng} via ${r.service}.\nSaved ${r.pdf.length} bytes → ${outPath}`);
  },
);

server.registerTool(
  "open_in_overleaf",
  {
    title: "Open in Overleaf",
    description:
      "Write a self-submitting HTML form that POSTs the working .tex to overleaf.com/docs (creates a fresh Overleaf project — no login required to open). Returns the file path to open in a browser, plus a short GET URL when the source is small enough.",
    inputSchema: {
      engine: z.enum(["pdflatex", "xelatex", "lualatex"]).optional(),
      out: z.string().optional().describe(`output HTML path (default ${OVERLEAF_HTML_PATH})`),
    },
  },
  async ({ engine, out }) => {
    if (!existsSync(TEX_PATH)) return fail(`No file at ${TEX_PATH}. Run init_resume_template first.`);
    const eng = ENGINES.includes(engine) ? engine : DEFAULT_ENGINE;
    const tex = await readTex();
    const outPath = resolve(out || OVERLEAF_HTML_PATH);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, overleafFormHtml(tex, eng), "utf8");

    const enc = encodeURIComponent(tex);
    const getUrl = `https://www.overleaf.com/docs?engine=${eng}&encoded_snip=${enc}`;
    const lines = [
      `Wrote ${outPath}`,
      `Open it in a browser (macOS: \`open "${outPath}"\`) — it POSTs to Overleaf and opens a new project.`,
    ];
    if (getUrl.length <= 8000) {
      lines.push("", "Or use this direct link (small enough to fit in a URL):", getUrl);
    } else {
      lines.push("", `(Source too large for a GET link — ${getUrl.length} chars — use the HTML file.)`);
    }
    return ok(lines.join("\n"));
  },
);

await server.connect(new StdioServerTransport());
