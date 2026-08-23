import { loadEnv } from '../scripts/load-env';
loadEnv();

import fs from 'node:fs';
import path from 'node:path';
import { compareField, tally, accuracy, type Expectation, type FieldComparison, type Outcome } from './compare';
import { FIELD_SPECS, getField, type Confidence } from '@/shared/schema';

/**
 * Runs extraction against every sample and scores it against ground truth.
 *
 * The headline number is not accuracy — it is the hallucination count. A field
 * the model invents is far more dangerous than one it misses, because a missing
 * value is visible in the UI and an invented one looks exactly like a real one.
 *
 *   npm run generate-samples && npm run eval
 */

interface GroundTruth {
  id: string;
  file: string;
  notes?: string;
  fields: Record<string, Expectation>;
}

interface SampleResult {
  id: string;
  file: string;
  comparisons: FieldComparison[];
  confidenceByPath: Record<string, Confidence>;
  citedByPath: Record<string, boolean>;
  meta: { model: string; inputTokens: number; outputTokens: number; durationMs: number; attempts: number };
}

const SAMPLES_DIR = path.join(process.cwd(), 'evals', 'samples');
const TRUTH_DIR = path.join(process.cwd(), 'evals', 'groundtruth');
const RESULTS_DIR = path.join(process.cwd(), 'evals', 'results');

async function main() {
  const { parsePdf } = await import('@/lib/extraction/pdf');
  const { extractDeal } = await import('@/lib/extraction/client');

  const truths = fs
    .readdirSync(TRUTH_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(TRUTH_DIR, f), 'utf8')) as GroundTruth);

  const missing = truths.filter((t) => !fs.existsSync(path.join(SAMPLES_DIR, t.file)));
  if (missing.length) {
    throw new Error(
      `Missing sample PDFs: ${missing.map((m) => m.file).join(', ')}. Run \`npm run generate-samples\` first.`,
    );
  }

  const results: SampleResult[] = [];

  for (const truth of truths) {
    process.stdout.write(`Extracting ${truth.file} … `);
    const parsed = await parsePdf(fs.readFileSync(path.join(SAMPLES_DIR, truth.file)));
    const { extraction, meta } = await extractDeal(parsed.paragraphs, { fileName: truth.file });

    const comparisons: FieldComparison[] = [];
    const confidenceByPath: Record<string, Confidence> = {};
    const citedByPath: Record<string, boolean> = {};

    for (const spec of FIELD_SPECS) {
      const field = getField(extraction, spec.path);
      comparisons.push(compareField(spec.path, truth.fields[spec.path] ?? null, field?.value ?? null));
      confidenceByPath[spec.path] = field?.confidence ?? 'not_found';
      citedByPath[spec.path] = Boolean(field?.sourceLocation);
    }

    const totals = tally(comparisons);
    console.log(`${totals.correct}/${totals.total} correct, ${totals.hallucinated} hallucinated`);

    results.push({ id: truth.id, file: truth.file, comparisons, confidenceByPath, citedByPath, meta });
  }

  report(results);
  writeResults(results);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(results: SampleResult[]): void {
  const all = results.flatMap((r) => r.comparisons);
  const totals = tally(all);

  console.log(`\n${'='.repeat(78)}\nPER-SAMPLE\n${'='.repeat(78)}`);
  console.log(row(['Sample', 'Correct', 'Wrong', 'Missed', 'Halluc.', 'Accuracy'], [30, 9, 7, 8, 9, 9]));
  console.log('-'.repeat(78));
  for (const r of results) {
    const t = tally(r.comparisons);
    console.log(
      row(
        [r.id, `${t.correct}/${t.total}`, String(t.wrong), String(t.missed), String(t.hallucinated), pct(accuracy(t))],
        [30, 9, 7, 8, 9, 9],
      ),
    );
  }

  console.log(`\n${'='.repeat(78)}\nPER-FIELD MATCH RATE\n${'='.repeat(78)}`);
  console.log(row(['Field', 'Match', 'Rate', 'Notes'], [30, 8, 8, 30]));
  console.log('-'.repeat(78));
  for (const spec of FIELD_SPECS) {
    const forField = all.filter((c) => c.path === spec.path);
    const correct = forField.filter((c) => c.outcome === 'correct').length;
    const problems = summariseProblems(forField);
    console.log(
      row([spec.label, `${correct}/${forField.length}`, pct(correct / forField.length), problems], [30, 8, 8, 30]),
    );
  }

  console.log(`\n${'='.repeat(78)}\nCONFIDENCE CALIBRATION\n${'='.repeat(78)}`);
  console.log('A grade is only useful if higher confidence really is more often right.\n');
  console.log(row(['Confidence', 'Fields', 'Correct', 'Accuracy'], [14, 9, 10, 10]));
  console.log('-'.repeat(78));

  const buckets: Confidence[] = ['high', 'medium', 'low', 'not_found'];
  const calibration: Record<string, { n: number; correct: number }> = {};
  for (const bucket of buckets) {
    const inBucket = results.flatMap((r) =>
      r.comparisons.filter((c) => r.confidenceByPath[c.path] === bucket),
    );
    const correct = inBucket.filter((c) => c.outcome === 'correct').length;
    calibration[bucket] = { n: inBucket.length, correct };
    console.log(
      row(
        [bucket, String(inBucket.length), String(correct), inBucket.length ? pct(correct / inBucket.length) : '—'],
        [14, 9, 10, 10],
      ),
    );
  }

  const verdict = calibrationVerdict(calibration);
  const cited = all.filter((c) => c.actual !== null && c.actual !== undefined);
  const citedOk = results.flatMap((r) =>
    r.comparisons.filter((c) => c.actual !== null && c.actual !== undefined && r.citedByPath[c.path]),
  ).length;

  const tokens = results.reduce((n, r) => n + r.meta.inputTokens + r.meta.outputTokens, 0);
  const retries = results.filter((r) => r.meta.attempts > 1).length;

  console.log(`\n${'='.repeat(78)}\nSUMMARY\n${'='.repeat(78)}`);
  console.log(`  Overall accuracy        ${pct(accuracy(totals))}  (${totals.correct}/${totals.total} fields)`);
  console.log(`  Hallucinated values     ${totals.hallucinated}${totals.hallucinated === 0 ? '  — no value invented where the document had none' : '  <-- the metric that matters most'}`);
  console.log(`  Missed values           ${totals.missed}`);
  console.log(`  Wrong values            ${totals.wrong}`);
  console.log(`  Citation coverage       ${pct(cited.length ? citedOk / cited.length : 0)}  (${citedOk}/${cited.length} non-null values traceable to a passage)`);
  console.log(`  Confidence calibration  ${CALIBRATION_MESSAGE[verdict]}`);
  console.log(`  Schema-repair retries   ${retries}/${results.length} samples`);
  console.log(`  Tokens used             ${tokens.toLocaleString()}`);
  console.log('');
}

