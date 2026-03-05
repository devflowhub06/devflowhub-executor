# DevFlowHub Agent Runtime — container that runs the Execution Agent and builds/serves the app
# Spawned by the executor. Reads PROMPT, runs LLM + tools (write_file, run_command), then npm run dev.
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
# Passed by executor at run time: OPENAI_API_KEY

# Install agent runtime deps (openai)
COPY package.json ./
RUN npm install --omit=dev

COPY run-agent.js agent-loop.js ./

EXPOSE 3000

CMD ["node", "run-agent.js"]
