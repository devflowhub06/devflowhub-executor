# DevFlowHub Agent Runtime — container that actually builds/runs the app
# Spawned by the executor. Reads PROMPT, builds project, serves on PORT 3000.
FROM node:18-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=3000
ENV PROMPT=""
ENV EXECUTION_ID=""
ENV PROJECT_ID=""
ENV USER_ID=""

# Minimal runner: for now serve a placeholder; replace with real agent loop later
COPY run-agent.js ./

EXPOSE 3000

CMD ["node", "run-agent.js"]
