# Talivity AI Visibility Audit

A working prototype that audits how the major AI assistants (ChatGPT, Claude, Gemini) describe a company to job seekers. Built for Talivity as a lead-gen tool.

A user enters `company website + email`. The app identifies the company (name, aliases, industry, talent competitors), asks ~10 candidate-style questions to each available LLM in parallel (up to 30 calls), judges which answers actually know the company and their tone, parses citations and competitor mentions, scores AI visibility 0–100, and stores the result in MongoDB for sales follow-up.

## Stack

- **Next.js 15** (App Router) + **React 19** — frontend + API routes
- **TypeScript**, **Tailwind CSS**, **Lucide** icons, Manrope via `next/font`
- **MongoDB** via **Mongoose** (Railway plugin in prod)
- **openai**, **@anthropic-ai/sdk**; Gemini via its REST API (the old `@google/generative-ai` SDK is deprecated)
- **Railway** for deployment

## Project layout

```
app/
  page.tsx                     Landing form
  audit/[id]/page.tsx          Loading screen while running, then the report
  thanks/page.tsx              After "Book your strategy session"
  admin/page.tsx               Audits table + provider health (Basic Auth)
  api/audit/route.ts           POST: validate, rate-limit, enqueue, return id (202)
  api/audit/[id]/route.ts      GET: status + progress (no PII) — polled by the loading screen
  api/audit/[id]/cta/route.ts  POST: record a "Book" click (hot lead)
  api/health/route.ts          GET: Railway health check
components/                    landing / loading / results / confirmation screens
lib/
  audit-runner.ts          In-process queue: profile -> audit -> save, progress heartbeats
  company-profile.ts       URL -> company name, aliases, industry, talent competitors
  audit-engine.ts          Queries -> LLMs -> analysis -> parse -> score
  llm-clients.ts           Providers, timeouts, adaptive params, out-of-credits breaker
  analysis.ts              One batched LLM call: does each answer know the company? tone?
  citation-parser.ts       Source + competitor detection
  scoring.ts               0-100 composite score
  rate-limit.ts            Per-email / per-IP / global limits (MongoDB-backed)
  audit-lookup.ts          Public-id lookup, stale-audit expiry
  domain.ts, text.ts       URL parsing, text cleanup
  mongodb.ts               Cached Mongoose connection
models/
  audit.ts                 Mongoose schema
tests/                     `npm test` — parser, domain, scoring, provider-error handling
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

Open <http://localhost:8080>, fill in the form, watch the audit run.

### Env vars

| Name | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | one of the three | sk-... |
| `ANTHROPIC_API_KEY` | one of the three | sk-ant-... |
| `GOOGLE_AI_API_KEY` | one of the three | Google AI Studio key (Gemini). `GEMINI_API_KEY` also works. |
| `MONGO_URL` | yes | Mongo connection string. Locally `mongodb://localhost:27017/talivity-audit`; on Railway auto-injected by the MongoDB plugin. |
| `ADMIN_PASSWORD` / `ADMIN_USER` | yes for `/admin` | Basic Auth for the admin panel |
| `OPENAI_MODEL` / `ANTHROPIC_MODEL` / `GEMINI_MODEL` | no | Override a model when a provider retires one (defaults: `gpt-4o-mini`, `claude-haiku-5-5`, `gemini-3.8-flash`) |
| `HELPER_PROVIDERS` | no | Provider order for the helper steps (company profile, answer analysis). Default `anthropic,openai,gemini` — Claude first |
| `RATE_LIMIT_DISABLED` | no | `true` to switch rate limiting off while testing |
| `RATE_LIMIT_PER_EMAIL_PER_HOUR` / `_PER_IP_PER_HOUR` / `_GLOBAL_PER_DAY` | no | Defaults 3 / 10 / 500 |
| `AUDIT_MAX_CONCURRENCY` | no | Audits running at once per server (default 4) |
| `NEXT_PUBLIC_BOOKING_URL` | no | "Book a call" link (default talivity.com/contact) |
| `NEXT_PUBLIC_APP_URL` | no | Public base URL for og tags |

