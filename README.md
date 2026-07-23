# CarrerFit.com

A full-stack career discovery application built with Next.js 15, React 19, TypeScript, and Express 5.

## Included flows

- Marketing landing page with working product navigation
- Searchable and filterable job board
- Detailed role pages with fit scores and skill requirements
- Five-step career assessment with generated career matches
- Saved-job pipeline with editable application statuses
- Data-rich dashboard with resume extraction health, evidenced skills, experience timeline, ranked jobs, and application pipeline
- Verified-email accounts with Argon2id passwords, one-time recovery links, and server-side sessions
- Per-user resume profiles, assessment matches, and saved-job pipelines
- PDF and DOCX resume parsing (8 MB limit) with encrypted original and extracted-text retention for signed-in users
- Evidence-based ATS compatibility report covering contact data, standard sections, achievement quality, keyword evidence, extraction readability, and prioritized fixes
- Groq-powered, schema-validated resume JSON covering identity, skills with evidence, experience, education, projects, certifications, languages, and keywords
- Resume-aware AI mock interviews with adaptive Groq follow-up questions
- Spoken interviewer prompts, browser speech-to-text answers, and typed fallback
- Optional on-device camera coaching for framing, lighting, and movement stability
- Per-answer coaching plus a final interview scorecard and practice plan
- Deterministic matching fallback when the AI provider is unavailable
- Real employer-hosted application links from Lever and Ashby
- Express REST API with rate limiting, secure headers, upload validation, and configurable persistence
- Persistent SQLite job database with duplicate-safe imports and source health tracking
- Secure job ingestion for public Lever, Greenhouse, Ashby, and JobPosting structured-data pages
- Protected source-management dashboard with manual refresh and hourly GitHub Actions synchronization
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
- `ADMIN_EMAIL` (or the first address in `ADMIN_EMAILS`), `ADMIN_USERNAME`, `ADMIN_PASSWORD`: separate administrator email, username, and password (password minimum 12 characters)
- `AUTH_REQUIRED`: set to `true` only after the SMTP settings below are working
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`: SMTP connection (`smtp.hostinger.com`, `465`, `true` for Hostinger)
- `SMTP_USER`, `SMTP_PASSWORD`: credentials for a real mailbox such as `no-reply@carrerfit.com`
- `SMTP_FROM`: visible sender, for example `CarrerFit.com <no-reply@carrerfit.com>`

Copy `.env.example` to `.env` and add the Groq key before starting the API. Without a key, resume parsing and deterministic ranking still work and the result identifies itself as skills-based.

## Complete route reference

Production sets `AUTH_REQUIRED=true`. In the tables below, **verified session** means a confirmed user account with the signed `HttpOnly` session cookie. **Admin session** means the separate `/admin` confirmation flow and its signed `HttpOnly` administrator cookie. Mutating browser requests also require a valid same-origin request.

### Website pages

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Marketing homepage | Public |
| `/jobs` | Search and filter active jobs | Public |
| `/jobs/[id]` | Job details and original employer application link | Public |
| `/blog` | Published career guides | Public |
| `/blog/[slug]` | Published guide detail | Public |
| `/register` | Account registration | Public; rate limited |
| `/login` | User sign-in | Public; rate limited |
| `/forgot-password` | Request a password-reset email | Public; rate limited |
| `/reset-password?token=...` | Complete a one-time password reset | Public with valid one-time token |
| `/dashboard` | Private resume intelligence, matches, and application pipeline | Verified session |
| `/resume` | PDF/DOCX upload and AI resume matching | Verified session |
| `/assessment` | Career assessment | Verified session |
| `/interview` | Resume-aware AI interview practice | Verified session |
| `/admin` | Private application-management console | Admin credentials, email confirmation, then admin session |
| `/job-sources` | Legacy job-source workspace; redirects to `/admin` in production | Admin console |
| `/blog-admin` | Legacy publishing workspace; redirects to `/admin` in production | Admin console |
| `/privacy` | Resume, account, AI, camera, retention, and safety disclosures | Public |

### Discovery and browser assets

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/sitemap.xml` | Public pages and published blog sitemap | Public |
| `GET` | `/robots.txt` | Search-crawler rules | Public |
| `GET` | `/rss.xml` | Latest published career guides | Public |
| `GET` | `/manifest.webmanifest` | Progressive web-app metadata | Public |
| `GET` | `/favicon.ico` | CarrerFit favicon | Public |
| `GET` | `/opengraph-image` | Social-sharing image | Public |

