import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/session';
import { answerAssistantQuestion } from '@/lib/ai/assistant';
import type { ChatMessage } from '@/lib/ai/assistant';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const message = String(body.message ?? '').trim();
    if (!message) return Response.json({ error: 'Message is required' }, { status: 400 });
    if (message.length > 600) return Response.json({ error: 'Message too long (max 600 characters)' }, { status: 400 });

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history.slice(-8).map((m: { role: string; content: string }) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) }))
      : [];

    const reply = await answerAssistantQuestion(message, history, user);
    return Response.json(reply);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Assistant failed' }, { status: 500 });
  }
}
