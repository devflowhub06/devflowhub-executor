# Replit-like roadmap — what’s done vs what’s missing

This doc maps the “two-mode + executor” plan to the current codebase and lists concrete next steps so DevFlowHub behaves like Replit (cause → effect → visibility).

---

## Plan vs current state

| Plan item | Status | Where it lives |
|-----------|--------|----------------|
| **Two modes: Planning (Vercel) vs Real Execution (Fly/DO)** | Done | `system-prompt.ts` (FALLBACK vs REAL_EXECUTION), `PlannerService` (file-only on Vercel), `ExecutionOrchestrator` (skips docker/commands on Vercel) |
| **Backend switch: vercel → Planning prompt, else Execution prompt** | Done | `getSystemPrompt()`, `isRealExecutionEnvironment()` in `system-prompt.ts` |
| **Planning prompt (Vercel-safe, no Docker)** | Done | `FALLBACK_PROMPT` |
| **Real Execution prompt (Replit-level)** | Done (text only) | `REAL_EXECUTION_PROMPT` — used when env is “real”; **not yet used inside container** |
| **Executor on Fly / Railway / DO** | Done | Executor on DigitalOcean Droplet, Docker socket, `EXECUTOR_URL` on Vercel |
| **Executor spawns agent container** | Done | `docker run` with `agent-runtime` image, `PROMPT` + `EXECUTION_ID` passed |
| **Agent container runs Real Execution Agent** | Missing | `agent-runtime/run-agent.js` is a **placeholder** HTTP server. It does not run an LLM loop, create files, or run commands. |
| **Cause → effect → visibility** | Partial | Agent activity feed ✅, credits ✅, execution narrative ✅. **Missing:** real-time logs from container, real app preview (iframe or link to app port). |

---

## Why it doesn’t “feel like Replit” yet

1. **Execution Agent never runs in the container**  
   When you click Start, Vercel POSTs to the executor → executor runs `docker run ... agent-runtime`. The container only starts a small HTTP server that shows a placeholder. It does **not**:
   - Call the LLM with `REAL_EXECUTION_PROMPT` + user prompt  
   - Create files in `/workspace`  
   - Run `npm install` / `npm run dev`  
   - Start the real app

2. **No live logs from the container**  
   The “Open preview” link goes to the executor’s `/logs` page (static status). There is no WebSocket or SSE streaming `docker logs` from the agent container into the UI.

3. **Preview URL is status, not the app**  
   Preview points to `executor/logs?executionId=...`, not to the app running inside the container (e.g. port 3000). Showing the real app would require exposing the container’s port (e.g. map host:3000 or dynamic ports) and optionally a reverse proxy.

---

## Next steps (in order)

### 1. Real Execution Agent inside the container (critical)

- **Where:** `devflowhub-executor/agent-runtime/`
- **What:** Replace the placeholder with an agent that:
  - Reads `PROMPT` and `OPENAI_API_KEY` (executor must pass the key into the container).
  - Uses `REAL_EXECUTION_PROMPT` as system message and runs an LLM loop with tools:
    - `write_file`: create/update files under `/workspace`
    - `run_command`: run safe commands (e.g. `npm install`, `npm run build`, `npx create-next-app`) in `/workspace`
  - Logs every action to stdout (so `docker logs` captures it).
  - After building, runs the app (e.g. `npm run dev` or `npm start`) so the container serves the app on port 3000.
- **Result:** One “Start” from the UI leads to a real build and a running app inside the container.

### 2. Executor passes `OPENAI_API_KEY` into the container

- **Where:** `devflowhub-executor/index.js` (the `docker run` command).
- **What:** Add `-e OPENAI_API_KEY=...` when spawning the agent container (e.g. from `process.env.OPENAI_API_KEY` on the executor). Keep the key only in the executor’s env and in the container; do not expose it to the client.
- **Result:** The agent inside the container can call the LLM.

### 3. (Optional) Log streaming

- **Where:** Executor (e.g. new endpoint or upgrade `/logs`) + optional UI in DevFlowHub.
- **What:** Executor runs `docker logs -f exec-<id>` and streams output via SSE or WebSocket to the browser. UI shows a live log stream in the Preview / Agent Activity area.
- **Result:** “Cause → effect → visibility” feels like Replit’s console.

### 4. (Later) Real app preview URL

- **Where:** Executor + Docker port mapping (and optionally reverse proxy).
- **What:** The executor already maps `-p 3000:3000` for the agent container so a single running execution serves the app at `http://DROPLET_IP:3000`. Only one execution can use port 3000 at a time; for multiple concurrent executions you’d need dynamic ports (3001, 3002…) and a way to route “Open preview” to the right port.
- **Result:** For one execution at a time, open `http://YOUR_DROPLET_IP:3000` after the agent finishes to see the real app. “Open preview” in the UI still points to the executor `/logs` page; you can later change it to open the app URL when available.

---

## Summary

- **Done:** Two-mode architecture, planning on Vercel, executor on Droplet, container spawn, prompts and backend switch.
- **Missing for Replit-like:** A **real Execution Agent inside the agent-runtime container** (LLM + `write_file` + `run_command` + start app + stdout logs), executor passing **OPENAI_API_KEY** into the container, and optionally **log streaming** and **real app preview URL**.

Implementing step 1 (and 2) is the single biggest step to make DevFlowHub behave like Replit.

**Ready to do it?** Follow [STEP_BY_STEP_REPLIT_LIKE.md](STEP_BY_STEP_REPLIT_LIKE.md) from start to finish.
