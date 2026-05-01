'use client';

// Admin batch edit panel (Cell 6.4). Drives the three batch Server
// Actions (contamination judgement, available units, CoA upload). Each
// form runs inside its own `useTransition` so a slow upload doesn't
// block the QA buttons.

import { useTransition, useState, type FormEvent } from 'react';
import {
  setContaminationResult,
  setAvailableUnits,
  uploadCoa,
  type BatchActionResult,
} from '@/app/actions/batches';
import type { ContaminationResult } from '@/lib/data/admin-batches';

type Feedback = { kind: 'ok' | 'err'; message: string } | null;

export function BatchEditForms({
  batchId,
  contaminationCheck,
  availableUnits,
  hasCoa,
}: {
  batchId: string;
  contaminationCheck: ContaminationResult;
  availableUnits: number;
  hasCoa: boolean;
}) {
  return (
    <div className="space-y-6">
      <ContaminationPanel
        batchId={batchId}
        contaminationCheck={contaminationCheck}
      />
      <AvailableUnitsPanel
        batchId={batchId}
        availableUnits={availableUnits}
      />
      <CoaUploadPanel batchId={batchId} hasCoa={hasCoa} />
    </div>
  );
}

// ── Contamination ─────────────────────────────────────────────

function ContaminationPanel({
  batchId,
  contaminationCheck,
}: {
  batchId: string;
  contaminationCheck: ContaminationResult;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const terminal = contaminationCheck !== 'pending';

  const judge = (next: 'pass' | 'fail') => {
    setFeedback(null);
    startTransition(async () => {
      const res = await setContaminationResult(batchId, next);
      apply(res, setFeedback);
    });
  };

  return (
    <Panel title="Contamination check">
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => judge('pass')}
          disabled={pending || terminal}
          className="bg-navy px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark pass
        </button>
        <button
          type="button"
          onClick={() => judge('fail')}
          disabled={pending || terminal}
          className="border-[3px] border-dotted border-[color:var(--dot)] px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-ink transition-opacity hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark fail
        </button>
        {pending ? (
          <span className="text-[11px] uppercase tracking-wider3 text-ink3">
            Working…
          </span>
        ) : null}
      </div>
      {terminal ? (
        <div className="mt-3 text-[11px] text-ink3">
          Terminal — already marked {contaminationCheck}.
        </div>
      ) : null}
      <FeedbackLine feedback={feedback} />
    </Panel>
  );
}

// ── Available units ───────────────────────────────────────────

function AvailableUnitsPanel({
  batchId,
  availableUnits,
}: {
  batchId: string;
  availableUnits: number;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [value, setValue] = useState<string>(String(availableUnits));

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      setFeedback({
        kind: 'err',
        message: 'Enter a whole number ≥ 0.',
      });
      return;
    }
    startTransition(async () => {
      const res = await setAvailableUnits(batchId, n);
      apply(res, setFeedback);
    });
  };

  return (
    <Panel title="Available units">
      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="w-32 border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 font-mono text-[12px] text-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-yellow px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-navy transition-opacity hover:bg-yellow2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Update
        </button>
        {pending ? (
          <span className="text-[11px] uppercase tracking-wider3 text-ink3">
            Saving…
          </span>
        ) : null}
      </form>
      <FeedbackLine feedback={feedback} />
    </Panel>
  );
}

// ── CoA upload ────────────────────────────────────────────────

function CoaUploadPanel({
  batchId,
  hasCoa,
}: {
  batchId: string;
  hasCoa: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.currentTarget);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setFeedback({ kind: 'err', message: 'Choose a PDF first.' });
      return;
    }
    startTransition(async () => {
      const res = await uploadCoa(batchId, formData);
      apply(res, setFeedback);
      if (res.ok) setFileName(null);
    });
  };

  return (
    <Panel title={hasCoa ? 'Replace CoA PDF' : 'Upload CoA PDF'}>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <input
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          disabled={pending}
          className="block w-full text-[12px] text-ink2 file:mr-3 file:border-[3px] file:border-dotted file:border-[color:var(--dot)] file:bg-transparent file:px-3 file:py-1.5 file:font-sans file:text-[10px] file:uppercase file:tracking-wider3 file:text-ink"
        />
        {fileName ? (
          <div className="text-[11px] mono text-ink2">{fileName}</div>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-navy px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Upload
          </button>
          {pending ? (
            <span className="text-[11px] uppercase tracking-wider3 text-ink3">
              Uploading…
            </span>
          ) : null}
        </div>
      </form>
      <FeedbackLine feedback={feedback} />
    </Panel>
  );
}

// ── Shared bits ───────────────────────────────────────────────

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        {title}
      </div>
      {children}
    </div>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div
      className={`mt-3 text-[11px] uppercase tracking-wider3 ${
        feedback.kind === 'ok' ? 'text-ink' : 'text-amber-700'
      }`}
    >
      {feedback.message}
    </div>
  );
}

function apply(
  res: BatchActionResult,
  setFeedback: (f: Feedback) => void,
): void {
  if (res.ok) {
    setFeedback({ kind: 'ok', message: res.message ?? 'Saved.' });
  } else {
    setFeedback({ kind: 'err', message: res.error });
  }
}
