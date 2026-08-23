'use client';

import { useEffect, useRef, useState } from 'react';
import { Quote, Pencil, Loader2 } from 'lucide-react';
import { ConfidenceChip } from './ConfidenceChip';
import { formatValue, parseInputValue, toInputValue } from '@/lib/format';
import type { ExtractedField, FieldSpec } from '@/shared/schema';

export function FieldRow({
  spec,
  field,
  original,
  active,
  saving,
  readOnly,
  activeClassName,
  onSelect,
  onCommit,
}: {
  spec: FieldSpec;
  field: ExtractedField<unknown>;
  original: ExtractedField<unknown> | undefined;
  active: boolean;
  saving: boolean;
  readOnly: boolean;
  /** Section-tinted highlight, so a selected row is placed by colour too. */
  activeClassName: string;
  onSelect: () => void;
  onCommit: (value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function beginEdit() {
    if (readOnly) return;
    setDraft(toInputValue(field.value));
    setEditing(true);
  }

  function commit(raw: string) {
    setEditing(false);
    const next = parseInputValue(raw, spec);
    if (next === (field.value ?? null)) return;
    onCommit(next);
  }

  const missing = field.value === null || field.value === undefined;
  const showsOriginal = field.edited && original && original.value !== field.value;
  // A row needing a decision is marked in the margin, so triage does not depend
  // on reading every confidence chip.
  const flagged = field.confidence === 'low' || field.confidence === 'not_found';

  return (
    <div
      onClick={onSelect}
      className={`group relative grid cursor-pointer grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
        active ? activeClassName : 'border-transparent hover:border-rule hover:bg-white'
      }`}
    >
      {flagged && !readOnly ? (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-amber-400" />
      ) : null}

      <div className="pt-0.5">
        <div className="text-xs font-medium text-ink">{spec.label}</div>
        {field.edited ? (
          <span className="mt-1 inline-flex items-center rounded border border-accent-ring bg-white px-1.5 py-px text-2xs font-medium text-accent">
            edited
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        {editing ? (
          spec.enumValues ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="focus-ring w-full rounded border border-accent-ring bg-white px-2 py-1 text-sm text-ink"
            >
              <option value="">— not found —</option>
              {spec.enumValues.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={spec.kind === 'date' ? 'YYYY-MM-DD' : 'Enter a value'}
              className="focus-ring w-full rounded border border-accent-ring bg-white px-2 py-1 text-sm text-ink"
            />
          )
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              beginEdit();
            }}
            disabled={readOnly}
            title={readOnly ? 'This deal is approved and locked' : 'Click to edit'}
            className={`focus-ring -mx-1 w-full rounded px-1 text-left text-sm ${
              missing ? 'text-ink-faint' : 'tnum text-ink'
            } ${readOnly ? 'cursor-default' : 'hover:bg-white'}`}
          >
            <span className="inline-flex w-full items-center gap-1.5">
              <span className="min-w-0 truncate">{formatValue(field.value, spec)}</span>
              {saving ? <Loader2 size={12} className="shrink-0 animate-spin text-ink-faint" /> : null}
              {!readOnly && !saving ? (
                <Pencil size={11} className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
              ) : null}
            </span>
          </button>
        )}

        {showsOriginal ? (
          <div className="mt-1 hidden text-2xs text-ink-faint group-hover:block">
            Artificer extracted: <span className="tnum">{formatValue(original?.value ?? null, spec)}</span>
          </div>
        ) : null}

        {active && field.sourceQuote ? (
          <blockquote className="mt-2 border-l-2 border-accent-ring pl-2.5 text-2xs italic leading-relaxed text-ink-muted">
            “{field.sourceQuote}”
          </blockquote>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        {field.sourceLocation ? (
          <Quote size={12} className={active ? 'text-accent' : 'text-ink-faint'} aria-label="Has a source citation" />
        ) : (
          <span className="inline-block w-3" aria-hidden />
        )}
        <ConfidenceChip confidence={field.confidence} />
      </div>
    </div>
  );
}
