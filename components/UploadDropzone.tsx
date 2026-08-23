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
        className={`rounded-lg border border-dashed bg-panel px-6 py-9 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : 'border-rule'
        } ${busyFile ? 'opacity-90' : ''}`}
      >
        {busyFile ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={20} className="animate-spin text-accent" />
            <p className="text-sm font-medium text-ink">{STAGES[stage]}…</p>
            <p className="text-xs text-ink-muted">{busyFile}</p>
            <p className="mt-1 text-2xs text-ink-faint">A long offering memo can take a minute.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <FileUp size={20} className="text-ink-faint" />
            <p className="text-sm text-ink">
              Drop an offering memo, lease or LOI here
            </p>
            <p className="text-xs text-ink-muted">PDF, up to 20 MB</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="focus-ring mt-2 rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
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
