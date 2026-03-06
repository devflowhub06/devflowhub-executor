# Step-by-step: Get Replit-like execution (full run)

Follow these steps in order. You need: your Windows machine (with Docker and the repo), your Droplet (68.183.83.22), and an OpenAI API key.

---

## Step 1: Build the new agent-runtime image (on your Windows machine)

The agent-runtime now has a real Execution Agent (LLM + write_file + run_command). Build the image locally.

1. Open **PowerShell** and go to the agent-runtime folder:

   ```powershell
   cd C:\Hanuman\devflowhub-executor\agent-runtime
   ```

2. Install Node dependencies (creates `node_modules` and optionally `package-lock.json`):

   ```powershell
   npm install
   ```

3. Build the Docker image:

   ```powershell
   docker build -t devflowhub/agent-runtime:latest .
   ```

   Wait until you see "Successfully built" and "Successfully tagged devflowhub/agent-runtime:latest".

4. *(Optional)* Test locally that the container starts (replace `sk-your-key` with a real key, or leave empty to skip the agent loop):

   ```powershell
   docker run --rm -e PROMPT="create a simple hello world html" -e EXECUTION_ID=test1 -e OPENAI_API_KEY=sk-your-key -p 3000:3000 devflowhub/agent-runtime:latest
   ```

   Stop with **Ctrl+C** when done.

---

## Step 2: Push the image so the Droplet can pull it (on your Windows machine)

The Droplet runs the executor; the executor runs `docker run ... agent-runtime:latest`. So the Droplet must have the image. Either push to Docker Hub and pull on the Droplet, or build on the Droplet (Step 3b).

### Option A — Push to Docker Hub from Windows

1. Log in (if not already):

   ```powershell
   docker login
   ```

   Use your Docker Hub username and password (or token).

2. Tag the image with **your** Docker Hub username (replace `YOUR_DOCKERHUB_USERNAME`):

   ```powershell
   docker tag devflowhub/agent-runtime:latest YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

3. Push:

   ```powershell
   docker push YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

   Remember **YOUR_DOCKERHUB_USERNAME** for Step 4.

### Option B — Build on the Droplet (no Docker Hub)

Skip to Step 3. In Step 3 you will clone the repo on the Droplet and build the image there (see Step 3b).

---

## Step 3: Get the new code and image on the Droplet

Use the **DigitalOcean Droplet Web Console** (or SSH) so you're logged in as `root` on the Droplet.

### Step 3a — If you pushed to Docker Hub (Option A)

1. On the Droplet, log in and pull (replace `YOUR_DOCKERHUB_USERNAME`):

   ```bash
   docker login
   docker pull YOUR_DOCKERHUB_USERNAME/agent-runtime:latest
   ```

### Step 3b — If you're building on the Droplet (Option B)

1. On the Droplet, go to the executor repo and pull the latest code:

   ```bash
   cd ~/devflowhub-executor
   git pull origin main
   ```

2. Build the agent-runtime image:

   ```bash
   cd agent-runtime
   npm install
   docker build -t devflowhub/agent-runtime:latest .
   cd ..
   ```

   Use `YOUR_DOCKERHUB_USERNAME/agent-runtime:latest` instead of `devflowhub/agent-runtime:latest` only if you want to match the executor’s `AGENT_IMAGE` env (see Step 4).

---

## Step 4: Restart the executor with OPENAI_API_KEY and port 3000

On the Droplet, the executor must pass **OPENAI_API_KEY** into the agent container so the Execution Agent can call the LLM. Restart the executor container with the new env and port.

1. Stop and remove the existing executor container:

   ```bash
   docker stop devflowhub-executor
   docker rm devflowhub-executor
   ```

