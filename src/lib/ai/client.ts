/**
 * z-ai-web-dev-sdk wrapper (server-side only).
 * Every call is retried and has a deterministic fallback so the platform
 * degrades gracefully if the LLM is unavailable — the ENGINE remains
 * the source of truth for conflict facts and validity.
 */
import ZAI from 'z-ai-web-dev-sdk';

let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

async function getClient() {
  if (!zaiPromise) {
    zaiPromise = ZAI.create();
  }
  return zaiPromise;
}

export interface LLMResult {
  ok: boolean;
  content: string;
  source: 'llm' | 'fallback';
  error?: string;
}

export async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
  opts: { retries?: number; maxOutputChars?: number } = {}
): Promise<LLMResult> {
  const retries = opts.retries ?? 1;
  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await getClient();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      });
      const content = completion.choices[0]?.message?.content ?? '';
      if (!content.trim()) throw new Error('empty response');
      return { ok: true, content: content.slice(0, opts.maxOutputChars ?? 4000), source: 'llm' };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return { ok: false, content: '', source: 'fallback', error: lastError };
}
