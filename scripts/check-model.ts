import { loadEnv } from './load-env';
loadEnv();

/**
 * Confirms the configured model id is actually reachable with the configured
 * key, before an extraction failure has to teach us the same thing.
 *
 *   npm run check-model
 */
async function main() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { DEFAULT_MODEL } = await import('@/lib/extraction/client');

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');

  const client = new Anthropic({ apiKey: key });
  const candidates = [DEFAULT_MODEL, ...process.argv.slice(2)];

  for (const model of candidates) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      });
      const text = res.content.map((b) => ('text' in b ? b.text : '')).join('').trim();
      console.log(`${model}: OK — "${text}" (in=${res.usage.input_tokens} out=${res.usage.output_tokens})`);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.log(`${model}: FAILED — ${e.status ?? ''} ${(e.message ?? '').slice(0, 200)}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
