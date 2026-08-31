import { loadEnv } from '../scripts/load-env';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { SAMPLES, type SampleBlock, type SampleDoc } from './sample-content';

loadEnv();

/**
 * Renders the sample offering memoranda to PDF.
 *
 * Real deal documents cannot be committed to a public repo, and extraction that
 * has only ever been tried on one document is untested. These are generated
 * from source so the fixtures are reproducible and reviewable as text.
 *
 *   npm run generate-samples
 */

const OUT_DIR = path.join(process.cwd(), 'evals', 'samples');

const INK = '#1e293b';
const MUTED = '#64748b';
const RULE = '#cbd5e1';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const sample of SAMPLES) {
    const target = path.join(OUT_DIR, sample.fileName);
    await render(sample, target);
    const { size } = fs.statSync(target);
    console.log(`${sample.fileName}  ${sample.pages.length} pages  ${(size / 1024).toFixed(1)} KB  — ${sample.label}`);
  }

  console.log(`\n${SAMPLES.length} sample documents written to evals/samples/`);
}

/**
 * A fixed timestamp, so regenerating is byte-for-byte identical.
 *
 * PDFKit stamps the current time into /CreationDate and derives the trailer /ID
 * from it. Left alone, every run produces a different file and the committed
 * samples would show a spurious diff each time anyone ran this. Pinned, the
 * opposite becomes true and useful: `npm run generate-samples` followed by a
 * clean `git diff` proves the committed PDFs still match sample-content.ts.
 */
const FIXED_TIMESTAMP = new Date(Date.UTC(2026, 0, 1));

function render(sample: SampleDoc, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 54,
      autoFirstPage: false,
      info: { CreationDate: FIXED_TIMESTAMP, ModDate: FIXED_TIMESTAMP },
    });
    const stream = fs.createWriteStream(target);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);

    sample.pages.forEach((page) => {
      doc.addPage();
      page.blocks.forEach((block) => drawBlock(doc, block));
      watermark(doc);
    });

    doc.end();
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function drawBlock(doc: Doc, block: SampleBlock): void {
  switch (block.style) {
    case 'title':
      doc.moveDown(0.6).fillColor(INK).font('Helvetica-Bold').fontSize(26).text(block.text, { align: 'center' });
      doc.moveDown(0.3);
      break;
    case 'subtitle':
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(block.text, { align: 'center' });
      doc.moveDown(0.4);
      break;
    case 'heading':
      doc.moveDown(1).fillColor(INK).font('Helvetica-Bold').fontSize(12).text(block.text);
      rule(doc);
      break;
    case 'kv':
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(block.text, { lineGap: 3 });
      break;
    case 'bullet':
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(`•  ${block.text}`, { lineGap: 3, indent: 6 });
      doc.moveDown(0.35);
      break;
    case 'body':
    default:
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(block.text, { align: 'left', lineGap: 3 });
      doc.moveDown(0.5);
      break;
  }
}

function rule(doc: Doc): void {
  const y = doc.y + 3;
  doc.save().strokeColor(RULE).lineWidth(0.75)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke().restore();
  doc.moveDown(0.8);
}

/**
 * Every page says what it is, so a sample can never be mistaken for a real deal.
 *
 * Drawn last, with the bottom margin temporarily removed: pdfkit auto-paginates
 * when text would cross the bottom margin, and a footer sitting below it will
 * otherwise silently emit a blank extra page for every page of content.
 */
function watermark(doc: Doc): void {
  const bottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.save()
    .fillColor('#94a3b8')
    .font('Helvetica')
    .fontSize(7.5)
    .text('FICTIONAL SAMPLE — GENERATED FOR ARTIFICER DEMONSTRATION AND EVALUATION', 54, doc.page.height - 40, {
      align: 'center',
      width: doc.page.width - 108,
      // No character spacing: pdf.js emits letter-spaced text as separate
      // glyph runs, which extracts as "F I C T I O N A L".
      lineBreak: false,
    })
    .restore();

  doc.page.margins.bottom = bottomMargin;
}

main().catch((err) => { console.error(err); process.exit(1); });
