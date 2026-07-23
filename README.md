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

1. In Vercel, open your project and add/link a Blob store.
2. Ensure these server-side environment variables are present (Project -> Settings -> Environment Variables):

```bash
BLOB_READ_WRITE_TOKEN=...
CUPBOARD_LEGACY_STATE_PATHNAME=cupboard-state.json
CUPBOARD_EVENT_PREFIX=cupboard-events/
CUPBOARD_ALLOWED_ORIGINS=https://i-think-we-struck-goals-here.github.io,https://cupboard-list-site.vercel.app
```

3. Redeploy production.

Without Blob env vars, the app stays local-only.

Notes:
- No sign-in is required.
- Everyone using the same site URL shares the same cupboard state.
- Each edit is saved as an immutable item-level operation, so updates from different devices cannot overwrite one another.
- Visible devices check for updates every 2.5 seconds and flush pending changes when the page is hidden.
- If opened from `*.github.io`, the app auto-uses the Vercel API endpoint for cloud sync.
