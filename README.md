# Sentient Flow

A lightweight, open-source workflow automation engine inspired by [n8n](https://n8n.io) — built from the ground up with Python, FastAPI, and React to explore how visual node-based systems work under the hood.

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.128+-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?logo=postgresql&logoColor=white)

---

## Motivation

I've always been fascinated by [n8n](https://n8n.io) and the elegance of visual workflow automation — how nodes communicate with each other, how data flows through connections, and how a graph of simple operations can compose into powerful pipelines. Instead of just reading about it, I decided the best way to truly understand the internals was to build a lighter version myself from scratch.

**Sentient Flow** is the result of that exploration: a fully functional workflow engine with a visual canvas editor, real-time execution streaming, conditional branching, LLM integration, and more.

## Why Python & FastAPI?

This project started as a **backend-only** experiment — a pure engine to parse, validate, and execute node graphs. FastAPI was a natural fit because of its first-class support for **Pydantic schemas**, which let me define rigorous, self-documenting data models for workflows, nodes, and connections. The auto-generated OpenAPI docs made it trivial to test and iterate on the API without writing a single line of frontend code early on. Python's async ecosystem (`asyncio`, `httpx`) also made streaming execution results over SSE straightforward to implement.

---

## Features

### Workflow Engine

- **DAG-based execution** — topological traversal with in-degree tracking ensures nodes run only when all upstream dependencies are satisfied
- **Cycle detection** — DFS-based graph validation rejects circular workflows before execution
- **Conditional branching** — IF and Switch nodes route data down different output paths; inactive branches are automatically skipped
- **Merge nodes** — recombine data from parallel branches back into a single stream
- **Variable resolution** — `$'Node Name'.field` syntax lets any node reference output from any upstream node, resolved recursively at runtime
- **Streaming execution** — results are streamed to the frontend via SSE (`text/event-stream`), so the UI updates node-by-node in real time
- **Execution resume** — failed workflows can be retried; previously successful nodes are fast-forwarded using cached state
- **Step limit** — a configurable cap (default: 100 steps) prevents runaway workflows

### Node Types

| Category | Nodes | Description |
|----------|-------|-------------|
| **Trigger** | Manual Trigger, Webhook | Entry points that kick off a workflow |
| **Action** | HTTP Request, Calculate, Delay, Code | Perform operations — API calls, math, timed waits, safe Python eval |
| **Logic** | IF / Condition, Switch, Merge, Loop | Control flow — branching, routing, combining, iteration |
| **Output** | Set Data, Print, Text Template | Store values, log output, interpolate templates |
| **AI** | LLM Chat, LLM Classify, LLM Summarize | Multi-provider LLM integration (OpenAI, Anthropic, Google, NVIDIA, Ollama) |

### Security

- **JWT authentication** with Argon2id password hashing
- **Credential vault** — API keys are encrypted at rest using Fernet (PBKDF2-derived keys, 600K iterations) and decrypted only at execution time
- **SSRF protection** — HTTP Request nodes validate URLs against internal/private IP ranges before making requests
- **Sandboxed Code node** — Python expressions are parsed into an AST and validated against a strict whitelist; no `import`, `exec`, or dunder access allowed
- **Rate limiting** — in-memory sliding-window limiter on auth endpoints to prevent brute-force attacks
- **Row-level isolation** — every database query is scoped to the authenticated user's `owner_id`

### Frontend

- **Visual canvas editor** built with React Flow — drag-and-drop nodes from a palette, wire them together, configure properties in a side panel
- **Real-time execution visualization** — nodes light up as they execute, with status indicators (running, success, error, skipped)
- **Workflow validation** — client-side checks (required fields, URL patterns, number ranges) before execution
- **Execution history** — browse past runs, inspect per-node inputs/outputs, and resume failed executions
- **Credential management** — create, store, and assign encrypted credentials to nodes from the dashboard
- **Workflow import/export** — JSON-based format compatible with the engine's schema

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12+, FastAPI, SQLModel, Pydantic |
| **Database** | PostgreSQL (via psycopg2), Alembic migrations |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, React Flow, Zustand |
| **Auth** | JWT (PyJWT), Argon2id (pwdlib) |
| **Encryption** | Fernet symmetric encryption (cryptography) |
| **HTTP Client** | httpx (async) |
| **LLM Providers** | OpenAI, Anthropic, Google Gemini, NVIDIA NIM, Ollama |

