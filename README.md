# Talivity AI Visibility Audit

A working prototype that audits how the major AI assistants (ChatGPT, Claude, Gemini) describe a company to job seekers. Built for Talivity as a lead-gen tool.

A user enters `company + industry + email`. The app generates ~10 candidate-style queries, fans them out across the three LLMs (30 calls total, in parallel), parses each response for source citations and competitor mentions, scores AI visibility 0–100, and stores the result in MongoDB for sales follow-up.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **TypeScript**, **Tailwind CSS**
- **MongoDB** via **Mongoose** (Railway plugin in prod)
- **openai**, **@anthropic-ai/sdk**, **@google/generative-ai**
- **Recharts**, **Lucide**, **shadcn/ui** primitives
- **Railway** for deployment

## Project layout

```
app/
  page.tsx                 Landing form
  audit/[id]/page.tsx      Results (loads from MongoDB)
  api/audit/route.ts       POST: kick off audit, save, return id
  api/audit/[id]/route.ts  GET: fetch a saved audit
  api/health/route.ts      GET: Railway health check
components/
  landing-screen.tsx
  loading-screen.tsx
  results-screen.tsx
  confirmation-screen.tsx
lib/
  audit-engine.ts          Orchestrator: queries -> LLMs -> parse -> score
  llm-clients.ts           OpenAI / Anthropic / Gemini wrappers
  query-templates.ts       10 questions per industry, competitor lists
  citation-parser.ts       Regex-based source + competitor detection
  scoring.ts               0-100 composite score
  mongodb.ts               Cached Mongoose connection (serverless-safe)
models/
  audit.ts                 Mongoose schema
next.config.js             output: 'standalone'
railway.json               Railway build / deploy / healthcheck
.env.example
```

## Local development

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in keys
cp .env.example .env.local

# 3. Have MongoDB running locally (or point MONGO_URL at Atlas/Railway)
#    For local dev:
#      brew services start mongodb-community
#      (default URL: mongodb://localhost:27017/talivity-audit)

# 4. Run the dev server
npm run dev
```

Open <http://localhost:3000>, fill in the form, watch the audit run.

### Env vars

| Name | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | sk-... |
| `ANTHROPIC_API_KEY` | yes | sk-ant-... |
| `GOOGLE_AI_API_KEY` | yes | Google AI Studio key (Gemini) |
| `MONGO_URL` | yes | Mongo connection string. Locally `mongodb://localhost:27017/talivity-audit`; on Railway auto-injected by the MongoDB plugin. |
| `NEXT_PUBLIC_APP_URL` | no | Public base URL for og tags / emails |

## Deploying to Railway

1. **Create a new Railway project** and connect this GitHub repo. Railway auto-detects Next.js via Nixpacks; `railway.json` is included as a fallback.
2. **Add the MongoDB plugin** to the project. Railway auto-injects `MONGO_URL` into the Next.js service — no manual wiring needed.
3. **Add the three LLM API keys** in the service's Variables tab:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_AI_API_KEY`
4. (Optional) Set `NEXT_PUBLIC_APP_URL` to the Railway-generated domain.
5. **Deploy.** Railway runs `npm run build` then `npm start`. `npm start` honors Railway's dynamic `$PORT`. Health checks hit `/api/health`.

### Why standalone output?

`next.config.js` sets `output: 'standalone'`, which produces a self-contained server bundle (~1/10 the size of `.next` + `node_modules`). This shrinks deploy time and image size on Railway.

### Why the Mongoose global cache?

Next.js dev (and certain Railway hot-reload scenarios) recompile module scope frequently. Without a global cache, every request opens a fresh Mongoose connection and the pool explodes within seconds. The pattern in `lib/mongodb.ts` is the canonical fix.

## How the audit engine works

For each audit:

1. **Generate queries.** 10 industry-specific candidate questions, with `{company}` substituted.
2. **Parallel LLM fan-out.** 30 simultaneous calls (10 queries × 3 platforms). Per-call try/catch — one provider failing doesn't kill the run.
3. **Parse each response** for: own-site citations (careers/jobs subdomains, "their site"), Glassdoor / Indeed / Reddit / LinkedIn / Wikipedia, news outlets, and industry-specific competitor names.
4. **Sentiment pass.** One additional cheap LLM classification on the aggregated text (positive / neutral / negative).
5. **Score.** Composite of:
   - 50 pts — owned-vs-third-party citation ratio
   - 25 pts — sentiment
   - 15 pts — competitive dominance
   - 10 pts — source diversity (penalize one source dominating)

   Capped at 95 — no perfect scores in the prototype.
6. **Persist.** Update the audit document with status `complete`, score, source mix, sample responses, competitor breakdown.

### "Not recognized" handling

If a majority of successful responses say variants of "I don't have specific information about this company," the audit is flagged `notRecognized` and the results screen shows a softer message instead of a 0-score report.

## API surface

| Method | Path | Body / Params | Result |
| --- | --- | --- | --- |
| `POST` | `/api/audit` | `{ companyName, industry, email }` | `{ auditId }` (200) / `{ error, ... }` (400/429/500) |
| `GET` | `/api/audit/[id]` | — | `{ audit }` |
| `GET` | `/api/health` | — | `{ status: 'ok' }` |

`POST /api/audit` rate-limits to **one audit per email per hour** (DB lookup, not in-memory — works across Railway replicas).

## Testing the audit end-to-end

After setting env vars:

```bash
curl -X POST http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Kaiser Permanente",
    "industry": "Healthcare",
    "email": "test@example.com"
  }'
```

The POST blocks ~20–40 s while the audit runs. Take the returned `auditId` and visit `http://localhost:3000/audit/<id>`.

## What's a prototype-grade simplification?

- The audit runs **inline** inside the POST handler (no job queue). The frontend just sits on the loading screen until the response returns. For production volume, move `runAudit()` to a background worker and have the frontend poll `GET /api/audit/[id]`.
- Competitor lists are **hardcoded** per industry. Production would pull these from a managed source.
- No auth, no admin panel, no email send — the captured leads sit in Mongo for sales to pull.
