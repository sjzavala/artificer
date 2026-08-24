import { netLeaseExtractionSchema, type NetLeaseExtraction, allFields } from '@/shared/schema';

/**
 * Defensive parsing of the model's response.
 *
 * Claude is asked for bare JSON, and usually obliges — but "usually" is not a
 * contract, so this layer tolerates code fences and leading prose, then hands
 * any remaining failure back as a list of concrete errors the retry prompt can
 * quote. Nothing here guesses at a value; repair is structural only.
 */

export type ParseFailureStage = 'empty' | 'no_json' | 'invalid_json' | 'schema';

export type ParseResult =
  | { ok: true; data: NetLeaseExtraction }
  | { ok: false; stage: ParseFailureStage; errors: string[] };

export function parseExtractionResponse(raw: string): ParseResult {
  const text = (raw ?? '').trim();
  if (!text) return { ok: false, stage: 'empty', errors: ['The model returned an empty response.'] };

  const candidate = extractJsonObject(stripCodeFences(text));
  if (!candidate) {
    return { ok: false, stage: 'no_json', errors: ['No JSON object was found in the response.'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return {
      ok: false,
      stage: 'invalid_json',
      errors: [`The response was not valid JSON: ${(err as Error).message}`],
    };
  }

  const result = netLeaseExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, stage: 'schema', errors: formatZodErrors(result.error) };
  }

  return { ok: true, data: normaliseExtraction(result.data) };
}

/** Removes ```json … ``` wrappers the model sometimes adds despite instructions. */
export function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Returns the outermost balanced JSON object, ignoring braces inside strings.
 * Cheaper and far more predictable than a regex when the model wraps its answer
 * in a sentence of apology.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

interface ZodLikeError {
  issues: Array<{ path: Array<string | number>; message: string }>;
}

export function formatZodErrors(error: ZodLikeError): string[] {
  return error.issues.slice(0, 25).map((issue) => {
    const path = issue.path.join('.') || '(root)';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Enforces the invariants the UI depends on, without ever changing a value:
 * a null value means not_found and carries no citation, and a cited value keeps
 * its quote. This is the difference between "the model was sloppy about the
 * envelope" and "the model was wrong about the deal" — only the former is fixed.
 */
export function normaliseExtraction(extraction: NetLeaseExtraction): NetLeaseExtraction {
  for (const { field } of allFields(extraction)) {
    if (field.value === null || field.value === undefined) {
      field.value = null;
      field.confidence = 'not_found';
      field.sourceQuote = null;
      field.sourceLocation = null;
    } else if (field.confidence === 'not_found') {
      // A value with a not_found grade is contradictory; the value is evidence
      // the model found something, so downgrade the grade rather than the value.
      field.confidence = 'low';
    }
    if (typeof field.sourceQuote === 'string') {
      field.sourceQuote = field.sourceQuote.replace(/\s+/g, ' ').trim() || null;
    }
    field.edited = Boolean(field.edited);

    // An "alternative" equal to the chosen value is noise, and would show the
    // reviewer a button that changes nothing.
    field.alternatives = (field.alternatives ?? [])
      .filter((alternative) => alternative.value !== null && alternative.value !== field.value)
      .map((alternative) => ({
        ...alternative,
        sourceQuote:
          typeof alternative.sourceQuote === 'string'
            ? alternative.sourceQuote.replace(/\s+/g, ' ').trim() || null
            : null,
      }));
  }
  return extraction;
}
