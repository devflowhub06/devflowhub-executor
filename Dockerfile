# DevFlowHub Executor — runs on Fly.io, spawns workspace containers
# Node 18 + Docker CLI so this container can run "docker run" (DinD / sibling containers)
FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    docker.io \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
