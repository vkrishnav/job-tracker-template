import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001
const DATA_FILE = path.join(process.env.HOME, 'Documents', 'job-data.json')

app.use(cors())
app.use(express.json())

// Initialize file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ jobs: [] }, null, 2))
}

// GET /api/jobs — return all jobs
app.get('/api/jobs', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    res.json(data.jobs || [])
  } catch (e) {
    res.json([])
  }
})

// PUT /api/jobs — replace all jobs (full sync)
app.put('/api/jobs', (req, res) => {
  try {
    const jobs = req.body
    fs.writeFileSync(DATA_FILE, JSON.stringify({ jobs }, null, 2))
    res.json({ success: true, count: jobs.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/jobs — add a single job
app.post('/api/jobs', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const job = { ...req.body, id: Date.now().toString() }
    data.jobs.push(job)
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
    res.json(job)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/jobs/:id — update a job
app.patch('/api/jobs/:id', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const idx = data.jobs.findIndex(j => j.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.jobs[idx] = { ...data.jobs[idx], ...req.body }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
    res.json(data.jobs[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/jobs/:id — delete a job
app.delete('/api/jobs/:id', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    data.jobs = data.jobs.filter(j => j.id !== req.params.id)
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`Job tracker API running at http://localhost:${PORT}`)
  console.log(`Data file: ${DATA_FILE}`)
})
