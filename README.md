# Cupboard List

Minimal home cupboard tracker with shared cloud sync on Vercel.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Cloud Sync Setup (Vercel Only)

1. In Vercel, open your project and add a Redis/KV storage integration.
2. Ensure these server-side environment variables are present (Project -> Settings -> Environment Variables):

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
CUPBOARD_STATE_KEY=cupboard:main
```

3. Redeploy production.

Without KV env vars, the app stays local-only.

Notes:
- No sign-in is required.
- Everyone using the same site URL shares the same cupboard state.
- Writes are last-write-wins, and each client polls for updates every few seconds.
