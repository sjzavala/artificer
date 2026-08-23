import { loadEnv } from './load-env';
loadEnv();
import fs from 'node:fs';

/** Prints how a PDF is chunked into anchored paragraphs. `npm run inspect-pdf <file>` */
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: tsx scripts/inspect-pdf.ts <path-to-pdf>');

  const { parsePdf } = await import('@/lib/extraction/pdf');
  const parsed = await parsePdf(fs.readFileSync(file));

  console.log(`pages=${parsed.pageCount} chars=${parsed.charCount} paragraphs=${parsed.paragraphs.length}\n`);
  for (const p of parsed.paragraphs) {
    console.log(`[${p.id} | page ${p.page}] ${p.text.slice(0, 110)}${p.text.length > 110 ? '…' : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
