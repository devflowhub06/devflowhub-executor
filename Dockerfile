# DevFlowHub Executor — runs on Fly.io / DO, spawns workspace containers
# Node 18 + Docker CE CLI (new enough for API 1.44) so "docker run" and "docker logs" work
FROM node:18-slim

WORKDIR /app

# Install Docker CE CLI from Docker's repo (avoid old docker.io → "client version 1.41 is too old")
RUN apt-get update && apt-get install -y ca-certificates curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod 0644 /etc/apt/keyrings/docker.asc \
    && . /etc/os-release && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli git \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
