# Hostinger deployment

Use the JavaScript application / Node.js deployment flow, not static website upload.

Recommended settings:

- Framework: Next.js
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start` (serves Next.js and Express from one Hostinger-assigned port)
- Node version: 20
- App root: the folder that contains this `package.json`

Upload only the source files. Do not upload `node_modules`, `.next`, or any parent folder that hides `package.json` one level deeper.

Required environment variables:

- `GROQ_API_KEY`: private Groq credential
- `WEB_URL`: `https://carrerfit.com,https://www.carrerfit.com`
- `DB_HOST`: Hostinger MySQL hostname
- `DB_PORT`: `3306`
- `DB_NAME`: Hostinger database name
- `DB_USER`: Hostinger database username
- `DB_PASSWORD`: Hostinger database password
- `DB_SSL`: `false` unless Hostinger explicitly provides a TLS connection requirement
- `DB_POOL_SIZE`: `5`
- `SCRAPER_ADMIN_TOKEN`: a random secret of at least 16 characters for source management
- `CRON_SECRET`: a different random secret for scheduled source refreshes

When all required `DB_*` values are present, CarrerFit uses MySQL/MariaDB for imported jobs, sources, applications, and assessment state. Tables are created automatically without dropping existing tables. SQLite remains the local fallback only.

To copy an existing SQLite database after configuring MySQL, run `npm run migrate:mysql` once. The migration uses an upsert transaction and does not delete the SQLite source file.

Do not set `API_PORT` or `API_URL` in Hostinger. The production entry point serves the API and Next.js on the single `PORT` provided by Hostinger.

If you upload a zip file, open it and confirm `package.json`, `app/`, `next.config.mjs`, and `tsconfig.json` are at the top level of the zip.
