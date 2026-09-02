import type { Citation } from '@/lib/ask/types';
import type { MatchResult } from './match';

/** A document passage, carrying the deal it came from so the UI can link to it. */
export interface CopilotCitation extends Citation {
  dealId: string;
}

/**
 * One tool call, as the UI shows it.
 *
 * The copilot is read-only, so showing its work costs nothing and buys the
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
  citations?: CopilotCitation[];
  /** The full scoring, when the tool matched buyers, so the UI can render cards. */
  match?: MatchResult;
}

/** A turn in the conversation, as the client stores and replays it. */
export interface CopilotTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Assistant turns only: what it looked up to answer. */
  toolRuns?: ToolRun[];
}

export interface CopilotReply {
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
