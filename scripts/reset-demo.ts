import { loadEnv } from './load-env';
loadEnv();

/**
 * Returns a store to the intended first impression: the seeded deal awaiting
 * review, and nothing else. Approving it is the point of the demo, so a
 * stakeholder should arrive to an unreviewed deal rather than someone else's
 * leftovers.
 *
 *   npm run reset-demo                       # local file store
 *   ARTIFICER_STORE=blob npm run reset-demo  # the deployed blob store
 *
 * Destructive: it deletes every deal, the audit log and all mock CRM records.
 */
async function main() {
  const { getStore, selectedStoreKind } = await import('@/lib/store');
  const store = getStore();
  const kind = selectedStoreKind();

  if (!process.argv.includes('--yes')) {
    console.error(
      `Refusing to wipe the ${kind} store without --yes.\n` +
        `Run: ARTIFICER_STORE=${kind} npm run reset-demo -- --yes`,
    );
    process.exit(1);
  }

  let removed = 0;
  for (const prefix of ['deals/', 'audit/', 'salesforce/']) {
    for (const key of await store.list(prefix)) {
      await store.remove(key);
      removed += 1;
    }
  }
  console.log(`Removed ${removed} object${removed === 1 ? '' : 's'} from the ${kind} store.`);

  // Re-seeded in the same run so the store is never left empty.
  const { buildSampleDeal, SAMPLE_DEAL_ID, SAMPLE_FILE_NAME } = await import('./sample-deal');
  const { putDeal, computeDealHash } = await import('@/lib/deals');
  const { recordAudit } = await import('@/lib/audit');
  const { summarise } = await import('@/shared/schema');
  const sample = buildSampleDeal();

  if (sample.unresolved.length > 0) {
    throw new Error(`Sample quotes not found in its document text: ${sample.unresolved.join(', ')}`);
  }

  const now = new Date().toISOString();
  await putDeal({
    id: SAMPLE_DEAL_ID,
    createdAt: now,
    updatedAt: now,
    status: 'extracted',
    dealHash: computeDealHash(sample.extraction),
    document: {
      fileName: SAMPLE_FILE_NAME,
      byteSize: sample.charCount,
      pageCount: sample.pageCount,
      charCount: sample.charCount,
      paragraphs: sample.paragraphs,
    },
    extraction: sample.extraction,
    originalExtraction: structuredClone(sample.extraction),
    extractionMeta: {
      model: 'claude-sonnet-4-6',
      inputTokens: 4_812,
      outputTokens: 2_137,
      durationMs: 18_400,
      attempts: 1,
      chunks: 1,
    },
    seeded: true,
  });

  await recordAudit({
    dealId: SAMPLE_DEAL_ID,
    actor: 'Artificer seed',
    action: 'document_uploaded',
    summary: `Uploaded ${SAMPLE_FILE_NAME} (${sample.pageCount} pages)`,
    details: { fileName: SAMPLE_FILE_NAME, pageCount: sample.pageCount, seeded: true },
  });
  await recordAudit({
    dealId: SAMPLE_DEAL_ID,
    actor: 'Artificer seed',
    action: 'extraction_completed',
    summary: 'Extraction completed by Artificer',
    details: { engine: 'Artificer', inputTokens: 4_812, outputTokens: 2_137, seeded: true },
  });

  const s = summarise(sample.extraction);
  console.log(`Reseeded ${SAMPLE_DEAL_ID}: ${s.high}/${s.total} high confidence, ${s.needsAttention.length} needing attention.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
