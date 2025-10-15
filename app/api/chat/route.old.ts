import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

interface UserData {
  name?: string;
  email?: string;
  company?: string;
  projectType?: string;
  budget?: string;
  timeline?: string;
}

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { messages, userData, currentStep } = await req.json();

    // Create a context-aware system prompt for Gemini
    const systemPrompt = `You are an AI assistant for aicorelab.dev, a leading AI solution platform that builds custom AI applications in 10 days.

Your role is to collect user information naturally through conversation in this exact order:
1. Name (if not collected yet)
2. Email address
3. Company name
4. Project type/needs (what AI solution they want)
5. Budget range
6. Timeline preference

Current context:
- Current step: ${currentStep}
- Data collected so far: ${JSON.stringify(userData || {})}

Guidelines:
- Be friendly, professional, and enthusiastic about AI
- Ask ONE question at a time - never ask multiple questions
- Keep responses very concise (2-3 sentences maximum)
- Use emojis sparingly (1-2 per message max)
- Always acknowledge their previous answer warmly before asking the next question
- When asking for budget, suggest ranges like "$10k-$25k", "$25k-$50k", "$50k+"
- When asking for timeline, suggest options like "ASAP", "1-2 months", "3+ months"
- When all info is collected (step is "complete"), provide a friendly summary with all their details and mention that the team will contact them within 24 hours
- Never ask for information that's already been provided
- If they ask questions about services, briefly mention we build AI chatbots, automation, analytics, and custom solutions in 10 days

Brand voice: Professional yet approachable, excited about AI possibilities, focused on speed and simplicity.

Remember: You're helping collect information for a discovery call, not providing technical consultation yet.`;

    // Use Gemini Pro for intelligent responses
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      messages,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}// Example: Integration with OpenAI (commented out)
/*
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();
    const { messages, userData, currentStep } = body;

    const systemPrompt = `You are an AI assistant for aicorelab.dev, an AI solution platform. 
Your goal is to collect user information in a friendly, conversational way:
1. Name
2. Email
3. Company
4. Project type
5. Budget
6. Timeline

Current step: ${currentStep}
User data so far: ${JSON.stringify(userData)}

Be friendly, professional, and concise. Ask one question at a time.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    const response = completion.choices[0].message.content;

    return NextResponse.json({
      message: response,
      success: true,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
*/
