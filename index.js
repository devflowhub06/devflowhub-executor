/**
 * DevFlowHub Executor API
 * Runs on Fly.io — receives execute requests from Vercel UI and spawns workspace containers.
 * Vercel never touches Docker; this service does.
 */

import express from 'express'
import cors from 'cors'
import { exec, execSync } from 'child_process'

const app = express()
const PORT = process.env.PORT || 8080

// Per-execution app port (so multiple users can run in parallel)
const APP_PORT_MIN = parseInt(process.env.APP_PORT_MIN || '3000', 10)
const APP_PORT_MAX = parseInt(process.env.APP_PORT_MAX || '3099', 10)
const executionAppPorts = new Map() // executionId -> host port

/** Get host ports currently in use by docker containers (e.g. 3000, 3001). */
function getUsedAppPorts() {
  const used = new Set()
  const portRe = /0\.0\.0\.0:(\d+)->\d+\/tcp/g
  try {
    const out = execSync('docker ps --format "{{.Ports}}"', { encoding: 'utf8', timeout: 5000 })
    for (const line of out.split('\n')) {
      for (const m of line.matchAll(portRe)) used.add(parseInt(m[1], 10))
    }
  } catch (e1) {
    try {
      const out = execSync('docker ps', { encoding: 'utf8', timeout: 5000 })
      for (const m of out.matchAll(portRe)) used.add(parseInt(m[1], 10))
    } catch (_) {}
  }
  return used
}

/** Pick first free port in [APP_PORT_MIN, APP_PORT_MAX] for a new execution. */
function pickFreeAppPort() {
  const used = getUsedAppPorts()
  for (let p = APP_PORT_MIN; p <= APP_PORT_MAX; p++) {
    if (!used.has(p)) return p
  }
  return null
}

app.use(cors({ origin: true }))
app.use(express.json())

// Health check for Fly.io
app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'devflowhub-executor' })
})

/**
 * POST /execute
 * Body: { projectId, executionId, prompt, userId, credits }
 * Assigns a unique host port per execution so multiple users can run in parallel.
 */
