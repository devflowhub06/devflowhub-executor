# Replit-like roadmap — what’s done vs what’s left

This doc maps the “two-mode + executor” plan to the current codebase and lists what’s done and what’s optional next for DevFlowHub to feel like Replit (cause → effect → visibility).

---

## Plan vs current state

| Plan item | Status | Where it lives |
|-----------|--------|----------------|
| **Two modes: Planning (Vercel) vs Real Execution (Fly/DO)** | Done | `system-prompt.ts` (FALLBACK vs REAL_EXECUTION), PlannerService, ExecutionOrchestrator |
| **Planning prompt (Vercel-safe)** | Done | FALLBACK_PROMPT |
| **Real Execution prompt** | Done | `agent-runtime/agent-loop.js` — REAL_EXECUTION_PROMPT |
| **Executor on Droplet** | Done | DigitalOcean Droplet, Docker socket, `EXECUTOR_URL` on Vercel |
| **Executor spawns agent container** | Done | `docker run` with `agent-runtime` image, PROMPT + EXECUTION_ID + OPENAI_API_KEY |
| **Agent container runs Real Execution Agent** | Done | `agent-runtime/run-agent.js` + `agent-loop.js`: LLM loop, write_file, run_command, npm install, start app (npm run dev / npx serve), stdout logs |
| **Dynamic app ports (parallel runs)** | Done | Executor picks free port 3000–3099 per execution, `appPreviewUrl` per run |
| **Real app preview URL** | Done | UI shows “Open app” → `http://DROPLET_IP:PORT` (e.g. :3001, :3006) |
| **Container logs page** | Done | “Open logs” → executor `/logs?executionId=...` (refresh to see latest) |
| **package.json / JSON fixes** | Done | Agent prompt + normalizeJsonContent in agent-loop.js so npm install works |
| **Cause → effect → visibility** | Done | Agent builds → app runs → logs page + app link. Optional: embedded iframe, log streaming. |

---

## What’s done (Replit-like core)

1. **Real Execution Agent in the container**  
   Start from UI → executor spawns container → agent runs LLM with write_file + run_command, creates files, runs `npm install`, then starts the app (`npm run dev` or `npx serve`). Logs go to stdout → visible on executor logs page.

2. **Executor passes OPENAI_API_KEY** into the agent container so the agent can call the LLM.

3. **Per-execution app URL**  
   Each run gets its own port (3000–3099). UI returns `appPreviewUrl` (e.g. `http://68.183.83.22:3006`). User can “Open app” to see the built app.

4. **Static-site friendly**  
   Agent uses plain HTML + `npx serve` for simple landing pages; JSON normalization fixes malformed package.json so npm install succeeds.

---

## Optional improvements (more Replit-like)

| Item | Effort | Description |
|------|--------|-------------|
| **Embedded app preview (iframe)** | Small | In the execution Preview tab, embed the app in an iframe when `appPreviewUrl` is set so the user sees the app inside DevFlowHub without opening a new tab. Fallback to “Open app” link if iframe is blocked (e.g. X-Frame-Options). |
| **Log streaming (SSE/WebSocket)** | Medium | Executor endpoint that streams `docker logs -f exec-<id>` to the browser; UI shows live logs in the execution workspace instead of “refresh to see latest.” |
| **Files / Terminal when on executor** | Medium | Today, Files and Terminal tabs are driven by streamed actions (Vercel). On executor, actions aren’t streamed, so those tabs stay empty. Options: show “Open logs to see files/commands” hint, or add executor API to list container files / tail logs and surface in UI. |
| **HTTPS for executor** | Small | Put Caddy/nginx in front of the droplet and set `EXECUTOR_PUBLIC_URL=https://...` to remove “Not secure” in the browser. |

---

## Summary

- **Done:** Two-mode architecture, real Execution Agent in container, dynamic ports, app preview URL, logs page, JSON normalization, static-site flow. One “Start” → real build → running app → “Open logs” + “Open app.”
- **Optional next:** Embedded app iframe in Preview tab, log streaming, Files/Terminal hints or APIs when on executor, HTTPS for executor.

For step-by-step deployment, see [STEP_BY_STEP_REPLIT_LIKE.md](STEP_BY_STEP_REPLIT_LIKE.md) and [DROPLET_SETUP.md](DROPLET_SETUP.md).
