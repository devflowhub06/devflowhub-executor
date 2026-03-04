# DevFlowHub Executor (Fly.io)

Runs **real execution** (Docker, agent, preview) off Vercel. Vercel stays UI-only; this service spawns workspace containers and serves previews.

## Architecture

```
[Vercel UI]  --POST /execute-->  [Fly.io Executor]  --docker run-->  [Agent Runtime Container]
                                                                              |
                                                                              v
                                                                        [Preview on :3000]
```

## Quick start

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
# or: winget install flyctl  (Windows)
```

### 2. Login and launch

```bash
cd devflowhub-executor
fly auth login
fly launch --name devflowhub-executor --region bom --no-deploy
```

- Use existing `fly.toml`: **Yes**
- PostgreSQL: **No** (for now)

### 3. Build agent-runtime image (optional, for local Docker testing)

```bash
cd agent-runtime
docker build -t devflowhub/agent-runtime:latest .
cd ..
```

### 4. Deploy executor to Fly.io

```bash
fly deploy
```

### 5. Wire Vercel to executor

In your DevFlowHub UI (Vercel) repo, set:

- **Environment variable:** `EXECUTOR_URL=https://devflowhub-executor.fly.dev`
- In code: when `isRealExecutionEnvironment()` is false but you want to use the remote executor, `POST` to `EXECUTOR_URL/execute` with `{ projectId, executionId, prompt, userId, credits }`.

Executor responds immediately with `{ status: "starting", previewUrl }`; execution runs async in the container.

## API

| Method | Path | Body | Description |
|--------|------|------|--------------|
| GET | `/health` | — | Liveness for Fly |
| POST | `/execute` | `projectId`, `executionId`, `prompt`, `userId?`, `credits?` | Start execution (async) |
| GET | `/logs?executionId=` | — | Placeholder for log streaming |

## Where to deploy (link/status vs real execution)

| Host | Link + status page | Agent container (`docker run`) |
|------|--------------------|---------------------------------|
| **Fly.io** | ✅ Works | ❌ No Docker daemon in the app container |
| **Railway** | ✅ Works | ❌ No Docker daemon |
| **DigitalOcean Droplet** (or any VM) | ✅ Works | ✅ Use host Docker socket so `docker run` works |

- **Fly or Railway:** The executor runs and responds to `/execute` and `/logs`; the **link and status page work**. The `docker run` call does not start the agent container until you run the executor on a host with Docker (e.g. a Droplet).
- **DigitalOcean Droplet:** Run the executor in Docker with `-v /var/run/docker.sock:/var/run/docker.sock`, or run Node on the host next to Docker. Then the agent container starts and real execution works.

**Docs:**

- [Fly.io](docs/DOCKER_SETUP.md) — Docker setup and agent image build/push.
- [Railway](docs/RAILWAY_SETUP.md) — Deploy for API + status page (agent won’t start).
- [DigitalOcean Droplet](docs/DROPLET_SETUP.md) — **Use this for full execution** (agent container runs).

## Docker setup (install + build agent image)

**See [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md)** for step-by-step: install Docker Desktop on Windows → build agent image → test locally → push to registry → set `AGENT_IMAGE` on Fly.

## Agent runtime image

- **Path:** `agent-runtime/`
- **Image:** `devflowhub/agent-runtime:latest`
- **Role:** Receives `PROMPT`, (later) runs Execution Agent, builds app, serves on `PORT` (default 3000).
- **Current:** Placeholder HTTP server so preview URL returns a page; replace `run-agent.js` with your real agent loop.

## Checklist

1. [x] Create repo / folder: `devflowhub-executor`
2. [x] Deploy to Fly.io (or Railway): link and status page work; agent container does not start there.
3. [x] Set Vercel env: `EXECUTOR_URL=https://your-executor-url` (Fly, Railway, or Droplet).
4. [x] Redeploy Vercel so start API uses executor and returns `previewUrl`
5. [ ] **For full execution:** Deploy executor on a **DigitalOcean Droplet** (see [docs/DROPLET_SETUP.md](docs/DROPLET_SETUP.md)); run with Docker socket so `docker run` works.
6. [ ] **Build and push agent image** (see [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md)); set `AGENT_IMAGE` on the executor host.
7. [ ] **Test:** Start an execution from DevFlowHub UI → “Open preview” and (on Droplet) agent container runs.

## Later

- WebSocket or SSE for streaming logs from agent to UI
- Execution DB (Postgres) for status and logs
- Migrate to AWS ECS (same contract, different infra)
