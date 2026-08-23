# Artificer

Artificer is a **tool, not a chatbot**: you drop in a net-lease deal document, Claude
extracts the structured deal data with a confidence score and a verbatim source
citation for every field, and you review it side by side with the document.

Nothing reaches Salesforce until a human clicks approve. The AI drafts; the
person decides; the audit log records who decided what.

---

## What it does

1. **Upload** an offering memorandum, lease or LOI (PDF).
2. **Extract** — a server-side Claude call returns 24 net-lease fields, each with a
   value, a confidence grade, and the exact passage it came from.
3. **Review** — a side-by-side approval screen. Clicking a field scrolls the
   document to its cited passage and highlights it. Low-confidence and missing
   fields are listed in a "Needs attention" strip. Values are inline-editable and
   every edit is tracked.
4. **Approve** — an explicit confirmation, then four related Salesforce records
   (`Property__c`, `Tenant__c`, `Lease__c`, `Deal__c`). Mock by default; real org
   via config.
5. **Audit** — an append-only timeline of every upload, extraction, edit, approval
   and rejection.

There is no chat interface anywhere in the product, by design.

---

## Local setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local     # then fill in ANTHROPIC_API_KEY and the gate values
npm run seed                   # plants the sample deal so the app is never empty
npm run dev                    # http://localhost:3000
```

Generate the two gate values:

```bash
# session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# access code — anything memorable
```

The app opens on the access gate. Enter `ARTIFICER_ACCESS_CODE` to get in.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Server-side only. Never sent to the browser. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-6`. |
| `ARTIFICER_ACCESS_CODE` | yes | The shared code on the gate page. |
| `ARTIFICER_SESSION_SECRET` | yes | HMAC key for the session cookie. 32+ bytes. |
| `BLOB_READ_WRITE_TOKEN` | prod | Present ⇒ the Vercel Blob store activates. |
| `ARTIFICER_STORE` | no | Force `local` or `blob`, overriding the above. |
| `ARTIFICER_DATA_DIR` | no | Where `LocalFileStore` writes. Defaults to `./data`. |
| `SF_LOGIN_URL`, `SF_USERNAME`, `SF_PASSWORD` | no | All three present ⇒ the real Salesforce adapter activates. |
| `SF_INSTANCE_URL` | no | Enables link-out to the record in the org. |

---

## The access gate

A single shared code, checked against `ARTIFICER_ACCESS_CODE`. A correct code
sets an httpOnly cookie signed with `ARTIFICER_SESSION_SECRET` (HMAC-SHA256,
12-hour expiry). Middleware protects every page and every API route except the
gate itself. Attempts are rate-limited to 8 per minute per IP.

**This is not authentication.** There are no user accounts and no per-user
permissions. It is a demonstration lock so that a public URL cannot burn API
tokens or expose demo deal data. Do not put real deal data behind it.

### Rotating the access code

```bash
vercel env rm ARTIFICER_ACCESS_CODE production
vercel env add ARTIFICER_ACCESS_CODE production   # paste the new code
vercel --prod                                     # redeploy to pick it up
```

Existing sessions stay valid until their cookie expires. To invalidate every
session immediately, rotate `ARTIFICER_SESSION_SECRET` instead — but note that
the Blob storage namespace is derived from that secret, so rotating it makes
previously stored deals unreachable. Rotate the code, not the secret, unless you
intend to reset the data too.

---

## Storage

One interface, two implementations, chosen by environment:

- **`LocalFileStore`** — JSON files under `/data` (gitignored). Used in development.
- **`BlobStore`** — the same JSON documents as Vercel Blob objects. Used in
  production, activated by the presence of `BLOB_READ_WRITE_TOKEN`.

Nothing above the seam knows which is live; the header shows which one is.

Two honest limitations: the audit log is a single JSON document appended under an
in-process lock, so it assumes one writer at a time; and Vercel Blob is
public-read, so keys live under a namespace derived from the session secret —
obfuscation, not access control.

---

## Mock vs real Salesforce

Mock is the default and needs no configuration. It persists record sets through
the storage adapter and renders them at `/records/[id]` in a CRM-like record
view, so the demo has a real landing point.

Setting `SF_LOGIN_URL`, `SF_USERNAME` and `SF_PASSWORD` switches the same write
to a live org via jsforce. See **[docs/salesforce-schema.md](docs/salesforce-schema.md)**
for the exact objects, fields and picklist values to create, and for the
external-ID field that makes re-approval idempotent.

A partial SF configuration falls back to mock rather than failing at the moment
of approval.

---

## Tests

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

Covers the extraction response parser (fences, prose, malformed JSON, schema
violations), the schema registry (the prompt, UI and evals cannot drift apart),
provenance anchoring, the storage adapter contract, the Salesforce adapter
contract and idempotency hashing, and the access gate.

---

## Architecture

```
app/                    Next.js App Router — pages and API routes
  gate/                 access code page
  page.tsx              deals list + upload
  deals/[id]/           the approval screen
  records/[id]/         mock CRM record view
  audit/                audit timeline
  api/                  extract, gate, field edit, approve, reject
components/             hand-styled React components, no UI library
lib/
  extraction/           PDF → paragraphs → Claude → validated schema → anchors
  salesforce/           adapter interface, mock + real, field mapping
  store/                storage interface, local + blob
  audit.ts              append-only log
  session.ts            gate cookie (Web Crypto, runs in Edge and Node)
shared/                 the deal schema — one source of truth
docs/                   Salesforce object/field reference
scripts/                seed
tests/                  vitest
```

The load-bearing idea is `shared/schema.ts`. The extraction prompt, the approval
UI, the Salesforce mapping and the eval comparison all read the same field
registry, so a field cannot exist in one and be missing from another.

Every Claude call happens in a server-side API route. The API key is never
present in a client bundle.
