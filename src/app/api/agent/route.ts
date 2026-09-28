import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runAgent, type AgentEvent } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(30),
});

function friendly(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Claude API key is missing or invalid. Add it to the .env file and restart the app.";
  if (err instanceof Anthropic.RateLimitError) return "The AI service is busy. Wait a moment and ask again.";
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status}). Please try again.`;
  return "Something went wrong while the agent was working. Please try again.";
}

/** Streams the agent's steps and answer as newline-delimited JSON events. */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The agent is not connected yet: add ANTHROPIC_API_KEY to the .env file and restart the app." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const event of runAgent(parsed.data.messages.slice(-12))) send(event);
      } catch (err) {
        console.error("Agent failed", err);
        send({ t: "error", message: friendly(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
