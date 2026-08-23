import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford-ish: no i, l, o, u

/**
 * Short, sortable-ish, URL-safe id. Time prefix keeps deals roughly ordered on
 * a plain key listing, which is all the ordering the demo needs.
 */
export function newId(prefix = ''): string {
  const time = Date.now().toString(32).padStart(9, '0');
  const bytes = crypto.randomBytes(6);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix}${time}${rand}`;
}
