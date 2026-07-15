# CarrerFit.com

A full-stack career discovery application built with Next.js 15, React 19, TypeScript, and Express 5.

## Included flows

- Marketing landing page with working product navigation
- Searchable and filterable job board
- Detailed role pages with fit scores and skill requirements
- Five-step career assessment with generated career matches
- Saved-job pipeline with editable application statuses
- Dashboard with profile readiness, career matches, and weekly actions
- PDF and DOCX resume parsing (8 MB limit, memory-only processing)
- Groq-powered structured resume profiling and evidence-based job ranking
- Deterministic matching fallback when the AI provider is unavailable
- Real employer-hosted application links from Lever and Ashby
- Express REST API with rate limiting, secure headers, upload validation, and configurable persistence

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

Copy `.env.example` to `.env` and add the Groq key before starting the API. Without a key, resume parsing and deterministic ranking still work and the result identifies itself as skills-based.

## Production notes

- Deploy the Next.js and Express processes together or separately with `API_URL` pointing to the private API address.
- Put the service behind HTTPS and a reverse proxy with request-body limits.
- Mount `CARRERFIT_DATA_DIR` as a persistent volume for a single-instance deployment.
- The included JSON store is suitable for a single-instance pilot. Use Postgres and authenticated user ownership before storing multi-user dashboards.
- Uploaded resumes are parsed from memory and are not written by the application.
