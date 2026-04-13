import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BETAS = ["managed-agents-2026-04-01"] as const;

async function setup() {
  // Reuse an existing agent ID if you already have one
  const agent = await client.beta.agents.create(
    { name: "On-Call Incident Commander", model: "claude-sonnet-4-6-20250514" },
    { headers: { "anthropic-beta": BETAS.join(",") } }
  );

  const env = await client.beta.environments.create(
    {
      name: "incident-commander-env",
      config: { type: "cloud", networking: { type: "unrestricted" } },
    },
    { headers: { "anthropic-beta": BETAS.join(",") } }
  );

  console.log(`AGENT_ID=${agent.id}`);
  console.log(`ENVIRONMENT_ID=${env.id}`);
}

setup();
