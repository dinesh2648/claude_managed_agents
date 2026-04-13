import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import cron from "node-cron";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const BETAS = ["managed-agents-2026-04-01"];
const AGENT_ID = process.env.AGENT_ID!;
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID!;
const VAULT_IDS = process.env.VAULT_IDS
  ? process.env.VAULT_IDS.split(",")
  : [];

async function runPollingCycle() {
  const runAt = new Date().toISOString();
  console.log(`\n[${runAt}] Starting polling cycle...`);

  // Create a fresh session for this cycle
  const session = await client.beta.sessions.create(
    {
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      vault_ids: VAULT_IDS,
      title: `Polling cycle – ${runAt}`,
    },
    { headers: { "anthropic-beta": BETAS.join(",") } }
  );

  console.log(`  Session created: ${session.id}`);

  // Open the event stream BEFORE sending the trigger message
  const streamPromise = streamSession(session.id);

  // Send the trigger message
  await client.beta.sessions.events.send(
    session.id,
    {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: "Run your polling cycle now." }],
        },
      ],
    },
    { headers: { "anthropic-beta": BETAS.join(",") } }
  );

  await streamPromise;

  // Archive the session when done to free resources
  await client.beta.sessions.archive(session.id, {
    headers: { "anthropic-beta": BETAS.join(",") },
  } as any);

  console.log(`[${new Date().toISOString()}] Cycle complete. Session archived.`);
}

async function streamSession(sessionId: string) {
  const stream = await client.beta.sessions.events.stream(sessionId, {
    headers: { "anthropic-beta": BETAS.join(",") },
  } as any);

  for await (const event of stream) {
    if (event.type === "agent.message") {
      const text = event.content
        ?.filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text?: string }) => b.text)
        .join("");
      if (text) console.log(`  [agent] ${text}`);
    } else if (event.type === "session.error") {
      console.error(`  [error]`, event);
    } else if (event.type === "session.status_terminated") {
      break;
    } else if (event.type === "session.status_idle") {
      // Agent finished its work for this cycle — we can stop streaming
      break;
    }
  }
}

let isRunning = false;

async function safePoll() {
  if (isRunning) {
    console.log(`[${new Date().toISOString()}] Previous cycle still running — skipping this execution.`);
    return;
  }
  isRunning = true;
  try {
    await runPollingCycle();
  } catch (err) {
    console.error(err);
  } finally {
    isRunning = false;
  }
}

// Run immediately on startup, then every 60 minutes
safePoll();
cron.schedule("0 * * * *", () => {
  safePoll();
});

console.log("Scheduler running. Polling every 60 minutes. Press Ctrl+C to stop.");