app.post('/execute', async (req, res) => {
  const { projectId, executionId, prompt, userId, credits } = req.body || {}

  if (!executionId || !prompt) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['executionId', 'prompt'],
    })
  }

  // Docker container names are limited to 63 chars; we use "exec-" (5) + id
  const safeExecutionId = String(executionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 58)
  const safePrompt = String(prompt).replace(/"/g, '\\"').slice(0, 2000)

  const appPort = pickFreeAppPort()
  if (appPort == null) {
    return res.status(503).json({
      error: 'No free app port',
      message: 'All app ports in use. Try again later or increase APP_PORT_MAX.',
    })
  }
  console.log(`[executor] Picked port ${appPort} for ${safeExecutionId}`)

  const baseUrl = process.env.FLY_APP_NAME
    ? `https://${process.env.FLY_APP_NAME}.fly.dev`
    : (process.env.EXECUTOR_PUBLIC_URL || 'https://devflowhub-executor.fly.dev')
  const previewUrl = `${baseUrl.replace(/\/$/, '')}/logs?executionId=${safeExecutionId}`
  const host = baseUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
  const protocol = baseUrl.startsWith('https') ? 'https' : 'http'
  const appPreviewUrl = `${protocol}://${host}:${appPort}`

  executionAppPorts.set(safeExecutionId, appPort)

  res.json({
    status: 'starting',
    executionId: safeExecutionId,
    previewUrl,
    appPreviewUrl,
    message: 'Execution started on executor. Container spawning.',
  })

  const agentImage = process.env.AGENT_IMAGE || 'devflowhub/agent-runtime:latest'
  const openaiKey = process.env.OPENAI_API_KEY || ''
  const openaiEnv = openaiKey ? `-e OPENAI_API_KEY="${String(openaiKey).replace(/"/g, '\\"')}"` : ''
  const cmd = `docker run -d --name exec-${safeExecutionId} \
    -p ${appPort}:3000 \
    -e EXECUTION_ID=${safeExecutionId} \
    -e PROMPT="${safePrompt}" \
    -e PROJECT_ID=${projectId || ''} \
    -e USER_ID=${userId || ''} \
    ${openaiEnv} \
    --rm \
    ${agentImage}`

  exec(cmd, { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[executor] Failed to spawn container for ${safeExecutionId}:`, err.message)
      if (stderr) console.error('[executor] stderr:', stderr)
      executionAppPorts.delete(safeExecutionId)
      return
    }
    console.log(`[executor] Spawned container for ${safeExecutionId} on port ${appPort}:`, stdout?.trim())
  })
})

/**
 * GET /logs?executionId=xxx
 * Returns execution status and recent container logs (if container exists).
 * Browser gets HTML; API clients get JSON. Refresh the page to see latest logs.
 */
app.get('/logs', (req, res) => {
  const { executionId } = req.query
  if (!executionId) {
    return res.status(400).json({ error: 'Missing executionId' })
  }
  const safeId = String(executionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const containerName = `exec-${safeId}`

  const appPort = executionAppPorts.get(safeId)
  const baseUrl = process.env.EXECUTOR_PUBLIC_URL || 'http://localhost:8080'
  const host = baseUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
  const protocol = baseUrl.startsWith('https') ? 'https' : 'http'
  const appPreviewUrl = appPort != null ? `${protocol}://${host}:${appPort}` : `${protocol}://${host}:3000`

  const sendResponse = (logsText) => {
    const accept = (req.headers.accept || '').toLowerCase()
    const logsHtml = logsText
      ? `<pre style="background:#1e293b;padding:1rem;border-radius:8px;overflow:auto;max-height:60vh;font-size:0.8rem;white-space:pre-wrap;">${escapeHtml(logsText)}</pre><p style="color:#64748b;font-size:0.875rem;">Refresh to see latest logs.</p>`
      : '<p style="color:#94a3b8;">No logs yet (container may still be starting). Refresh in a few seconds.</p>'

    if (accept.includes('text/html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Execution ${safeId}</title></head>
<body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;margin:0;padding:2rem;min-height:100vh;">
  <div style="max-width:720px;margin:0 auto;">
    <h1 style="color:#f59e0b;font-size:1.25rem;">DevFlowHub Executor</h1>
    <p style="color:#94a3b8;">Execution ID: <code style="background:#1e293b;padding:2px 6px;border-radius:4px;">${safeId}</code></p>
    <p style="color:#94a3b8;">Status: execution started on executor.</p>
    <h2 style="color:#e2e8f0;font-size:1rem;margin-top:1.5rem;">Container logs</h2>
    ${logsHtml}
    <p style="color:#64748b;font-size:0.875rem;margin-top:1.5rem;">App preview (when ready): <a href="${appPreviewUrl}" style="color:#f59e0b;">${appPreviewUrl}</a></p>
    <p style="color:#64748b;font-size:0.875rem;">Return to <a href="https://devflowhub.com" style="color:#f59e0b;">DevFlowHub</a> to continue.</p>
  </div>
</body>
</html>
      `.trim())
      return
    }
    const lines = logsText ? logsText.trim().split('\n') : []
    res.json({ executionId: safeId, logs: lines, appPreviewUrl, message: logsText ? 'Recent container logs' : 'No logs yet' })
  }

  exec(`docker logs --tail 300 ${containerName} 2>&1`, (err, stdout, stderr) => {
    const out = (stdout || '') + (stderr || '')
    const noContainer = err && /No such container/i.test(out)
    if (noContainer) {
      const hint = `Container did not start — "docker run" failed on the executor host.

WHAT TO DO (on the Droplet, via SSH):

1. See why it failed:
   docker logs devflowhub-executor 2>&1 | tail -40
   Look for "[executor] Failed to spawn container for ..." and the error line below it.

2. Common causes and fixes:
   • "port is already allocated" → Another agent is still running. List them:
     docker ps -a --filter "name=exec-"
     Stop the one using the port, or wait for it to finish:
     docker stop <container_name_or_id>
   • "No such image" / "pull access denied" → Pull the agent image and ensure Docker Hub login:
     docker pull abhinay6319/agent-runtime:latest
   • "invalid container name" → Should not happen (name is truncated to 58 chars). If it does, redeploy the executor.

3. Then try a new execution from DevFlowHub (do not retry the same execution ID).`
      sendResponse(hint)
    } else if (err && !out) {
      sendResponse('') // container not started yet
    } else {
      sendResponse(out.trim() || '')
    }
  })
})

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DevFlowHub Executor running on port ${PORT}`)
  console.log(`[executor] Dynamic ports enabled: ${APP_PORT_MIN}-${APP_PORT_MAX} (each execution gets its own port)`)
})
