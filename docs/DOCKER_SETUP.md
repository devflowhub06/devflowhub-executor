# Docker setup — next steps for DevFlowHub executor

Use this to install Docker on Windows and build/push the agent-runtime image.

---

## Step 1: Install Docker Desktop on Windows

### Option A — Microsoft Store (simplest)

1. Open **Microsoft Store**.
2. Search for **Docker Desktop**.
3. Click **Get** / **Install**.
4. When installation finishes, **launch Docker Desktop**.
5. Accept the terms; wait until it says “Docker Desktop is running” (whale icon in system tray).

### Option B — Direct download

1. Go to: **https://docs.docker.com/desktop/setup/install/windows/**
2. Download **Docker Desktop for Windows**.
3. Run the installer; use default options.
4. When prompted, choose **Use WSL 2** (recommended).
5. Restart if asked, then open **Docker Desktop** and wait until it’s running.

### Check that Docker works

Open **PowerShell** or **Command Prompt** and run:

```powershell
docker --version
docker run hello-world
```

You should see the Docker version and a “Hello from Docker!” message.

---

## Troubleshooting: “TLS handshake timeout” when pulling from Docker Hub

If `docker run hello-world` or `docker build` fails with **`net/http: TLS handshake timeout`** or **`failed to fetch oauth token`**, Docker can’t reach Docker Hub. Try these in order:

### 1. Retry on a different network
- Switch to mobile hotspot or another Wi‑Fi and run the same command again.
- Sometimes Docker Hub or your ISP has short-lived issues.

### 2. Turn off VPN
- If you use a VPN, disconnect it and try again. VPNs often block or slow Docker Hub.

### 3. Use Google DNS (often fixes timeouts)
- **Windows:** Settings → Network & Internet → your connection → Edit (IP assignment) → set DNS to **8.8.8.8** and **8.8.4.4**, or:
- **PowerShell (Admin):**  
  `Get-NetAdapter | Set-DnsClientServerAddress -ServerAddresses ("8.8.8.8","8.8.4.4")`
- Restart Docker Desktop, then run `docker run hello-world` again.

### 4. Allow Docker through firewall
- Windows Security → Firewall → “Allow an app” → ensure **Docker Desktop** is allowed on Private and Public.
- Or temporarily disable the firewall only to test (re-enable after).

### 5. Configure Docker Desktop to use a mirror (if in India/restricted region)
- Docker Desktop → **Settings** (gear) → **Docker Engine**.
- Add a registry mirror in the JSON, for example:
  ```json
  "registry-mirrors": ["https://mirror.gcr.io"]
  ```
- Apply & Restart, then try `docker build` again.

### 6. Build and push from the cloud instead
If your machine still can’t reach Docker Hub, build the image in the cloud and push from there:
- **GitHub Actions:** Push your `agent-runtime` folder to a repo and add a workflow that runs `docker build` and `docker push` (Actions run on GitHub’s network).
- **Fly.io or Railway:** Some platforms can build from a Dockerfile in your repo so you don’t need to build locally.

Once `docker run hello-world` works, the same network path will work for `docker build` and `docker push`.

---

## Step 2: Build the agent-runtime image

From the repo root (or from `devflowhub-executor`):

```powershell
cd C:\Hanuman\devflowhub-executor\agent-runtime
docker build -t devflowhub/agent-runtime:latest .
```

You should see “Successfully built” and “Successfully tagged devflowhub/agent-runtime:latest”.

---

## Step 3: Test the image locally

Run the container and open the preview in your browser:

```powershell
docker run --rm -p 3000:3000 -e PROMPT="build me a todo app" -e EXECUTION_ID=test-1 devflowhub/agent-runtime:latest
```

Then open **http://localhost:3000** in your browser. You should see the DevFlowHub Agent Runtime placeholder page.  
Stop the container with **Ctrl+C**.

---

## Step 4: Push image to a registry (for the executor to use)

The Fly.io executor runs `docker run devflowhub/agent-runtime:latest`. For that to work, the image must be in a registry the executor can pull from.

### Using Docker Hub

1. Create an account at **https://hub.docker.com** (if you don’t have one).
2. Log in from your machine:

   ```powershell
   docker login
   ```
   Enter your Docker Hub username and password.

3. Tag the image with your username (replace `YOUR_DOCKERHUB_USERNAME`):

   ```powershell
   docker tag devflowhub/agent-runtime:latest YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

4. Push:

   ```powershell
   docker push YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

5. Tell the executor to use this image.  
   On **Fly.io** (if your app runs there), set the env var:

   ```powershell
   cd C:\Hanuman\devflowhub-executor
   flyctl secrets set AGENT_IMAGE=YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

   Then redeploy so the new secret is used:

   ```powershell
   flyctl deploy
   ```

---

## Step 5: Test the full flow

1. Open your **DevFlowHub** app (Vercel URL).
2. Go to a project → **Execution**.
3. Start an execution.
4. In the **Preview** tab, check for the **“Open preview”** button (when the start API returns a `previewUrl` from the executor).

**Note:** On Fly.io (and Railway), the executor has no Docker daemon, so `docker run` does not start the agent container. The link and status page still work. To get the agent container running, deploy the executor on a **DigitalOcean Droplet** (or any VM with Docker) and mount the Docker socket — see [DROPLET_SETUP.md](DROPLET_SETUP.md).

---

## Quick reference

| Goal                    | Command |
|-------------------------|--------|
| Install Docker          | Microsoft Store → “Docker Desktop” or download from docker.com |
| Check Docker            | `docker --version` and `docker run hello-world` |
| Build agent image       | `cd agent-runtime` then `docker build -t devflowhub/agent-runtime:latest .` |
| Run agent locally       | `docker run --rm -p 3000:3000 -e PROMPT="todo app" -e EXECUTION_ID=test-1 devflowhub/agent-runtime:latest` |
| Push to Docker Hub      | `docker tag ...` then `docker push YOUR_USERNAME/agent-runtime:latest` |
| Set image on Fly        | `flyctl secrets set AGENT_IMAGE=YOUR_USERNAME/agent-runtime:latest` |
