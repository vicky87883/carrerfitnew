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
- `CARRERFIT_DATA_DIR`: a writable persistent directory, such as `./data`

Do not set `API_PORT` or `API_URL` in Hostinger. The production entry point serves the API and Next.js on the single `PORT` provided by Hostinger.

If you upload a zip file, open it and confirm `package.json`, `app/`, `next.config.mjs`, and `tsconfig.json` are at the top level of the zip.