---

## Project Structure

```
sentient_flow/
├── app/
│   ├── main.py                 # FastAPI app entry point
│   ├── workflow_engine.py      # Core DAG executor with streaming
│   ├── node_handlers.py        # Handler registry — maps node types to logic
│   ├── tasks.py                # Pure functions (HTTP, math, LLM, safe eval)
│   ├── api/
│   │   ├── deps.py             # Dependency injection (auth, DB session)
│   │   └── routes/             # REST endpoints (auth, workflows, credentials, executions)
│   ├── core/
│   │   ├── config.py           # Pydantic settings (.env)
│   │   ├── auth.py             # JWT token creation/validation
│   │   ├── security.py         # Password hashing (Argon2id)
│   │   └── rate_limit.py       # Sliding-window rate limiter
│   ├── models/                 # SQLModel ORM models
│   ├── schemas/                # Pydantic request/response schemas
│   └── services/
│       └── cipher.py           # Fernet encryption for credential vault
├── frontend/
│   └── src/
│       ├── config/
│       │   └── nodeDefinitions.ts   # Node type registry with validation rules
│       ├── components/canvas/       # React Flow canvas (nodes, edges, panels)
│       ├── pages/                   # Dashboard, Canvas, Executions, Login
│       ├── stores/                  # Zustand state (workflow, execution, auth)
│       └── lib/                     # API client, workflow validation
├── alembic/                    # Database migrations
├── tests/                      # Pytest suite
└── pyproject.toml
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- PostgreSQL
- Node.js 18+

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/your-username/sentient_flow.git
cd sentient_flow

# Create virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate
pip install -e .

# Configure environment variables
cp .env.example .env
# Edit .env with your database URL, secret key, and encryption key

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:8000`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing secret |
| `ENCRYPTION_KEY` | Master key for credential encryption |

---

## How It Works

1. **Workflow Definition** — A workflow is a JSON document containing a list of typed nodes and an adjacency list (`connections`) describing how output ports map to input ports of downstream nodes.

2. **Engine Initialization** — The `WorkflowEngine` builds an in-degree map, detects cycles via DFS, and identifies the trigger node as the entry point.

3. **Execution Loop** — Starting from the trigger, nodes are dequeued and executed once all their upstream inputs have arrived (tracked via input buffers). Each handler returns a `(result, output_index)` tuple — the result is stored in the execution state and forwarded to active children, while inactive branches receive a skip signal.

4. **Variable Resolution** — Before a node executes, its parameters are recursively scanned for `$'Node Name'.field` references, which are resolved against the accumulated execution state.

5. **Streaming** — Every node start, completion, skip, and error is emitted as a newline-delimited JSON event over SSE, giving the frontend real-time visibility.

---

## Current Limitations

- **No scheduler / cron triggers** — workflows can only be started manually; there's no built-in time-based scheduling
- **Single-threaded execution** — nodes within a workflow run sequentially (no parallel execution of independent branches)
- **No granular node-level retry** — failed workflows can be resumed from the point of failure (successful nodes are fast-forwarded via cached state), but you cannot selectively retry a single node in isolation
- **Limited loop support** — the Loop node collects items but doesn't re-execute downstream nodes per-item in a true iterative fashion
- **In-memory rate limiting** — rate limit state is lost on server restart; not suitable for multi-process deployments without an external store
- **No WebSocket support** — execution streaming uses SSE which is unidirectional; no real-time bi-directional communication
- **Merge mode** — currently only supports "append" mode; n8n offers several merge strategies (combine by position, by field, choose branch)
- **No versioning** — workflows don't have version history or rollback capability

---

## Acknowledgements

Transparency matters, so here's how this project was built:

- **Backend** — largely written by me, with AI assistance for boilerplate, debugging, and refining edge cases. The workflow engine, node handler architecture, variable resolution system, credential encryption, and security measures are my own design, informed by studying [n8n's open-source codebase](https://github.com/n8n-io/n8n) to understand how a production workflow engine structures its graph execution, connection model, and node registry.
- **Frontend** — mostly built with AI. My primary focus was the engine and API layer; the React canvas, UI components, and stores were generated with significant AI help and then iterated on to integrate with the backend.

---

## Running Tests

```bash
pytest
```

---