### Health and authentication API

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Reports AI, authentication, mail, and database readiness without returning secrets | Public |
| `GET` | `/api/auth/config` | Returns public authentication configuration flags | Public |
| `GET` | `/api/auth/me` | Returns the current verified user and authentication state | Session cookie optional |
| `GET` | `/api/auth/verify?token=...` | Consumes an email-verification token, creates a session, and redirects to the dashboard | Valid one-time token |
| `POST` | `/api/auth/register` | Creates an account and sends verification mail | Public; rate limited |
| `POST` | `/api/auth/login` | Validates credentials and creates a signed session cookie | Public; rate limited |
| `POST` | `/api/auth/logout` | Revokes the current session and clears its cookie | Session cookie |
| `POST` | `/api/auth/forgot-password` | Sends a one-time reset link when an eligible account exists | Public; rate limited |
| `POST` | `/api/auth/reset-password` | Consumes a reset token, updates the Argon2id password, and revokes existing sessions | Valid one-time token; rate limited |
| `POST` | `/api/auth/resend-verification` | Sends a replacement verification link for an unverified account | Public; rate limited |

### Jobs, resume, assessment, and dashboard API

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/jobs?q=&category=&mode=` | Lists curated and imported active jobs with optional filters | Public |
| `GET` | `/api/jobs/[id]` | Returns one curated or imported job | Public |
| `POST` | `/api/resume/analyze` | Parses a PDF/DOCX, runs validated Groq extraction, calculates an ATS compatibility report, stores encrypted resume intelligence, and returns ranked jobs | Verified session; multipart form; rate limited |
| `POST` | `/api/assessment` | Generates and stores career matches from assessment answers | Verified session |
| `GET` | `/api/dashboard` | Returns the current user's private profile, resume document, matches, applications, and statistics | Verified session |
| `POST` | `/api/applications` | Saves a job to the user's pipeline | Verified session |
| `PATCH` | `/api/applications/[id]` | Changes status to `Saved`, `Applied`, `Interview`, or `Offer` | Verified session; owner only |
| `DELETE` | `/api/applications/[id]` | Removes a job from the user's pipeline | Verified session; owner only |
| `POST` | `/api/interview/start` | Creates a tailored interview plan from an uploaded resume or saved profile | Verified session; multipart form; rate limited |
| `POST` | `/api/interview/respond` | Evaluates an answer and returns the next question or final report | Verified session; rate limited |

### Administrator API

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/admin/status` | Reports whether administrator access is configured and whether this browser is authenticated | Public; returns no credentials |
| `POST` | `/api/admin/request-access` | Validates the database-backed administrator username/password and opens an HTTP-only session | Admin credentials; rate limited and lockout protected |
| `GET` | `/api/admin/overview` | Returns user, active-job, source, and published-post totals | Admin session |
| `GET` | `/api/admin/bot` | Returns schedule, source health, job totals, failures, and recent bot-run history | Admin session |
| `GET` | `/api/admin/users` | Lists registered users, verification/login state, activity, applications, and resume summaries | Admin session |
| `GET` | `/api/admin/resume/[userId]` | Decrypts and previews a user's stored resume file | Admin session; private/no-store response |
| `POST` | `/api/admin/manual-job` | Creates and publishes a normalized manual job record | Admin session |
| `POST` | `/api/admin/cleanup-jobs` | Deletes imported jobs not seen for more than 30 days | Admin session |
| `POST` | `/api/admin/run-bot` | Runs the bounded ingestion worker immediately and records its result | Admin session |
| `POST` | `/api/admin/logout` | Clears the separate administrator session cookie | Admin session |

### Job-source ingestion API

