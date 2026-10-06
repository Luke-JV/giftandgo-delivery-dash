# Contributing

1. Fork the repo or create a branch from `main`.
2. Make your change and check the game still runs (open `index.html`, or see the README).
3. If you change anything in `src/`, rebuild the preview with `scripts/build-preview.mjs` so `index.html` and `preview.html` stay in sync.
4. Open a pull request. `main` is protected, so changes need one approval.

Do not commit secrets, `.env` files or Supabase `service_role` keys. Only the
public anon key belongs in this repo.
