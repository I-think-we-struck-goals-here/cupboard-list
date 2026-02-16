# Cupboard List

Minimal home cupboard tracker with shared cloud sync via Supabase.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Cloud Sync Setup (Supabase)

1. Create a Supabase project.
2. Run `supabase/cupboard_states.sql` in the SQL editor.
3. Copy `.env.example` to `.env` and fill:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_CLOUD_ROW_ID=main
```

4. Restart dev/build.

Without env vars, the app stays local-only (current behavior).

Notes:
- No sign-in is required.
- Everyone using the same site URL shares the same cupboard state.
- Writes are last-write-wins, and each client polls for updates every few seconds.
