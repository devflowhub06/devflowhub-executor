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
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://YOUR_DROPLET_IP:8080 \
  -e AGENT_IMAGE=YOUR_DOCKERHUB_USERNAME/agent-runtime:latest \
  --restart unless-stopped \
  devflowhub-executor:latest
```

- Replace `YOUR_DROPLET_IP` with the Droplet’s public IP (or your domain, e.g. `https://executor.yourdomain.com`).
- Replace `YOUR_DOCKERHUB_USERNAME/agent-runtime:latest` if you use a different agent image.
- For HTTPS with a domain, put a reverse proxy (e.g. Caddy/nginx) in front and set `EXECUTOR_PUBLIC_URL=https://executor.yourdomain.com`.

### 5. Open port 8080

- DigitalOcean: **Networking** → **Firewall** → create a rule: Inbound TCP **8080** (or only from your Vercel IP if you prefer).
- Or in the Droplet creation flow, add a firewall rule for port 8080.

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
