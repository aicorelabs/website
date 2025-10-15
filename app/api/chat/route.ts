import { google } from "@ai-sdk/google";
import { streamText, type CoreMessage } from "ai";

interface ChatRequestPayload {
  messages?: CoreMessage[];
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body: ChatRequestPayload = await req.json();
    const { messages } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const systemPrompt = `You are an AI solutions strategist for aicorelab.dev, the platform that ships custom AI products in 10 days.

Your mission:
- Hold a natural conversation that uncovers the prospect's name, email, company, desired AI outcome, budget range, and timeline.
- Use the existing conversation to decide what to ask next—no rigid script.
- Acknowledge what they've already shared and only ask for missing details.
- Keep every reply friendly, professional, and focused (ideally 2-3 sentences).
- Offer helpful options when appropriate (e.g. budget ranges like "$10k-$25k" / "$25k-$50k" / "$50k+", timelines like "ASAP" / "1-2 months" / "3+ months").
- If the user triggers a quick action such as "Build an AI assistant" or "Automate workflows", continue that thread with strategic questions and suggestions.
- When all key details are captured, give a concise summary and confirm the team will follow up within 24 hours.
- If they ask about capabilities, highlight that aicorelab.dev builds AI assistants, automation, analytics, and custom solutions incredibly fast.
- Respect boundaries—if they decline to share something, move on gracefully.`;

    const result = await streamText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      messages,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("AI Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
}
