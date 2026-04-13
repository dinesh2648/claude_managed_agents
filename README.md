# 🤖 Claude Managed Agents

> **A collection of production-ready autonomous agents built on Anthropic's [Managed Agents API](https://docs.anthropic.com) — self-running, event-driven AI agents that operate 24/7 with minimal human intervention, integrated with Sentry, Jira, GitHub, and Slack.**

[![Claude](https://img.shields.io/badge/Powered%20by-Claude%20(Anthropic)-blueviolet?logo=anthropic)](https://www.anthropic.com)
[![Beta](https://img.shields.io/badge/API%20Beta-managed--agents--2026--04--01-orange)](https://docs.anthropic.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## 🌐 What is this?

This repository contains **Claude Managed Agents** — long-running autonomous AI agents that use Anthropic's `managed-agents` API beta to operate as persistent, event-driven workers. Unlike one-shot prompts, these agents run in a **continuous session loop**, respond to real-world events (Sentry alerts, Jira tickets, PR comments), and take autonomous action with human-in-the-loop approval for critical operations.

Each agent is defined by:
- A **system prompt** (`.MD` file) that describes the agent's role, decision logic, and tool-use rules
- A **scheduler** (`scheduler.ts`) that creates a fresh session every 60 minutes and triggers a polling cycle
- **MCP tool integrations** (Sentry, Jira, GitHub, Slack) injected at session creation via vault/environment config

---

## 🚀 How It Works

```
┌──────────────┐     every 60 min      ┌────────────────────┐
│  scheduler   │ ──────────────────── ▶ │  sessions.create() │
│  (cron job)  │                        │  (Managed Agent)   │
└──────────────┘                        └────────┬───────────┘
                                                 │  trigger: "Run your polling cycle now."
                                                 ▼
                                        ┌────────────────────┐
                                        │   Agent reasons    │
                                        │   + uses MCP tools │
                                        │  (Sentry/Jira/GH)  │
                                        └────────┬───────────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                         Jira ticket        GitHub PR           Slack alert
                         created            opened              posted
```

1. **Scheduler** (`scheduler.ts`) fires on a cron schedule
2. Creates a fresh **Managed Agent session** via `client.beta.sessions.create()`
3. Sends a trigger message: `"Run your polling cycle now."`
4. Streams agent events — the agent autonomously investigates, codes, and takes action
5. Session is archived when the cycle is complete

---

## 🤖 Agents

### 🚨 OnCall Incident Manager
**`OnCallIncidentManager.MD`**

An autonomous on-call incident commander that handles the full incident lifecycle end-to-end:

- **Sentry → Jira**: Detects new Sentry errors and creates corresponding Jira tickets automatically
- **Root cause analysis**: Inspects stack traces, maps file paths to GitHub repositories, and identifies the breaking code
- **Critical incident approval gate**: For Critical severity, posts a structured plan to `#ai-agent` Slack channel and waits for human ✅ approval before touching any code
- **Auto-fix & PR**: Creates a feature branch (named after the Jira ticket ID), implements a targeted fix, runs lint/prettier, and opens a PR
- **PR review response**: Reads reviewer comments, addresses all feedback, pushes to the same branch, and replies to each comment on GitHub
- **Continuous queue**: When current incidents are fixed, automatically picks up the next unresolved ticket by severity priority
- **Always in sync**: Keeps Jira tickets, GitHub PRs, and the `#ai-agent` Slack channel updated throughout

**Integrations:** Sentry · Jira · GitHub · Slack

---

## 📁 Repository Structure

```
claude_managed_agents/
├── OnCallIncidentManager.MD   # Agent system prompt — incident commander
├── scheduler.ts               # Cron runner: creates sessions & streams events
├── setup.ts                   # One-time environment/vault setup
├── package.json
├── tsconfig.json
├── .env.sample                # Required environment variables
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) with access to the `managed-agents-2026-04-01` beta
- A configured Anthropic **Agent** with MCP vaults for Sentry, Jira, GitHub, and Slack

### Installation

```bash
git clone https://github.com/dinesh2648/claude_managed_agents.git
cd claude_managed_agents
npm install
```

### Environment setup

Copy `.env.sample` to `.env` and fill in your values:

```bash
cp .env.sample .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
AGENT_ID=ag_...
ENVIRONMENT_ID=env_...
VAULT_IDS=vault_abc,vault_def   # comma-separated MCP vault IDs
```

### Run the scheduler

```bash
npx ts-node scheduler.ts
```

The scheduler fires immediately on startup, then every 60 minutes. Each run creates a fresh session, triggers the agent's polling cycle, streams output to the console, and archives the session on completion.

---

## 🔌 API Used

This project uses Anthropic's **Managed Agents beta API**:

```typescript
// Create a session tied to an agent
const session = await client.beta.sessions.create({
  agent: AGENT_ID,
  environment_id: ENVIRONMENT_ID,
  vault_ids: VAULT_IDS,
  title: `Polling cycle – ${runAt}`,
}, { headers: { "anthropic-beta": "managed-agents-2026-04-01" } });

// Trigger the agent
await client.beta.sessions.events.send(session.id, {
  events: [{ type: "user.message", content: [{ type: "text", text: "Run your polling cycle now." }] }]
}, { headers: { "anthropic-beta": "managed-agents-2026-04-01" } });

// Stream agent output
const stream = await client.beta.sessions.events.stream(session.id, ...);
```

---

## 🧠 Agent System Prompt Design

Each `.MD` file in this repo is the **system prompt** for a Claude Managed Agent. The design principles:

- **Workflow-first**: Prompts are structured as named workflows (`### When a Sentry issue is raised`) so Claude can pattern-match the current situation to the right playbook
- **Explicit approval gates**: Critical actions (e.g. fixing Critical severity incidents) require a structured human-approval step via Slack before proceeding
- **Idempotent operations**: Branch-existence checks prevent duplicate branches; session archiving frees resources after each cycle
- **Opinionated output formats**: PR title formats, Slack message schemas, and Jira comment templates are specified precisely to keep outputs consistent and machine-readable

---

## 🛡️ Human-in-the-Loop

The OnCall Incident Manager never touches Critical severity code without approval:

```
🚨 *Critical Incident Plan — [TICKET-ID]: [Title]*
*Root cause:* <summary>
*Affected file(s):* <file paths>
*Proposed fix:* <description of the change>
*Awaiting approval to proceed. Reply ✅ to approve or ❌ to reject with feedback.*
```

The agent waits for `✅` or `"approved"` in the Slack thread before proceeding. This pattern can be adapted for any agent that needs a human checkpoint.

---

## 🗺️ Roadmap

- [ ] `PRReviewMonitor.MD` — dedicated agent for proactive PR review assignment and nudges
- [ ] `KSARegulatoryMonitor.MD` — regulatory intelligence digest agent for Saudi Arabia market
- [ ] `EngineeringHealthMonitor.MD` — sprint health and bottleneck detection agent
- [ ] Multi-agent orchestration (agents that hand off tasks to other agents)
- [ ] Web dashboard for session history and agent activity logs

---

## 🤝 Contributing

Contributions welcome. To add a new agent:

1. Fork this repository
2. Create a new `.MD` file with your agent's system prompt — follow the workflow-first structure of `OnCallIncidentManager.MD`
3. Document the integrations and trigger conditions clearly
4. Submit a PR with a short description of what problem the agent solves

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

## 🔗 Resources

- [Anthropic API Documentation](https://docs.anthropic.com)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- [Anthropic Node.js SDK](https://github.com/anthropic-ai/anthropic-node)

---

*Keywords: Anthropic managed agents, Claude autonomous agents, managed-agents API beta, Claude sessions API, on-call AI agent, Sentry incident automation, Jira automation Claude, AI DevOps agent, autonomous incident response, Claude MCP tools, agentic AI engineering, LLM-powered on-call, AI SRE agent, self-healing systems*
