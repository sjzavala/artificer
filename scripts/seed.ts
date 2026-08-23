import { loadEnv } from './load-env';
import type { Deal } from '@/shared/deal';

loadEnv();

/**
 * Plants the sample deal so the app is never empty — locally after a clone, and
 * in production immediately after the first deploy.
 *
 * Idempotent by design: it skips an existing seeded deal unless --force is
 * passed, so running it as part of a deploy step is safe.
 */
async function main() {
  // Imported after loadEnv so the store factory sees the right environment.
  const { buildSampleDeal, SAMPLE_DEAL_ID, SAMPLE_FILE_NAME } = await import('./sample-deal');
  const { getDeal, putDeal, computeDealHash } = await import('@/lib/deals');
  const { recordAudit } = await import('@/lib/audit');
  const { selectedStoreKind } = await import('@/lib/store');
  const { summarise } = await import('@/shared/schema');

  const force = process.argv.includes('--force');
  const store = selectedStoreKind();

  const existing = await getDeal(SAMPLE_DEAL_ID);
  if (existing && !force) {
    console.log(`Sample deal already present in the ${store} store. Nothing to do (use --force to replace).`);
    return;
  }

  const sample = buildSampleDeal();
  if (sample.unresolved.length > 0) {
    // A seeded quote that cannot be located would break click-to-highlight on
    // the very first screen a stakeholder sees, so this is fatal, not a warning.
    throw new Error(
      `Sample deal has quotes that do not appear in its document text: ${sample.unresolved.join(', ')}`,
    );
  }

  const now = new Date().toISOString();
  const deal: Deal = {
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
  };

  await putDeal(deal);

  await recordAudit({
    dealId: deal.id,
    actor: 'Artificer seed',
    action: 'document_uploaded',
    summary: `Uploaded ${SAMPLE_FILE_NAME} (${sample.pageCount} pages)`,
    details: { fileName: SAMPLE_FILE_NAME, pageCount: sample.pageCount, seeded: true },
  });

  await recordAudit({
    dealId: deal.id,
    actor: 'Artificer seed',
    action: 'extraction_completed',
    summary: 'Extraction completed with claude-sonnet-4-6',
    details: {
      model: deal.extractionMeta.model,
      inputTokens: deal.extractionMeta.inputTokens,
      outputTokens: deal.extractionMeta.outputTokens,
      seeded: true,
    },
  });

  const summary = summarise(deal.extraction);
  console.log(
    `Seeded "${SAMPLE_FILE_NAME}" into the ${store} store as ${deal.id}: ` +
      `${summary.high}/${summary.total} high confidence, ${summary.needsAttention.length} needing attention.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
