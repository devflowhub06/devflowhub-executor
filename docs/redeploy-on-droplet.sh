#!/bin/bash
# Run this ON the Droplet (after SSH) to redeploy the executor.
# Usage: bash redeploy-on-droplet.sh
# Set these before running, or edit the docker run command at the bottom:
DROPLET_IP="${DROPLET_IP:-68.183.83.22}"
OPENAI_KEY="${OPENAI_API_KEY:-}"

set -e
cd ~/devflowhub-executor || { cd ~ && git clone https://github.com/devflowhub06/devflowhub-executor.git && cd devflowhub-executor; }
git pull origin main

echo "Building executor image (no cache)..."
docker build --no-cache -t devflowhub-executor:latest .

echo "Stopping and removing old container..."
docker stop devflowhub-executor 2>/dev/null || true
docker rm devflowhub-executor 2>/dev/null || true

echo "Starting new executor..."
docker run -d \
  --name devflowhub-executor \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e EXECUTOR_PUBLIC_URL=http://${DROPLET_IP}:8080 \
  -e AGENT_IMAGE=abhinay6319/agent-runtime:latest \
  -e OPENAI_API_KEY="${OPENAI_KEY}" \
  --restart unless-stopped \
  devflowhub-executor:latest

echo "Checking..."
docker ps | grep devflowhub-executor
curl -s http://localhost:8080/health
echo ""
docker logs devflowhub-executor 2>&1 | tail -8
echo ""
echo "Done. Look for: [executor] Dynamic ports enabled: 3000-3099"
