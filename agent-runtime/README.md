# DevFlowHub Agent Runtime

Container image that the executor spawns. Reads `PROMPT`, runs the agent (or placeholder), serves on `PORT` (default 3000).

## Build (local)

```bash
# From devflowhub-executor/agent-runtime
docker build -t devflowhub/agent-runtime:latest .
```

## Run locally (test)

```bash
docker run --rm -p 3000:3000 \
  -e PROMPT="build me a todo app" \
  -e EXECUTION_ID=test-1 \
  devflowhub/agent-runtime:latest
```

Then open http://localhost:3000 — you should see the placeholder page.

## Push to a registry (so Fly.io executor can pull)

If your Docker Hub username is `yourusername`:

```bash
docker tag devflowhub/agent-runtime:latest yourusername/agent-runtime:latest
docker push yourusername/agent-runtime:latest
```

Then on Fly.io set the env var (in dashboard or `flyctl secrets`):

```
AGENT_IMAGE=yourusername/agent-runtime:latest
```

Redeploy the executor after setting `AGENT_IMAGE`.

## Note

On Fly.io, the executor runs inside a container that may not have Docker-in-Docker. If `docker run` fails on Fly, run the executor on Railway or DigitalOcean where you can mount the Docker socket and spawn agent containers.
