import type { Citation } from '@/lib/ask/types';
import type { MatchResult } from './match';

/** A document passage, carrying the deal it came from so the UI can link to it. */
export interface FactotumCitation extends Citation {
  dealId: string;
}

/**
 * One tool call, as the UI shows it.
 *
 * The factotum is read-only, so showing its work costs nothing and buys the
 * thing that matters: a broker can see that "eleven buyers fit" came from
 * scoring the book rather than from the model's impression of it.
 */
export interface ToolRun {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  /** One line for the UI — "11 fit, 3 near misses". */
  summary: string;
  /** What the model receives back. */
  result: unknown;
  /** Verified passages, when the tool read a document. */
  citations?: FactotumCitation[];
  /** The full scoring, when the tool matched buyers, so the UI can render cards. */
  match?: MatchResult;
}

/** A turn in the conversation, as the client stores and replays it. */
export interface FactotumTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Assistant turns only: what it looked up to answer. */
  toolRuns?: ToolRun[];
}

/**
 * One thing that happened while the factotum worked, sent to the browser as it
 * happens rather than collected and posted at the end.
 *
 * A question takes six to twenty seconds because the model writes most of the
 * answer at about forty tokens a second — measured, not guessed. None of that
 * gets faster by asking politely, but almost none of it has to be spent staring
 * at a spinner: the lookups land in the first few seconds and the text arrives
 * steadily after. Streaming does not make it quicker, it stops it feeling
 * broken.
 */
export type FactotumEvent =
  /** A lookup finished. The card can appear now rather than with everything else. */
  | { type: 'tool'; run: ToolRun }
  /** A fragment of the answer, in the order it was written. */
  | { type: 'text'; delta: string }
  /**
   * Drop the text so far.
   *
   * A turn can write a line — "let me check the pipeline" — and then call a
   * tool, which supersedes it. Streaming means that line is already on screen
   * by the time we know it was preamble, so it is shown while it is the newest
   * thing and cleared when the lookup it announced comes back.
   */
  | { type: 'reset_text' }
  /** The run is over; carries what only the end knows. */
  | { type: 'done'; durationMs: number; truncated: boolean }
  | { type: 'error'; error: string };

export interface FactotumReply {
  answer: string;
  toolRuns: ToolRun[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  /** True when the loop hit its ceiling before the model was finished. */
  truncated: boolean;
}

export const QUESTION_MAX_LENGTH = 500;
/** How many prior turns travel back with a question. */
export const MAX_HISTORY_TURNS = 12;
