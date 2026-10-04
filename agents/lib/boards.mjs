// Public ATS job-board fetchers. All three endpoints are unauthenticated and free.
// Each returns a normalized array:
// { source, external_id, company, role_title, location, remote, url, posted_at, updated_at, description, salary_min, salary_max }
import { parseSalary } from './scoring.mjs'

const UA = 'job-tracker-agent/1.0 (+https://github.com/vkrishnav/job-tracker-template)'

async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

/** Greenhouse: list is cheap; content is fetched per matching job (see fetch.mjs) */
export async function fetchGreenhouse(slug, company) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
  return (data.jobs || []).map(j => ({
    source: 'greenhouse',
    external_id: String(j.id),
    company: company || j.company_name || slug,
    role_title: j.title,
    location: j.location?.name || '',
    remote: /remote/i.test(j.location?.name || ''),
    url: j.absolute_url,
    posted_at: j.first_published || j.updated_at,
    updated_at: j.updated_at,
    description: '',
    salary_min: null,
    salary_max: null,
    _needs_content: true,
    _content_url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${j.id}`,
  }))
}

export async function fetchGreenhouseContent(job) {
  try {
    const d = await getJson(job._content_url)
    const desc = stripHtml(d.content || '')
    const sal = parseSalary(desc)
    // Greenhouse pay ranges sometimes live in a dedicated field
    const pr = d.pay_input_ranges?.[0]
    return { ...job, description: desc, salary_min: pr?.min_cents ? pr.min_cents / 100 : sal.min, salary_max: pr?.max_cents ? pr.max_cents / 100 : sal.max, _needs_content: false }
  } catch {
    return { ...job, _needs_content: false }
  }
}

/** Ashby: list includes full plain-text description */
export async function fetchAshby(slug, company) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
  return (data.jobs || []).filter(j => j.isListed !== false).map(j => {
    const desc = j.descriptionPlain || stripHtml(j.descriptionHtml || '')
    const sal = parseSalary(desc)
    return {
      source: 'ashby',
      external_id: String(j.id),
      company: company || slug,
      role_title: j.title,
      location: [j.location, ...(j.secondaryLocations || []).map(s => s.location)].filter(Boolean).join('; '),
      remote: j.isRemote === true || /remote/i.test(j.workplaceType || '') || /remote/i.test(j.location || ''),
      workplace_type: j.workplaceType,
      url: j.jobUrl,
      posted_at: j.publishedAt,
      updated_at: j.publishedAt,
      description: desc,
      salary_min: sal.min,
      salary_max: sal.max,
    }
  })
}

/** Lever: list includes descriptionPlain */
export async function fetchLever(slug, company) {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  return (data || []).map(j => {
    const desc = j.descriptionPlain || stripHtml(j.description || '')
    const sal = parseSalary(desc)
    return {
      source: 'lever',
      external_id: String(j.id),
      company: company || slug,
      role_title: j.text,
      location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('; '),
      remote: /remote/i.test(j.workplaceType || '') || /remote/i.test(j.categories?.location || ''),
      workplace_type: j.workplaceType,
      url: j.hostedUrl || j.applyUrl,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      updated_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description: desc,
      salary_min: sal.min,
      salary_max: sal.max,
    }
  })
}

export async function fetchBoard(entry) {
  const { board, slug, company } = entry
  if (board === 'greenhouse') return fetchGreenhouse(slug, company)
  if (board === 'ashby') return fetchAshby(slug, company)
  if (board === 'lever') return fetchLever(slug, company)
  throw new Error(`Unknown board type: ${board}`)
}
