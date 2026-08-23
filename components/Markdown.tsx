/**
 * A deliberately small renderer for the subset of markdown the OM draft prompt
 * asks for: h2 headings, bullet lists, tables, paragraphs and bold runs.
 *
 * A full markdown library would be a large dependency and a much larger attack
 * surface for model-authored text. This renders text nodes only — no raw HTML
 * is ever interpreted — so nothing the model emits can inject markup.
 */
export function Markdown({ source }: { source: string }) {
  return <div className="space-y-3">{renderBlocks(source)}</div>;
}

function renderBlocks(source: string): React.ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];

  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-4 border-0 border-t border-rule" />);
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h3 key={key++} className="pt-2 text-sm font-semibold tracking-tight text-ink">
          {inline(heading[2])}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (isTableRow(line) && isTableDivider(lines[index + 1] ?? '')) {
      const rows: string[] = [];
      const header = line;
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(lines[index]);
        index += 1;
      }
      blocks.push(<Table key={key++} header={header} rows={rows} />);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={key++} className="space-y-1.5 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-[0.8125rem] leading-relaxed text-ink">
              <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{inline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s*[-*#]\s/.test(lines[index]) && !isTableRow(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={key++} className="text-[0.8125rem] leading-relaxed text-ink">
        {inline(paragraph.join(' '))}
      </p>,
    );
  }

  return blocks;
}

function Table({ header, rows }: { header: string; rows: string[] }) {
  const headers = splitRow(header);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr>
            {headers.map((cell, i) => (
              <th
                key={i}
                className={`border-b border-rule pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {inline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {splitRow(row).map((cell, c) => (
                <td
                  key={c}
                  className={`border-b border-rule py-1.5 text-ink ${c === 0 ? 'text-left' : 'tnum text-right'}`}
                >
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

function splitRow(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

/** Bold runs only; everything else stays literal text. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
