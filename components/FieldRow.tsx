'use client';

import { useEffect, useRef, useState } from 'react';
import { Quote, Pencil, Loader2, ArrowRightLeft, PlusCircle, Check } from 'lucide-react';
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
  onCommit: (
    value: unknown,
    options?: { sourceQuote?: string | null; sourceLocation?: string | null; confirm?: boolean },
  ) => void;
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
  const alternatives = field.alternatives ?? [];
  // A flag that offers nothing to do about it is a dead end, so a selected row
  // that needs a decision always shows how to resolve it.
  const settled = field.edited || field.confirmed;
  const showResolve = active && !readOnly && !editing && !settled && (flagged || alternatives.length > 0);

  return (
    <div
      data-field-path={spec.path}
      onClick={onSelect}
      /*
       * Phone: label and grade share the top line, the value gets the full width
       * beneath them. A fixed label column starves the value at 375px — every
       * figure truncated to "1…", which is worse than useless on a screen whose
       * whole job is showing values.
       */
      className={`group relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 transition-colors sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:gap-3 ${
        active ? activeClassName : 'border-transparent hover:border-rule hover:bg-white'
      }`}
    >
      {flagged && !readOnly && !(field.edited || field.confirmed) ? (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-amber-400" />
      ) : null}

      <div className="order-1 pt-0.5 sm:order-none">
        <div className="text-xs font-medium text-ink">{spec.label}</div>
        {/* Edited and confirmed are different claims about who decided what, and
            the row says which one applies. */}
        {field.edited ? (
          <span className="mt-1 inline-flex items-center rounded-full bg-accent px-1.5 py-px text-2xs font-medium text-white">
            edited
          </span>
        ) : field.confirmed ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-px text-2xs font-medium text-emerald-800">
            <Check size={9} strokeWidth={3} />
            confirmed
          </span>
        ) : null}
      </div>

      <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
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

        {showResolve ? (
          <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50/70 p-2.5">
            <p className="text-2xs font-medium text-amber-900">
              {alternatives.length > 0
                ? 'The document also states:'
                : missing
                  ? 'Not stated in the document — add it if you know it.'
                  : 'Check this against the document, then confirm or change it.'}
            </p>

            {alternatives.map((alternative, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommit(alternative.value, {
                    sourceQuote: alternative.sourceQuote,
                    sourceLocation: alternative.sourceLocation,
                  });
                }}
                className="focus-ring mt-2 block w-full rounded border border-amber-300 bg-white px-2.5 py-2 text-left transition-colors hover:border-amber-500"
              >
                <span className="flex items-center gap-1.5">
                  <ArrowRightLeft size={11} className="shrink-0 text-amber-700" />
                  <span className="tnum text-xs font-medium text-ink">
                    Use {formatValue(alternative.value, spec)}
                  </span>
                </span>
                {alternative.sourceQuote ? (
                  <span className="mt-1 block text-2xs italic leading-relaxed text-ink-muted">
                    “{alternative.sourceQuote}”
                  </span>
                ) : null}
                {alternative.note ? (
                  <span className="mt-0.5 block text-2xs text-ink-faint">{alternative.note}</span>
                ) : null}
              </button>
            ))}

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  beginEdit();
                }}
                className="focus-ring inline-flex items-center gap-1.5 rounded border border-rule bg-white px-2 py-1 text-2xs font-medium text-ink transition-colors hover:border-ink-faint"
              >
                {missing ? <PlusCircle size={11} /> : <Pencil size={11} />}
                {missing ? 'Add a value' : 'Type a different value'}
              </button>

              {/* Both states need a way to say "I have dealt with this": that the
                  value is right, or that the document genuinely does not state
                  it. Without the second, a not_found field could only ever be
                  cleared by inventing something to put in it. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Confirming re-commits the same value, marking it reviewed
                  // and clearing the flag without changing anything.
                  onCommit(field.value, { confirm: true });
                }}
                className="focus-ring inline-flex items-center gap-1.5 rounded border border-accent-ring bg-white px-2 py-1 text-2xs font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                <Check size={11} />
                {missing ? 'Confirm not stated' : 'Looks right'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="order-2 flex items-center justify-end gap-2 pt-0.5 sm:order-none">
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