These routes accept either the confirmed admin cookie or `x-admin-token: <SCRAPER_ADMIN_TOKEN>`. They accept only validated public HTTPS targets and apply SSRF, redirect, response-size, and robots.txt controls.

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/job-sources` | Returns source health, import statistics, and recent jobs | Admin session or scraper token |
| `POST` | `/api/job-sources` | Creates or reuses a source, scrapes it immediately, and stores normalized jobs | Admin session or scraper token; rate limited |
| `POST` | `/api/job-sources/scrape-all` | Refreshes every enabled source | Admin session or scraper token; rate limited |
| `POST` | `/api/job-sources/[id]/scrape` | Refreshes one source | Admin session or scraper token; rate limited |
| `PATCH` | `/api/job-sources/[id]` | Enables or disables one source | Admin session or scraper token |
| `DELETE` | `/api/job-sources/[id]` | Deletes one source and its imported jobs | Admin session or scraper token |
| `POST` | `/api/cron/job-sources` | Scheduled refresh endpoint | `x-cron-secret: <CRON_SECRET>` |

### Always-on job ingestion

The repository includes `.github/workflows/job-bot.yml`. GitHub Actions invokes the protected cron endpoint hourly, and the server refreshes enabled public sources with a maximum of three concurrent scrapes. Source adapters respect HTTPS/SSRF controls, robots directives, response limits, and supported public job-board formats; the bot does not bypass logins, CAPTCHAs, or publisher access controls.

To activate it:

1. Set a strong `CRON_SECRET` in the Hostinger production environment and redeploy.
2. In GitHub, open **Settings → Secrets and variables → Actions** and create a repository secret named `CRON_SECRET` with the exact same value.
3. Open **Actions → CarrerFit job ingestion bot → Run workflow** once to verify it. Scheduled workflows are best-effort and can start a few minutes late.
4. Add and enable sources in `/admin`. Only enabled sources are synchronized and normalized into the jobs database.

The response reports source count, successful refreshes, failures, and start/finish timestamps. Never commit the secret or expose it in client code.

### Blog API

Public reads return only published posts. Administrator reads and writes accept either the confirmed admin cookie or `x-admin-token: <BLOG_ADMIN_TOKEN>`. Draft posts never appear in public API results, RSS, sitemap, or page metadata.

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/blog?category=...` | Lists published posts, optionally filtered by category | Public |
| `GET` | `/api/blog/[slug]` | Returns one published post | Public |
| `GET` | `/api/blog?admin=1` | Lists drafts and published posts | Admin session or blog token |
| `GET` | `/api/blog/[slug]?admin=1` | Returns a draft or published post for editing | Admin session or blog token |
| `POST` | `/api/blog` | Creates a draft or published post | Admin session or blog token; rate limited |
| `PATCH` | `/api/blog/[slug]` | Updates a post and revalidates affected public pages | Admin session or blog token; rate limited |
| `DELETE` | `/api/blog/[slug]` | Deletes a post and revalidates affected public pages | Admin session or blog token |

### Hostinger production variables

Set these only in Hostinger Environment variables. Do not place them in browser code, GitHub, or screenshots.

| Variable group | Required for |
| --- | --- |
| `GROQ_API_KEY`, `GROQ_MODEL` | AI resume and interview features |
| `WEB_URL`, `APP_URL`, `AUTH_SECRET`, `AUTH_REQUIRED` | Secure cookies, origin validation, and account access |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DB_POOL_SIZE` | MySQL data storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Registration confirmations and password reset emails |
| `SCRAPER_ADMIN_TOKEN`, `CRON_SECRET` | Job-source administration and scheduled refreshes |
| `BLOG_ADMIN_TOKEN` | Blog administration |

`/admin` is separate from user accounts. Enter the configured administrator username and password to open an eight-hour HTTP-only session. On the first successful login, the environment credentials bootstrap an `administrator_accounts` database record containing only a salted scrypt password hash; plaintext passwords are never stored or returned. Five failed attempts lock the account for 15 minutes. All user, resume, job-bot, and blog management APIs validate the signed administrator cookie.

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
- With accounts enabled, uploaded PDF/DOCX files are AES-256-GCM encrypted in `user_resume_files`. The complete extracted text, normalized resume JSON, and ATS report are independently encrypted in `user_resume_documents`; only authenticated private routes decrypt the structured view. Groq fields are schema-validated and carry evidence/confidence, but automated extraction must still be reviewed for important decisions. The ATS score is a compatibility estimate, not a guarantee that every employer system will parse or rank a resume identically.
- Session tokens are random, stored only as SHA-256 hashes, and delivered in `HttpOnly`, `SameSite=Lax`, production `Secure` cookies. Passwords use Argon2id.
- Email verification and password-reset tokens are random, hashed in storage, expire, and can be used only once.
- Interview camera frames stay in the browser. The API receives only optional numeric practice signals and never receives images or video.
- Camera signals are coaching aids only and must not be used for hiring decisions or sensitive-trait inference.
- Job ingestion accepts HTTPS sources only, blocks private-network targets and unsafe redirects, limits response size, and observes robots.txt for generic pages.
- Use public job-board URLs and comply with each source site's terms. CarrerFit stores normalized listing facts and always links applications to the original employer page.
