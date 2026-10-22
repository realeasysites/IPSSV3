# Imagepro Screenprint website

Node 20 / Express / SQLite. Quote form, lead dashboard at `/admin`, cookieless traffic stats.

## Run locally
```
npm install
ADMIN_PASSWORD=choose-something-long npm start
```
Open http://localhost:3000 and http://localhost:3000/admin

## Deploy on Render (same as MPS207)
1. Upload this folder to a GitHub repo (web upload is fine; node_modules and .env are ignored).
2. Render: New > Web Service > connect the repo. Build: `npm install`. Start: `npm start`.
3. Add a Disk (1 GB) mounted at `/var/data`, then set `DB_PATH=/var/data/imagepro.sqlite` so leads survive deploys.
4. Environment variables (see `.env.example`):
   - `ADMIN_PASSWORD` (8+ characters; the dashboard login stays disabled until set)
   - `SESSION_SECRET` (any long random string)
   - `SITE_URL` (the live domain, e.g. https://imageproscreenprint.com)
   - `NOTIFY_EMAIL` (where quote alerts go; default imageprospd@gmail.com)
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS` (Gmail app password)
5. Point the client's own domain at the service.

## Notes
- Without SMTP settings the form still saves leads to the dashboard; emails are skipped.
- `/admin` is password-only; every request can be status-tracked, noted and deleted.
- Traffic stats count visitors, calls, texts and quote clicks with no cookies.
