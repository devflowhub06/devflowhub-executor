# Run the executor on a DigitalOcean Droplet (Docker works)

On a Droplet (or any VM with Docker), the executor can **actually start the agent container** because it can use the host Docker socket. The link and status page work, and real execution runs.

---

## Why a Droplet?

- **Fly.io** and **Railway** run your app in a container but don’t give you a Docker daemon, so `docker run` from the executor fails (no Docker-in-Docker by default).
- On a **Droplet** you either run the executor in a container with the Docker socket mounted, or run Node on the host next to Docker. In both cases `docker run` works.

---

## Option A: Run executor in Docker (recommended)

Same image as Fly/Railway, but with the host Docker socket mounted so the executor can spawn agent containers.

### 1. Create a Droplet

1. [DigitalOcean](https://cloud.digitalocean.com/) → **Create** → **Droplets**.
2. **Image:** Ubuntu 22.04 LTS.
3. **Plan:** Basic, e.g. $6/mo (1 GB RAM) or higher if you run many containers.
4. **Region:** Pick one close to you.
5. Create the Droplet and note its **IP address**.

### 2. Install Docker on the Droplet

SSH in (replace with your Droplet IP):

```bash
ssh root@YOUR_DROPLET_IP
```

Then:

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io
```

Verify:

```bash
docker run hello-world
```

### 3. Build or pull the executor image

**Option 3a — Build from repo on the Droplet**

```bash
# Clone your repo (or copy files)
git clone https://github.com/YOUR_ORG/devflowhub-executor.git
cd devflowhub-executor
docker build -t devflowhub-executor:latest .
```

**Option 3b — Build locally and push to a registry**

Build and push from your machine (see [DOCKER_SETUP.md](DOCKER_SETUP.md)), then on the Droplet:

```bash
docker login
docker pull YOUR_DOCKERHUB_USERNAME/devflowhub-executor:latest
```

(Use the same image name in the `docker run` below.)

### 4. Run the executor with the Docker socket

So the executor can run `docker run` on the host:

```bash
# Do NOT use -p 3000:3000 here; port 3000 is for the agent container the executor spawns.
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://YOUR_DROPLET_IP:8080 \
  -e AGENT_IMAGE=YOUR_DOCKERHUB_USERNAME/agent-runtime:latest \
  -e OPENAI_API_KEY=your-openai-api-key \
  --restart unless-stopped \
  devflowhub-executor:latest
```

- Replace `YOUR_DROPLET_IP` with the Droplet’s public IP (or your domain, e.g. `https://executor.yourdomain.com`).
- Replace `YOUR_DOCKERHUB_USERNAME/agent-runtime:latest` if you use a different agent image.
- **OPENAI_API_KEY** is required so the agent container can call the LLM to build the app. Set it to your OpenAI API key (or leave unset to skip the agent loop; the container will still start and show a placeholder).
- For HTTPS with a domain, put a reverse proxy (e.g. Caddy/nginx) in front and set `EXECUTOR_PUBLIC_URL=https://executor.yourdomain.com`.

### 5. Open ports 8080 and app port range

- DigitalOcean: **Networking** → **Firewall** → add Inbound rules:
  - TCP **8080** (executor API and logs).
  - TCP **3000–3099** (live app preview; each execution gets its own port for parallel runs).
- Or in the Droplet creation flow, add rules for 8080 and 3000–3099.

### 6. Point Vercel at the executor

In your DevFlowHub Vercel project:

- **Environment variable:** `EXECUTOR_URL=http://YOUR_DROPLET_IP:8080` (or `https://...` if you set up TLS).
- Redeploy the frontend so the start API uses this URL.

---

## Option B: Run Node on the host (no executor container)

You run the executor as a normal Node process; Docker is already on the host, so `docker run` works.

### 1. Create Droplet and install Docker

Same as Option A (steps 1–2).

### 2. Install Node 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
node -v   # should be v18+
```

### 3. Clone and run the executor

```bash
git clone https://github.com/YOUR_ORG/devflowhub-executor.git
cd devflowhub-executor
npm ci --omit=dev
export PORT=8080
export EXECUTOR_PUBLIC_URL=http://YOUR_DROPLET_IP:8080
export AGENT_IMAGE=YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
node index.js
```

To keep it running in the background, use **systemd** or **PM2**, e.g.:

```bash
npm install -g pm2
PORT=8080 EXECUTOR_PUBLIC_URL=http://YOUR_DROPLET_IP:8080 AGENT_IMAGE=... pm2 start index.js --name executor
pm2 save && pm2 startup
```

### 4. Firewall and Vercel

Same as Option A: open port 8080, set `EXECUTOR_URL` on Vercel to `http://YOUR_DROPLET_IP:8080`.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Create Ubuntu Droplet, install Docker (and Node if Option B). |
| 2 | Run executor with Docker socket (Option A) or run `node index.js` on host (Option B). |
| 3 | Set `EXECUTOR_PUBLIC_URL` so preview links use the right base URL. |
| 4 | Set `EXECUTOR_URL` on Vercel to the Droplet URL and redeploy. |

After this, the agent container will start when you trigger execution from the DevFlowHub UI.

---

## Redeploy executor (step-by-step after code changes)

When you pull new executor code (e.g. dynamic ports, container name length fix), follow these steps.

**0. (If you changed code locally) Push executor to GitHub**

From your **local** machine (in the repo that has the executor code):

```bash
cd path/to/devflowhub-executor
git add -A && git commit -m "Executor updates" && git push origin main
```

So the Droplet can pull the latest code. Skip if the code is already on `devflowhub06/devflowhub-executor` main.

**1. SSH into the Droplet**

```bash
ssh root@YOUR_DROPLET_IP
```

When asked "Are you sure you want to continue connecting (yes/no)?", type **yes**, then enter your password if prompted.

**2. Go to the executor repo and pull latest**

```bash
cd ~/devflowhub-executor
git pull origin main
```

If the repo is not there yet:

```bash
cd ~
git clone https://github.com/devflowhub06/devflowhub-executor.git
cd devflowhub-executor
```

**3. Rebuild the executor image (no cache)**

Use **`--no-cache`** so Docker does not reuse old layers and the new `index.js` (dynamic ports) is in the image:

```bash
docker build --no-cache -t devflowhub-executor:latest .
```

Wait until the build finishes without errors.

**4. Stop and remove the old executor container**

```bash
docker stop devflowhub-executor
docker rm devflowhub-executor
```

**4b. (Optional) Free port 3000 if an old agent is still running**

If you had "port is already allocated" before, stop the old agent container:

```bash
docker ps -a --filter "name=exec-"
docker stop exec-cmmdanudi0002ju043ufoong7
```

Use the actual container name from the list. Then new runs can use 3000 or the next free port.

**5. Start the new executor container**

Replace `YOUR_DROPLET_IP` and `YOUR_OPENAI_API_KEY` with your values:

```bash
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://YOUR_DROPLET_IP:8080 \
  -e AGENT_IMAGE=abhinay6319/agent-runtime:latest \
  -e OPENAI_API_KEY=YOUR_OPENAI_API_KEY \
  --restart unless-stopped \
  devflowhub-executor:latest
```

**6. Check that it’s running**

```bash
docker ps
curl -s http://localhost:8080/health
docker logs devflowhub-executor 2>&1 | tail -5
```

You should see: the container in `docker ps`; `{"status":"ok","service":"devflowhub-executor"}` from curl; and in the logs the line **`[executor] Dynamic ports enabled: 3000-3099 (each execution gets its own port)`**. If you see that line, the new code is running. If not, rebuild with `docker build --no-cache`.

**7. If executions still show "No such container"**

The agent container was never created — `docker run` failed. Do this on the Droplet:

**Step 1 — See why it failed**

```bash
docker logs devflowhub-executor 2>&1 | tail -40
```

Look for a line like `[executor] Failed to spawn container for <id>:` and the line right after it (the real error).

**Step 2 — Fix based on the error**

| Error | What to do |
|-------|------------|
| **port is already allocated** | Another run is still using that port. List agent containers: `docker ps -a --filter "name=exec-"`. Stop the one you don’t need: `docker stop <name_or_id>`. Then start a **new** execution from DevFlowHub (don’t reuse the same execution). |
| **No such image** / **pull access denied** | Pull the image: `docker pull abhinay6319/agent-runtime:latest`. If you use a private image, run `docker login` first. |
| **invalid container name** | Redeploy the executor (steps 2–5 above) so you have the latest code (container name length fix). |

**Step 3 — Try again**

Start a **new** execution from the DevFlowHub UI (new prompt or new project). Do not retry the same execution ID; that container name is already used or failed.
