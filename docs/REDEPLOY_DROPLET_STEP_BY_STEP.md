# Step-by-step: Redeploy executor + agent-runtime on the droplet

Follow these steps in order. Use your Droplet IP (e.g. **68.183.83.22**) and your **OpenAI API key** where indicated.

---

## Step 1 — Push latest code (on your Windows machine)

Open **PowerShell** and run:

```powershell
cd C:\Hanuman\devflowhub-executor
git status
```

- If you see **modified** or **untracked** files you want to deploy, run:

```powershell
git add -A
git commit -m "Executor: log streaming SSE, favicon, HTTPS docs"
git push origin main
```

- If everything is already committed and pushed, you can skip to Step 2.

---

## Step 2 — SSH into the droplet

From PowerShell (or any terminal):

```bash
ssh root@68.183.83.22
```

*(Replace **68.183.83.22** with your Droplet IP if different.)*

When prompted, enter your droplet root password (or use your SSH key). You should see a prompt like `root@your-droplet:~#`.

---

## Step 3 — Go to the executor repo and pull latest

On the droplet (after SSH):

```bash
cd ~/devflowhub-executor
git pull origin main
```

**If the repo is not there yet:**

```bash
cd ~
git clone https://github.com/devflowhub06/devflowhub-executor.git
cd devflowhub-executor
```

Then run `git pull origin main` again (optional, to get latest).

---

## Step 4 — Build the executor image (no cache)

Still on the droplet, in `~/devflowhub-executor`:

```bash
docker build --no-cache -t devflowhub-executor:latest .
```

Wait until you see **Successfully built** and **Successfully tagged devflowhub-executor:latest**. This can take a few minutes.

---

## Step 5 — Build the agent-runtime image (no cache)

The executor runs agent containers from this image. You must rebuild it so new features (log streaming, favicon, JSON fix) are used.

```bash
cd agent-runtime
docker build --no-cache -t abhinay6319/agent-runtime:latest .
cd ..
```

Wait until you see **Successfully built** and **Successfully tagged abhinay6319/agent-runtime:latest**.

*(If you use a different Docker Hub username for the agent image, replace `abhinay6319` with yours and use the same name in Step 7.)*

---

## Step 6 — Stop and remove the old executor container

```bash
docker stop devflowhub-executor
docker rm devflowhub-executor
```

*(If you see "No such container", that's fine — it means it wasn't running.)*

**Optional — free a port if you had "port already allocated":**

```bash
docker ps -a --filter "name=exec-"
```

If you see old `exec-...` containers, stop the one you don't need:

```bash
docker stop <container_name_from_list>
```

---

## Step 7 — Start the new executor container

Set your OpenAI API key in the shell (replace with your real key):

```bash
export OPENAI_API_KEY="sk-your-actual-openai-key-here"
```

Then run (use your Droplet IP; **68.183.83.22** is an example):

```bash
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://68.183.83.22:8080 \
  -e AGENT_IMAGE=abhinay6319/agent-runtime:latest \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  --restart unless-stopped \
  devflowhub-executor:latest
```

**Replace:**

- **68.183.83.22** → your Droplet IP (or domain, e.g. `exec.yourdomain.com` if you set up HTTPS).
- **abhinay6319/agent-runtime:latest** → only if you use a different agent image name.

---

## Step 8 — Verify it’s running

```bash
docker ps
```

You should see **devflowhub-executor** in the list.

```bash
curl -s http://localhost:8080/health
```

You should see: `{"status":"ok","service":"devflowhub-executor"}`.

```bash
docker logs devflowhub-executor 2>&1 | tail -8
```

You should see a line like: **`[executor] Dynamic ports enabled: 3000-3099 (each execution gets its own port)`**.

---

## Step 9 — Test from DevFlowHub

1. Open your DevFlowHub app (e.g. devflowhub.com).
2. Start an execution (e.g. “build me a simple landing page”).
3. You should get:
   - **Live container logs** in the left panel (streaming without refresh).
   - **Open logs** and **Open app** in the Preview tab.
   - App preview in the embedded iframe when the app is ready.

---

## Quick copy-paste block (Steps 3–8 on the droplet)

After SSH (Step 2), you can run this whole block in one go. **Edit the two variables at the top first.**

```bash
# 1) Edit these
export DROPLET_IP="68.183.83.22"
export OPENAI_API_KEY="sk-your-key-here"

# 2) Repo and build
cd ~/devflowhub-executor
git pull origin main
docker build --no-cache -t devflowhub-executor:latest .
cd agent-runtime && docker build --no-cache -t abhinay6319/agent-runtime:latest . && cd ..

# 3) Restart executor
docker stop devflowhub-executor 2>/dev/null; docker rm devflowhub-executor 2>/dev/null
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://${DROPLET_IP}:8080 \
  -e AGENT_IMAGE=abhinay6319/agent-runtime:latest \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  --restart unless-stopped \
  devflowhub-executor:latest

# 4) Check
docker ps
curl -s http://localhost:8080/health
docker logs devflowhub-executor 2>&1 | tail -5
```

---

## If something fails

| Problem | What to do |
|--------|------------|
| **git pull** says "Already up to date" but you just pushed | On Windows, make sure you ran `git push origin main`. On droplet, run `git fetch origin` then `git pull origin main`. |
| **docker build** fails | Run `docker build --no-cache -t ...` again. If it’s a network error, wait and retry. |
| **docker run** fails with "port is already allocated" | Another container is using 8080. Run `docker ps` and stop that container, or stop old `exec-*` containers (Step 6 optional). |
| **No such container** when starting execution | On droplet run `docker logs devflowhub-executor 2>&1 | tail -40` and look for the spawn error. Often: pull the agent image (`docker pull abhinay6319/agent-runtime:latest`) or free the app port. |
| **Live logs not streaming in UI** | Ensure Vercel is redeployed so the frontend uses `logsStreamUrl`. Executor must be the one you just rebuilt (with `/logs/stream`). |

For more details, see [DROPLET_SETUP.md](DROPLET_SETUP.md).
