import { loadEnv } from './load-env';
loadEnv();

/**
 * Exercises the live storage adapter end to end — the Store contract against
 * the real thing rather than a test double. Run it after switching stores:
 *
 *   npm run check-store                      # whatever the environment selects
 *   ARTIFICER_STORE=blob npm run check-store # the production blob store
 */
async function main() {
  const { getStore } = await import('@/lib/store');
  const store = getStore();
  console.log('store kind:', store.kind);
  console.log('keys:', await store.list(''));

  const deal = await store.read<{ id: string; status: string; document: { paragraphs: unknown[] } }>(
    'deals/d_sample_dollar_general_oh.json',
  );
  console.log('deal:', deal?.id, '| status:', deal?.status, '| paragraphs:', deal?.document.paragraphs.length);

  const audit = await store.read<unknown[]>('audit/log.json');
  console.log('audit entries:', audit?.length);
  console.log('missing key returns:', await store.read('deals/nope.json'));

  await store.write('deals/__probe.json', { probe: true });
  console.log('probe write/read:', await store.read('deals/__probe.json'));
  await store.remove('deals/__probe.json');
  console.log('after remove:', await store.read('deals/__probe.json'));
  await store.remove('deals/__probe.json');
  console.log('double remove ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
