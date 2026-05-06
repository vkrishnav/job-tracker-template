const API = 'http://localhost:3001/api'

export async function fetchJobs() {
  const res = await fetch(`${API}/jobs`)
  return res.json()
}

export async function saveAllJobs(jobs) {
  await fetch(`${API}/jobs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobs)
  })
}

export async function addJob(job) {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job)
  })
  return res.json()
}

export async function updateJob(id, changes) {
  const res = await fetch(`${API}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes)
  })
  return res.json()
}

export async function deleteJob(id) {
  await fetch(`${API}/jobs/${id}`, { method: 'DELETE' })
}
