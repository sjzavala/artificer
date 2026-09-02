/**
 * Asking a question of a deal document.
 *
 * The shape is built around one rule: nothing is shown as fact unless a passage
 * in this document supports it, and the passage has been checked. Extraction
 * already works that way for its twenty-four fields; this extends the same
 * bargain to an unbounded question.
 */

export const QUESTION_MAX_LENGTH = 400;

/** A passage backing one claim, after verification against the document. */
export interface Citation {
  /** 1-based, referenced from the answer text as `[1]`. */
  marker: number;
  /** The supporting text, exactly as it appears in the document. */
  quote: string;
  /** Anchor id (`p-34`) — resolved by us, not trusted from the model. */
  sourceLocation: string;
  /** True when the model's own anchor was already right. Useful as a drift signal. */
  modelAnchorCorrect: boolean;
}

export interface Answer {
  /** False when the document simply does not address the question. */
  answered: boolean;
  /** Prose carrying `[n]` markers that match `citations`. */
  answer: string;
  citations: Citation[];
  /**
   * True when the model answered but every passage it offered failed to
   * verify — a fabricated citation. The answer is still returned, because the
   * reviewer asked for it, but it is shown as unsupported rather than as fact.
   */
  unsupported: boolean;
  /** Citations the model produced that were not found in the document. */
  droppedCitations: number;
}

export interface AskOutcome extends Answer {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache accounting, so the saving is visible rather than assumed. */
  cacheCreationTokens: number;
  cacheReadTokens: number;
  durationMs: number;
}
