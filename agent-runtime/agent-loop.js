/**
 * Execution Agent — runs inside the container with REAL_EXECUTION_PROMPT.
 * Uses OpenAI with tools: write_file, run_command. Logs to stdout for docker logs.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const OpenAI = require('openai').default

const WORKSPACE = '/workspace'

const REAL_EXECUTION_PROMPT = `You are DevFlowHub's Autonomous Software Engineer.

You are running inside a dedicated Docker container
with full filesystem access and long-running process support.

YOUR MISSION:
Take a single user prompt and autonomously deliver
a running, production-ready application.

EXECUTION RULES:
1. Treat the prompt as a locked product contract.
2. Convert it into a concrete product specification.
3. Decide the optimal tech stack automatically.
4. Initialize a clean workspace directory (all paths are under /workspace).
5. Write production-grade, multi-file code using the write_file tool.
6. Install all required dependencies using run_command (e.g. npm install).
7. Run tests and fix failures automatically.
8. Do NOT run npm run dev or npm start yourself; only run npm install, npx create-*, npm run build, etc. The runtime will start the dev server after you finish.
9. REQUIRED: In package.json always add a "dev" and/or "start" script that runs the app (e.g. dev server or static server). The app must listen on port 3000 (use PORT from env or --port 3000). Without these scripts the preview cannot start.
10. For simple static sites (landing page, portfolio, single-page): use plain HTML/CSS/JS and a static server. Add scripts like "dev": "npx serve . -p 3000" and "start": "npx serve . -p 3000". Do NOT use webpack for simple static sites—it often fails in this environment.
11. Only run one-off commands (npm install, npm run build, npx webpack). Do NOT run long-running or watch commands (e.g. webpack --watch); they will timeout. The runtime will start the dev server after you finish.
12. The preview server will listen on port 3000.
13. Log every action in real time.
14. ASSETS: Do not reference images or files you do not create (e.g. /logo.png). For logos or icons use inline SVG, emoji, or text so nothing 404s. If you add an img src, the file must exist in the workspace and be written by you.

You have two tools:
- write_file: path (relative to /workspace), content (string). Create or overwrite files.
- run_command: command (string). Run in /workspace. Use for npm install, npx create-next-app, npm run dev, etc.

LOG FORMAT (MANDATORY):
Logs must represent REAL execution. After each tool use, briefly state what you did.

FAILURE HANDLING:
- Diagnose errors automatically. Retry with run_command if install or build fails.
- If a build (e.g. webpack) fails repeatedly, switch to a simpler approach (e.g. static HTML + npx serve) instead of retrying the same failing build.
- Never stop unless execution is impossible.

When all files are written, dependencies installed, and build (if any) has run successfully, respond with a short final message that includes "Ready for preview server" and do not call more tools.`

function log(msg) {
  const line = `[agent] ${new Date().toISOString()} ${msg}`
  console.log(line)
}

function safePath(relativePath) {
  const resolved = path.resolve(WORKSPACE, relativePath)
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error('Path must be inside workspace')
  }
  return resolved
}

function writeFile(args) {
  const { path: filePath, content } = args
  const fullPath = safePath(filePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf8')
  log(`Wrote ${filePath}`)
  return { success: true, path: filePath }
}

function runCommand(args) {
  const { command } = args
  if (!command || typeof command !== 'string') {
    return { success: false, error: 'command required' }
  }
  const blocked = ['rm -rf /', 'mkfs', ':(){', 'chmod 777', '> /dev/sda']
  const lower = command.toLowerCase()
  if (blocked.some(b => lower.includes(b))) {
    return { success: false, error: 'Blocked command' }
  }
  try {
    log(`Run: ${command}`)
    const out = execSync(command, {
      cwd: WORKSPACE,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 120000,
    })
    log(`Done: ${command}`)
    return { success: true, stdout: out ? out.slice(-2000) : '' }
  } catch (err) {
    const stderr = (err.stderr || err.message || '').slice(-1500)
    log(`Command failed: ${command} - ${stderr}`)
    return { success: false, error: stderr }
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace. Path is relative to /workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path, e.g. package.json or src/App.jsx' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace (e.g. npm install, npm run dev).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
        },
        required: ['command'],
      },
    },
  },
]

async function runAgentLoop(prompt, openaiApiKey) {
  if (!openaiApiKey) {
    log('OPENAI_API_KEY not set; skipping agent loop')
    return false
  }

  const openai = new OpenAI({ apiKey: openaiApiKey })
  fs.mkdirSync(WORKSPACE, { recursive: true })

  const messages = [
    { role: 'system', content: REAL_EXECUTION_PROMPT },
    { role: 'user', content: prompt },
  ]

  const maxRounds = 25
  for (let round = 0; round < maxRounds; round++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 4096,
    })

    const choice = response.choices[0]
    if (!choice) break
    messages.push(choice.message)

    const toolCalls = choice.message.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      const content = choice.message.content || ''
      log(`Agent message: ${content.slice(0, 200)}`)
      if (content.includes('Ready for preview') || content.includes('preview server')) {
        return true
      }
      break
    }

    for (const tc of toolCalls) {
      const name = tc.function.name
      const args = JSON.parse(tc.function.arguments || '{}')
      let result
      if (name === 'write_file') result = writeFile(args)
      else if (name === 'run_command') result = runCommand(args)
      else result = { error: 'Unknown tool' }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }
  }

  return true
}

module.exports = { runAgentLoop, log }