/**
 * High should beat medium should beat low. Buckets thinner than this cannot
 * support the claim either way — reporting "not calibrated" off three fields
 * would be a louder statement than the data can carry.
 */
const MIN_BUCKET = 5;

type Calibration = 'calibrated' | 'miscalibrated' | 'insufficient';

function calibrationVerdict(calibration: Record<string, { n: number; correct: number }>): Calibration {
  const usable = (['high', 'medium', 'low'] as const).filter((b) => (calibration[b]?.n ?? 0) >= MIN_BUCKET);
  if (usable.length < 2) return 'insufficient';

  const rates = usable.map((b) => calibration[b].correct / calibration[b].n);
  return rates.every((rate, i) => i === 0 || rates[i - 1] >= rate - 1e-9) ? 'calibrated' : 'miscalibrated';
}

const CALIBRATION_MESSAGE: Record<Calibration, string> = {
  calibrated: 'higher confidence is more often right',
  miscalibrated: 'NOT monotonic — a grade is misleading somewhere',
  insufficient: `too few fields per grade to judge (need ${MIN_BUCKET}+ in two grades)`,
};

function summariseProblems(comparisons: FieldComparison[]): string {
  const counts: Partial<Record<Outcome, number>> = {};
  for (const c of comparisons) if (c.outcome !== 'correct') counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  const parts = Object.entries(counts).map(([outcome, n]) => `${n} ${outcome}`);
  return parts.join(', ');
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function row(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => truncate(cell, widths[i]).padEnd(widths[i])).join(' ');
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

// ---------------------------------------------------------------------------

function writeResults(results: SampleResult[]): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const all = results.flatMap((r) => r.comparisons);
  const totals = tally(all);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `${stamp}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: results[0]?.meta.model ?? null,
        totals,
        accuracy: accuracy(totals),
        samples: results.map((r) => ({
          id: r.id,
          file: r.file,
          meta: r.meta,
          totals: tally(r.comparisons),
          // Only the failures are written out: a diff of what regressed is the
          // useful artefact, not a dump of everything that passed.
          failures: r.comparisons
            .filter((c) => c.outcome !== 'correct')
            .map((c) => ({ path: c.path, outcome: c.outcome, expected: c.expected, actual: c.actual })),
        })),
      },
      null,
      2,
    ),
  );

  console.log(`Results written to ${path.relative(process.cwd(), file)}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
