/**
 * DevFlowHub Executor API
 * Runs on Fly.io — receives execute requests from Vercel UI and spawns workspace containers.
 * Vercel never touches Docker; this service does.
 */

import express from 'express'
import cors from 'cors'
import { exec } from 'child_process'

const app = express()
const PORT = process.env.PORT || 8080

app.use(cors({ origin: true }))
app.use(express.json())

// Health check for Fly.io
app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'devflowhub-executor' })
})

/**
 * POST /execute
 * Body: { projectId, executionId, prompt, userId, credits }
 * Responds immediately; execution continues async in container.
 */
app.post('/execute', async (req, res) => {
  const { projectId, executionId, prompt, userId, credits } = req.body || {}

  if (!executionId || !prompt) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['executionId', 'prompt'],
    })
  }

  // Sanitize for shell
  const safeExecutionId = String(executionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const safePrompt = String(prompt).replace(/"/g, '\\"').slice(0, 2000)

  // Respond immediately (fire-and-forget)
  // Fly.io gives one hostname per app (e.g. devflowhub-executor.fly.dev), not per-execution subdomains.
  // So we return the executor URL; real per-execution preview needs Railway/DO or Fly multi-machine.
  const baseUrl = process.env.FLY_APP_NAME
    ? `https://${process.env.FLY_APP_NAME}.fly.dev`
    : (process.env.EXECUTOR_PUBLIC_URL || 'https://devflowhub-executor.fly.dev')
  const previewUrl = `${baseUrl}/logs?executionId=${safeExecutionId}`

  res.json({
    status: 'starting',
    executionId: safeExecutionId,
    previewUrl,
    message: 'Execution started on executor. Container spawning.',
  })

  // Spawn container async (don't await). Pass OPENAI_API_KEY so the agent can call the LLM.
  const agentImage = process.env.AGENT_IMAGE || 'devflowhub/agent-runtime:latest'
  const openaiKey = process.env.OPENAI_API_KEY || ''
  const openaiEnv = openaiKey ? `-e OPENAI_API_KEY="${String(openaiKey).replace(/"/g, '\\"')}"` : ''
  const cmd = `docker run -d --name exec-${safeExecutionId} \
    -p 3000:3000 \
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
      console.error(stderr)
      return
    }
    console.log(`[executor] Spawned container for ${safeExecutionId}:`, stdout?.trim())
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
    <p style="color:#64748b;font-size:0.875rem;margin-top:1.5rem;">App preview (when ready): <a href="http://68.183.83.22:3000" style="color:#f59e0b;">http://68.183.83.22:3000</a></p>
    <p style="color:#64748b;font-size:0.875rem;">Return to <a href="https://devflowhub.com" style="color:#f59e0b;">DevFlowHub</a> to continue.</p>
  </div>
</body>
</html>
      `.trim())
      return
    }
    const lines = logsText ? logsText.trim().split('\n') : []
    res.json({ executionId: safeId, logs: lines, message: logsText ? 'Recent container logs' : 'No logs yet' })
  }

  exec(`docker logs --tail 300 ${containerName} 2>&1`, (err, stdout, stderr) => {
    const out = (stdout || '') + (stderr || '')
    if (err && !out) {
      sendResponse('') // container not found or not started yet
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
})
