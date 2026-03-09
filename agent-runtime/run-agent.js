/**
 * Agent Runtime — runs inside the workspace container spawned by the executor.
 * 1. Runs the Execution Agent (LLM + write_file, run_command) to build the project.
 * 2. Starts the app (npm run dev) or a placeholder server on PORT.
 */

const http = require('http')
const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')
const { runAgentLoop, log } = require('./agent-loop.js')

const PORT = parseInt(process.env.PORT || '3000', 10)
const PROMPT = process.env.PROMPT || ''
const EXECUTION_ID = process.env.EXECUTION_ID || 'unknown'
const WORKSPACE = '/workspace'

/** Find app root: /workspace, one level down, or two levels down (e.g. create-next-app my-portfolio or nested app). */
function findAppRoot() {
  const rootPkg = path.join(WORKSPACE, 'package.json')
  if (fs.existsSync(rootPkg)) return WORKSPACE
  try {
    const entries = fs.readdirSync(WORKSPACE, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) {
        const subDir = path.join(WORKSPACE, e.name)
        const subPkg = path.join(subDir, 'package.json')
        if (fs.existsSync(subPkg)) return subDir
        // One more level (e.g. workspace/landing/frontend/package.json)
        const subEntries = fs.readdirSync(subDir, { withFileTypes: true })
        for (const e2 of subEntries) {
          if (e2.isDirectory()) {
            const sub2Pkg = path.join(subDir, e2.name, 'package.json')
            if (fs.existsSync(sub2Pkg)) return path.join(subDir, e2.name)
          }
        }
      }
    }
  } catch (_) {}
  return null
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#f59e0b"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="white">D</text></svg>'

function startPlaceholderServer(reason) {
  log(reason || 'No package.json in workspace; starting placeholder server')
  const server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
      res.end(FAVICON_SVG)
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>DevFlowHub Preview</title></head>
<body style="font-family:system-ui;max-width:600px;margin:2rem auto;padding:1rem;background:#0a0e1a;color:#e2e8f0;">
  <h1 style="color:#f59e0b;">DevFlowHub Agent Runtime</h1>
  <p>Execution ID: <code>${EXECUTION_ID}</code></p>
  <p>Prompt: <em>${escapeHtml(PROMPT.slice(0, 200))}</em></p>
  <p style="color:#94a3b8;">Preview placeholder. Agent finished; no app to serve.</p>
</body>
</html>
    `.trim())
  })
  server.listen(PORT, '0.0.0.0', () => {
    log(`Placeholder server listening on port ${PORT}`)
  })
}

async function main() {
  log(`Starting Agent Runtime (executionId=${EXECUTION_ID})`)
  log(`Prompt: ${PROMPT.slice(0, 80)}...`)

  const openaiKey = process.env.OPENAI_API_KEY || ''
  await runAgentLoop(PROMPT, openaiKey)

  const appRoot = findAppRoot()
  if (appRoot) {
    log(`Starting app from ${appRoot} with npm run dev`)
    try {
      execSync('npm run dev', {
        cwd: appRoot,
        stdio: 'inherit',
        env: { ...process.env, PORT: String(PORT) },
      })
    } catch (err) {
      log(`npm run dev failed, trying npm start: ${err.message}`)
      try {
        execSync('npm start', {
          cwd: appRoot,
          stdio: 'inherit',
          env: { ...process.env, PORT: String(PORT) },
        })
      } catch (e) {
        log(`npm start failed: ${e.message}; trying npx serve as fallback`)
        try {
          execSync(`npx --yes serve . -p ${PORT}`, {
            cwd: appRoot,
            stdio: 'inherit',
            env: { ...process.env, PORT: String(PORT) },
          })
        } catch (serveErr) {
          log(`npx serve failed: ${serveErr.message}; starting placeholder`)
          startPlaceholderServer("Package.json has no 'dev' or 'start' script; starting placeholder server")
        }
      }
    }
  } else {
    startPlaceholderServer()
  }
}

main().catch((err) => {
  log(`Agent runtime error: ${err.message}`)
  startPlaceholderServer()
})
