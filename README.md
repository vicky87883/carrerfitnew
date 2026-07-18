# CarrerFit.com

A full-stack career discovery application built with Next.js 15, React 19, TypeScript, and Express 5.

## Included flows

- Marketing landing page with working product navigation
- Searchable and filterable job board
- Detailed role pages with fit scores and skill requirements
- Five-step career assessment with generated career matches
- Saved-job pipeline with editable application statuses
- Dashboard with profile readiness, career matches, and weekly actions
- Verified-email accounts with Argon2id passwords, one-time recovery links, and server-side sessions
- Per-user resume profiles, assessment matches, and saved-job pipelines
- PDF and DOCX resume parsing (8 MB limit, memory-only processing)
- Groq-powered structured resume profiling and evidence-based job ranking
- Resume-aware AI mock interviews with adaptive Groq follow-up questions
- Spoken interviewer prompts, browser speech-to-text answers, and typed fallback
- Optional on-device camera coaching for framing, lighting, and movement stability
- Per-answer coaching plus a final interview scorecard and practice plan
- Deterministic matching fallback when the AI provider is unavailable
- Real employer-hosted application links from Lever and Ashby
- Express REST API with rate limiting, secure headers, upload validation, and configurable persistence
- Persistent SQLite job database with duplicate-safe imports and source health tracking
- Secure job ingestion for public Lever, Greenhouse, Ashby, and JobPosting structured-data pages
- Protected source-management dashboard with manual refresh and cron-compatible synchronization
- Database-backed career guides with drafts, publishing controls, structured data, sitemap, and RSS
- Private blog publishing workspace at `/blog-admin`

## Run locally

Requires Node.js 20–22.

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:3000` and the Express API at `http://localhost:4000`.

## Production build

```bash
npm run build
npm start
```

Environment variables:

- `GROQ_API_KEY`: server-side Groq API key; never expose this with a `NEXT_PUBLIC_` prefix
- `GROQ_MODEL`: defaults to `openai/gpt-oss-120b`
- `PORT`: Next.js port, defaults to `3000`
- `API_PORT`: Express port, defaults to `4000`
- `API_URL`: internal Express URL used by Next.js rewrites
- `WEB_URL`: comma-separated allowed CORS origins
- `CARRERFIT_DATA_DIR`: writable directory for local application state
- `CARRERFIT_DB_PATH`: writable SQLite database path for imported jobs
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: enable MySQL/MariaDB persistence when all are configured
- `DB_PORT`: MySQL port, defaults to `3306`
- `DB_SSL`: set to `true` only when the database provider requires TLS
- `DB_POOL_SIZE`: MySQL connection pool size, defaults to `5`
- `SCRAPER_ADMIN_TOKEN`: secret used to access `/job-sources` management APIs (minimum 16 characters)
- `CRON_SECRET`: separate secret for scheduled `POST /api/cron/job-sources` refreshes
- `BLOG_ADMIN_TOKEN`: separate secret of at least 24 characters used to unlock `/blog-admin`
- `APP_URL`: public origin used for secure confirmation/reset links, for example `https://carrerfit.com`
- `AUTH_SECRET`: random secret of at least 32 characters used to protect request fingerprints
- `AUTH_REQUIRED`: set to `true` only after the SMTP settings below are working
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`: SMTP connection (`smtp.hostinger.com`, `465`, `true` for Hostinger)
- `SMTP_USER`, `SMTP_PASSWORD`: credentials for a real mailbox such as `no-reply@carrerfit.com`
- `SMTP_FROM`: visible sender, for example `CarrerFit.com <no-reply@carrerfit.com>`

Copy `.env.example` to `.env` and add the Groq key before starting the API. Without a key, resume parsing and deterministic ranking still work and the result identifies itself as skills-based.

## Public routes

- `/`, `/resume`, `/interview`, `/jobs`, `/assessment`, `/dashboard`
- `/register`, `/login`, `/forgot-password`, `/reset-password`
- `/blog` and `/blog/[slug]`
- `/sitemap.xml`, `/robots.txt`, `/rss.xml`, `/manifest.webmanifest`
- `/api/health`

The publishing workspace is available at `/blog-admin` and requires `BLOG_ADMIN_TOKEN`. Draft articles are never included in public blog responses, search metadata, the sitemap, or RSS.

## Safe authentication rollout

1. Deploy with `AUTH_REQUIRED=false` and all other authentication/SMTP variables configured.
2. Open `/api/health` and confirm `authentication.configured` and `authentication.emailConfigured` are `true`.
3. Register a test account, open the confirmation email, sign in, upload a resume, and confirm its private dashboard data.
4. Change only `AUTH_REQUIRED=true` and redeploy. Dashboard, assessment, resume analysis, and interview APIs will then require a verified account.

## Production notes

- `npm start` serves the Next application and its API from one process. Do not set `API_URL` in this production mode.
- Put the service behind HTTPS and a reverse proxy with request-body limits.
- SQLite and the local JSON store remain the development fallback. Production uses MySQL/MariaDB for jobs and account-isolated private data.
- MySQL schema bootstrap is non-destructive and uses `CREATE TABLE IF NOT EXISTS`. Run `npm run migrate:mysql` once to copy existing SQLite jobs and local state after configuring MySQL.
- Uploaded resumes are parsed from memory and are not written by the application. With accounts enabled, only the structured profile and ranked results are retained per user.
- Session tokens are random, stored only as SHA-256 hashes, and delivered in `HttpOnly`, `SameSite=Lax`, production `Secure` cookies. Passwords use Argon2id.
- Email verification and password-reset tokens are random, hashed in storage, expire, and can be used only once.
- Interview camera frames stay in the browser. The API receives only optional numeric practice signals and never receives images or video.
- Camera signals are coaching aids only and must not be used for hiring decisions or sensitive-trait inference.
- Job ingestion accepts HTTPS sources only, blocks private-network targets and unsafe redirects, limits response size, and observes robots.txt for generic pages.
- Use public job-board URLs and comply with each source site's terms. CarrerFit stores normalized listing facts and always links applications to the original employer page.