2. Run the executor again. **Replace**:
   - `YOUR_OPENAI_API_KEY` → your real OpenAI API key (starts with `sk-`)
   - `YOUR_DOCKERHUB_USERNAME` → only if you're using Docker Hub and a custom image name; otherwise use `devflowhub/agent-runtime:latest` and omit the `-e AGENT_IMAGE=...` line or keep it as below.

   ```bash
# Only map 8080 for the executor; port 3000 is for the agent container it spawns.
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
     -e EXECUTOR_PUBLIC_URL=http://68.183.83.22:8080 \
     -e AGENT_IMAGE=devflowhub/agent-runtime:latest \
     -e OPENAI_API_KEY=YOUR_OPENAI_API_KEY \
     --restart unless-stopped \
     devflowhub-executor:latest
   ```

   If you used Docker Hub and a custom image:

   ```bash
   -e AGENT_IMAGE=YOUR_DOCKERHUB_USERNAME/agent-runtime:latest \
   ```

3. Check that the executor is running:

   ```bash
   docker ps
   curl -s http://localhost:8080/health
   ```

   You should see the container and `{"status":"ok",...}`.

---

## Step 5: Open port 3000 on the firewall (DigitalOcean dashboard)

So the **live app** from the agent (e.g. http://68.183.83.22:3000) is reachable from the internet.

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com) → **Networking** → **Firewalls**.
2. Click your firewall (e.g. **devflowhub-executor-fw**).
3. Under **Inbound Rules**, click **New rule** (or **Add rule**).
4. Set:
   - **Type:** Custom  
   - **Protocol:** TCP  
   - **Port range:** 3000  
   - **Sources:** All IPv4 (or restrict if you prefer)
5. Save.

---

## Step 6: Commit and push executor code (if you changed it on the Droplet)

If you only pulled and built on the Droplet, the code is already in GitHub. If you changed anything on the Droplet, don’t rely on it — change the code on your Windows machine, commit, and push so the repo is the source of truth.

On **Windows** (if you changed executor or agent-runtime code):

```powershell
cd C:\Hanuman\devflowhub-executor
git add .
git status
git commit -m "Real Execution Agent in agent-runtime, OPENAI_API_KEY and port 3000"
git push origin main
```

---

## Step 7: Test from the DevFlowHub UI

1. Open your **DevFlowHub** app (Vercel URL, e.g. devflowhub.com).
2. Go to a **project** → **Execution**.
3. Enter a prompt, e.g. **"Build a simple marketing landing page with HTML and CSS"**.
4. Click **Start** (or **Execute**).
5. You should get **"Open preview"** that points to:
   - `http://68.183.83.22:8080/logs?executionId=...` (status page).
6. Wait 1–2 minutes for the agent to create files, run `npm install`, and start the app.
7. Open a **new tab** and go to:
   - **http://68.183.83.22:3000**
   You should see the **real app** the agent built (or a placeholder if the agent didn’t produce a runnable app yet).
8. To see agent logs on the Droplet:
   ```bash
   docker ps
   docker logs -f exec-<executionId>
   ```
   (Replace `<executionId>` with the ID from the URL, e.g. `cmmbpfbom0001la04d87lyj12`.)

---

## Checklist

- [ ] Step 1: Built `devflowhub/agent-runtime:latest` on Windows (`npm install` + `docker build`).
- [ ] Step 2: Pushed to Docker Hub (Option A) **or** decided to build on Droplet (Option B).
- [ ] Step 3: On Droplet — pulled image (Option A) **or** pulled repo + built agent-runtime (Option B).
- [ ] Step 4: Restarted executor with `OPENAI_API_KEY` and `-p 3000:3000`.
- [ ] Step 5: Opened port **3000** in the DigitalOcean firewall.
- [ ] Step 6: Pushed any code changes from Windows to GitHub.
- [ ] Step 7: Started an execution from the UI and opened http://68.183.83.22:3000 for the app.

---

## If something fails

- **"Failed to spawn container"** on executor: Check `docker logs devflowhub-executor`. Often port 3000 is already in use (another container). Stop other containers or remove `-p 3000:3000` to run without exposing the app.
- **Agent container exits quickly:** Run `docker logs exec-<id>`. If you see "OPENAI_API_KEY not set", the executor wasn’t started with `-e OPENAI_API_KEY=...`.
- **No app on :3000:** The agent may still be running or may have failed. Run `docker logs -f exec-<id>` and check for errors (e.g. npm install failed, or no `npm run dev` in package.json).
