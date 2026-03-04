/**
 * Agent Runtime — runs inside the workspace container spawned by the executor.
 * 1. Reads PROMPT env
 * 2. (Later) Runs Execution Agent, builds project, installs deps, starts app
 * 3. For now: starts a minimal HTTP server on PORT so preview URL works
 */

const http = require('http')
const PORT = parseInt(process.env.PORT || '3000', 10)
const PROMPT = process.env.PROMPT || ''
const EXECUTION_ID = process.env.EXECUTION_ID || 'unknown'

// Log to stdout so executor can capture (e.g. docker logs)
function log(msg) {
  const line = `[agent-runtime] ${new Date().toISOString()} ${msg}`
  console.log(line)
}

log(`Starting Agent Runtime (executionId=${EXECUTION_ID})`)
log(`Prompt: ${PROMPT.slice(0, 80)}...`)

// Placeholder HTTP server — replace with real app server once agent builds the project
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>DevFlowHub Preview</title></head>
<body style="font-family:system-ui;max-width:600px;margin:2rem auto;padding:1rem;background:#0a0e1a;color:#e2e8f0;">
  <h1 style="color:#f59e0b;">DevFlowHub Agent Runtime</h1>
  <p>Execution ID: <code>${EXECUTION_ID}</code></p>
  <p>Prompt: <em>${escapeHtml(PROMPT.slice(0, 200))}</em></p>
  <p style="color:#94a3b8;">Preview placeholder. Wire real agent here to build and serve the app.</p>
</body>
</html>
  `.trim())
})

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

server.listen(PORT, '0.0.0.0', () => {
  log(`Preview server listening on port ${PORT}`)
})
