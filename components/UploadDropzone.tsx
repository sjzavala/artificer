'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, TriangleAlert } from 'lucide-react';
import { requireReviewerName } from '@/lib/reviewer';

const STAGES = [
  'Reading the PDF',
  'Locating deal terms',
  'Extracting fields with citations',
  'Verifying every citation against the document',
];

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setBusyFile(file.name);
      setStage(0);

      // Extraction is a genuinely slow operation. Naming what is happening beats
      // a spinner that leaves the reviewer wondering whether it hung.
      const ticker = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);

      try {
        const body = new FormData();
        body.append('file', file);
        body.append('actor', requireReviewerName());

        const res = await fetch('/api/extract', { method: 'POST', body });
        const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: string };

        if (!res.ok || !payload.id) {
          setError(payload.error ?? 'Extraction failed.');
          return;
        }
        router.push(`/deals/${payload.id}`);
      } catch {
        setError('The upload could not be completed. Check your connection and try again.');
      } finally {
        window.clearInterval(ticker);
        setBusyFile(null);
      }
    },
    [router],
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed px-6 py-10 text-center transition-all ${
          dragging
            ? 'border-accent bg-accent-soft shadow-card'
            : 'border-rule-strong bg-panel/70 hover:border-ink-faint hover:bg-panel'
        }`}
      >
        {busyFile ? (
          <div className="flex flex-col items-center gap-2">
            <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-accent-ring bg-accent-soft">
              <Loader2 size={17} className="animate-spin text-accent" />
            </span>
            <p className="text-sm font-medium text-ink">{STAGES[stage]}…</p>
            <p className="max-w-[18rem] truncate text-xs text-ink-muted">{busyFile}</p>

            {/* Named stages, not a bare spinner: extraction genuinely takes a
                while, and silence reads as a hang. */}
            <ol className="mt-2.5 flex items-center gap-1.5" aria-hidden>
              {STAGES.map((_, i) => (
                <li
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i <= stage ? 'w-7 bg-accent' : 'w-4 bg-rule'
                  }`}
                />
              ))}
            </ol>
            <p className="mt-1 text-2xs text-ink-faint">A long offering memo can take a minute.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-rule bg-sunken">
              <FileUp size={17} className="text-ink-muted" />
            </span>
            <p className="text-sm font-medium text-ink">Drop a deal document here</p>
            <p className="text-xs text-ink-muted">Offering memo, lease or LOI — PDF, up to 20 MB</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="focus-ring mt-3 rounded-lg border border-rule-strong bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-card transition-colors hover:border-ink-faint"
            >
              Choose a file
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-700">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
