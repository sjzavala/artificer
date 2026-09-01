# Borrower Search Integration Plan

## Overview

Integrate the borrower-search tool (a loan borrower search/filter/management system) into artificer as a new feature, with Claude AI-powered natural language search.

---

## Architecture Comparison

| | Borrower Search | Artificer |
|---|---|---|
| Backend | Express (Node) | Next.js App Router (serverless) |
| Frontend | React + Vite (SPA) | React + Next.js (SSR/RSC) |
| Database | PostgreSQL (Docker) | JSON files / Vercel Blob |
| Auth | Session cookies + PostgreSQL | Single access code gate |

---

## 1. Move Borrower Search Into Artificer

### Database

Borrower-search requires PostgreSQL with 60 seeded records + schema for borrowers, users, and sessions. Vercel doesn't host databases natively. Options:

- **Vercel Postgres (Neon-backed)** — path of least resistance, managed, serverless-friendly
- **Supabase** — more features, slightly more setup
- **Flatten to Vercel Blob / static JSON** — loses SQL query power that makes search work; not recommended

**Decision needed:** Which database provider?

### API Routes

Port the 6 Express endpoints from `server/routes.js` and `server/auth.js` into Next.js API routes:

| Express Endpoint | New Next.js Route |
|---|---|
| `GET /api/borrowers` | `app/api/borrower-search/route.ts` |
| `GET /api/borrowers/:id` | `app/api/borrower-search/[id]/route.ts` |
| `PATCH /api/borrowers/:id/status` | `app/api/borrower-search/[id]/status/route.ts` |
| `POST /api/login` | `app/api/borrower-search/login/route.ts` |
| `POST /api/logout` | `app/api/borrower-search/logout/route.ts` |
| `GET /api/me` | `app/api/borrower-search/me/route.ts` |

Translation is mostly mechanical: Express `req/res` → Next.js `Request`/`NextResponse`.

### Frontend

- Port `client/src/App.jsx` (single-file React component) into `app/borrower-search/page.tsx`
- Convert to TypeScript
- Swap Vite proxy calls for direct Next.js API route calls
- Adopt artificer's Tailwind styling
- Add "Borrower Search" to `AppShell` nav sidebar

### Auth

Borrower-search has its own role-based auth (analyst, underwriter, admin). Two options:

- **Drop it** — rely on artificer's existing access gate; all users get full access
- **Keep it** — preserve role-based access as a feature (read-only analyst vs. status-editing underwriter/admin)

---

## 2. Claude AI Integration

The `ANTHROPIC_API_KEY` already configured in artificer's Vercel environment works for this — no new key needed.

### Option A: Query Translator (Simpler)

Add a natural-language search input. User types "show me all approved borrowers in California with credit scores above 750" and Claude translates it into structured query params (`status=Approved&state=CA&minScore=750`).

**Requires:**
- New API route: `app/api/borrower-search/ai-query/route.ts`
  1. Takes natural language query
  2. Calls Claude via Anthropic SDK (already a dependency) using **tool use**
  3. Claude returns structured search params
  4. Execute search internally, return results
- Text input component on the borrower search page

### Option B: Full Tool-Use Chat (More Powerful)

Build a lightweight chat interface where Claude can autonomously search, filter, and reason about borrower data across multiple turns.

**Requires:**
- Tool schema definition:
  ```typescript
  {
    name: "search_borrowers",
    description: "Search and filter loan borrower records",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or email search" },
        status: { enum: ["Approved", "Pending", "Denied", "Under Review"] },
        minScore: { type: "integer" },
        sortBy: { enum: ["name", "creditScore", "loanAmount", "submittedAt"] }
      }
    }
  }
  ```
- Conversation API route running a tool-use loop (message → Claude calls tool → execute search → return results → Claude summarizes)
- Chat UI component

**Decision needed:** Option A (query translator) vs Option B (full tool-use chat)?

---

## 3. Make It a Feature of Artificer

Artificer currently has one workflow (PDF → extraction → review → Salesforce). Adding borrower search makes it a multi-feature app.

### New Files

```
app/
  borrower-search/
    page.tsx                          # Search UI (ported from App.jsx)
  api/
    borrower-search/
      route.ts                        # GET — search/filter borrowers
      login/route.ts                  # POST — authenticate
      logout/route.ts                 # POST — clear session
      me/route.ts                     # GET — current user
      ai-query/route.ts              # POST — Claude-powered NL search
      [id]/
        route.ts                      # GET — single borrower
        status/route.ts               # PATCH — update status
lib/
  borrower-search/
    db.ts                             # PostgreSQL connection (Neon/Supabase)
    seed.ts                           # 60 deterministic borrower records
    queries.ts                        # SQL query builders
    types.ts                          # TypeScript types
components/
  BorrowerSearchPage.tsx              # Main search UI component
  BorrowerTable.tsx                   # Results table
  BorrowerSearchBar.tsx               # Search/filter controls
  AiSearchInput.tsx                   # Natural language search input
```

### Integration Points

- **Navigation:** Add to `AppShell` sidebar
- **Gate:** Automatically behind artificer's existing access gate middleware
- **Styling:** Inherits Tailwind config and design language
- **API key:** Shares existing `ANTHROPIC_API_KEY`

---

## Cleanup: Fix Planted Bugs

Borrower-search has 10 intentional bugs for QA training. These must be fixed before production use:

1. **BUG-1** — Case-sensitive search (should be case-insensitive)
2. **BUG-2** — Untrimmed query whitespace
3. **BUG-3** — Pagination returns `limit - 1` rows
4. **BUG-4** — Total count ignores WHERE filters
5. **BUG-5** — Credit score filter is exclusive instead of inclusive
6. **BUG-6** — Loan amount sorted as text instead of number
7. **BUG-7** — XSS via `dangerouslySetInnerHTML`
8. **BUG-8** — Full SSN exposed in API response (masked only in UI)
9. **BUG-9** — Stale response race condition (no abort controller)
10. **BUG-10** — (See PLANTED-BUGS.md for details)

---

## Step-by-Step Execution Order

| Step | Effort | Description |
|---|---|---|
| 1 | Small | Set up PostgreSQL on Vercel (Neon or Supabase) |
| 2 | Small | Create `lib/borrower-search/` with DB connection, types, seed data |
| 3 | Small-Medium | Port Express routes → Next.js API routes |
| 4 | Small-Medium | Port React SPA → Next.js page + components (TypeScript) |
| 5 | Trivial | Add to AppShell navigation |
| 6 | Small | Fix all 10 planted bugs |
| 7 | Medium | Add Claude AI search capability (Option A or B) |
| 8 | Small | Seed data migration strategy (run on deploy or pre-populate) |
| 9 | Small | Test end-to-end on Vercel |

---

## Key Decisions Before Starting

1. **Database provider** — Vercel Postgres (Neon) vs Supabase
2. **Claude integration style** — Option A (query translator) vs Option B (full tool-use chat)
3. **Role-based auth** — Keep borrower-search roles or drop in favor of artificer's gate
