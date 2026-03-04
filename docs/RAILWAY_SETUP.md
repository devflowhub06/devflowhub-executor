# Run the executor on Railway

Railway is a simple way to host the executor so the **link and status page** work. The API and `/logs` (HTML or JSON) work as on Fly.io.

**Important:** Railway does not expose a Docker daemon or socket to your app. So `docker run` from inside the executor **will not start the agent container**. For full execution (agent container actually running), use a [DigitalOcean Droplet](DROPLET_SETUP.md) (or any VM with Docker socket) instead.

---

## When to use Railway

- You want a quick, free/low-cost host for the executor API.
- You’re okay with “Execution started” and the preview/logs page, but the agent container not actually running.
- You plan to move to a Droplet (or similar) later for real execution and will only change `EXECUTOR_URL` on Vercel.

---

## Deploy steps

### 1. Install Railway CLI (optional)

```bash
npm i -g @railway/cli
railway login
```

Or use the [Railway dashboard](https://railway.app/) and connect your repo.

### 2. Create a project and deploy

**From the dashboard:**

1. Go to [railway.app](https://railway.app/) → **New Project**.
2. **Deploy from GitHub repo** (or upload the `devflowhub-executor` folder).
3. Select the repo and the root of `devflowhub-executor` (or the folder that contains `Dockerfile` and `index.js`).
4. Railway will detect the **Dockerfile** and build the image, then run it.
5. Open **Settings** → **Networking** → **Generate Domain** so the service gets a public URL, e.g. `devflowhub-executor-production-xxxx.up.railway.app`.

**From the CLI (from the executor directory):**

```bash
cd devflowhub-executor
railway init
railway up
railway domain
```

Use the printed URL as your executor base URL.

### 3. Set environment variables

In the Railway project → your service → **Variables**:

| Variable | Value |
|----------|--------|
| `EXECUTOR_PUBLIC_URL` | Your Railway public URL, e.g. `https://devflowhub-executor-production-xxxx.up.railway.app` |
| `AGENT_IMAGE` | (Optional) Your agent image, e.g. `YOUR_DOCKERHUB_USERNAME/agent-runtime:latest` (only needed when you later run on a host with Docker) |

Redeploy after changing variables.

### 4. Point Vercel at the executor

In your DevFlowHub Vercel project:

- **Environment variable:** `EXECUTOR_URL=https://your-railway-app.up.railway.app`
- Redeploy so the start API uses this URL.

---

## What works on Railway

- **POST /execute** — Returns immediately with `previewUrl` and `executionId`.
- **GET /logs?executionId=xxx** — Returns the status page (HTML in browser, JSON for API).
- **GET /health** — Returns `{ status: "ok" }`.

The **agent container will not start** because there is no Docker daemon. For real execution, use a [Droplet](DROPLET_SETUP.md) and set `EXECUTOR_URL` to the Droplet URL.