Any provider without a key — or that starts returning auth/out-of-credit errors — is skipped automatically (and shown as paused in `/admin`), so audits keep running on the rest.

## Deploying to Railway

1. **Create a new Railway project** and connect this GitHub repo. Railway auto-detects Next.js via Nixpacks; `railway.json` is included as a fallback.
2. **Add the MongoDB plugin** to the project. Railway auto-injects `MONGO_URL` into the Next.js service — no manual wiring needed.
3. **Add the LLM API keys** (and `ADMIN_PASSWORD`) in the service's Variables tab:
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

For each audit (runs in the background; the browser polls for progress):

1. **Profile the company.** One LLM call turns the URL into a brand name, aliases, industry and up to 8 talent competitors (merged with a static national list). `careers.walmart.com` → "Walmart"; `kp.org` → "Kaiser Permanente". Falls back to the domain name if no provider answers.
2. **Generate queries.** 10 industry-specific candidate questions (a `General` set for companies outside the 9 industries).
3. **Parallel LLM fan-out.** Up to 30 calls (10 queries × available providers), each with a timeout; stragglers are cut off at 120 s. For recognised companies the prompt names the company — not its URL, which models echoed back and the parser then scored as an owned citation.
4. **Analyse.** One batched LLM call labels every answer: does it actually know the company, and what's the tone? Answers that only say "I don't know them — check Glassdoor" are not counted as citations. Regex fallback if the call fails.
5. **Parse** the substantive answers for owned-site citations, Glassdoor / Indeed / Reddit / LinkedIn / Wikipedia / news / other review sites, and competitor mentions.
6. **Score.** Composite of:
   - 50 pts — owned-vs-third-party citation ratio
   - 25 pts — sentiment
   - 15 pts — competitive dominance
   - 10 pts — source diversity (penalize one source dominating)

   Capped at 95 — no perfect scores.
7. **Persist** the score, source mix, samples, every answer (admin/debugging), per-provider success stats and score breakdown.

### "Not recognized" handling

If 60%+ of the answers don't know the company, the audit is flagged `notRecognized` and the results screen shows a softer message instead of a 0-score report.

## API surface

| Method | Path | Body / Params | Result |
| --- | --- | --- | --- |
| `POST` | `/api/audit` | `{ companyUrl, email }` | `{ auditId }` (202) / `{ error, message }` (400/429/500/503) |
| `GET` | `/api/audit/[id]` | — | `{ audit: { status, companyName, progress } }` — no PII |
| `POST` | `/api/audit/[id]/cta` | — | `{ ok }` — records a "Book" click |
| `GET` | `/api/health` | — | `{ status: 'ok' }` |

`auditId` is a random 16-character id (MongoDB ObjectIds are partly sequential and could be enumerated). Links to audits created before this change keep working by ObjectId.

`POST /api/audit` is rate-limited per email, per IP and globally (MongoDB counts — works across Railway replicas). Failed audits don't count against a person.

## Testing the audit end-to-end

After setting env vars:

```bash
curl -X POST http://localhost:8080/api/audit \
  -H 'Content-Type: application/json' \
  -d '{ "companyUrl": "kp.org", "email": "test@example.com" }'
```

The POST returns immediately; open `http://localhost:8080/audit/<auditId>` to watch it run (typically 10–60 s).

Unit tests: `npm test`.

## Known limitations

- Audits run in an **in-process queue** inside the Next.js server. That's fine on Railway (a long-lived process); a deploy mid-audit marks that audit failed after a few minutes so the user can retry. On a serverless host you'd need a real job queue.
- Answers come from the models' built-in knowledge (no web search), so they can differ from what a candidate sees in the ChatGPT / Claude / Gemini apps.
- `output: 'standalone'` is set but Railway runs `next start`, which logs a harmless warning about it.
