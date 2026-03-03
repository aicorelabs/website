# Zeffron Website: Firebase Config Hygiene

This repo contains:
- static website pages at the project root
- a Next.js app at `zeffron_client_management/`

## 1) Static site Firebase setup (local only)

Tracked files:
- `assets/js/firebase-config.js` (safe loader)
- `assets/js/firebase-config.local.example.js` (template)

Local-only file (ignored by git):
- `assets/js/firebase-config.local.js`

Steps:
1. Copy `assets/js/firebase-config.local.example.js` to `assets/js/firebase-config.local.js`.
2. Fill real Firebase values in `assets/js/firebase-config.local.js`.
3. Do not commit `assets/js/firebase-config.local.js`.

## 2) Next.js Firebase setup (local only)

Use:
- `zeffron_client_management/.env.local.example` as template.
- `zeffron_client_management/.env.local` for real local values.

`zeffron_client_management/.env.local` is ignored and should never be committed.

## 3) Leak-check command

Run this before PR:

```powershell
git log --all --full-history -- "**/.env*" "assets/js/firebase-config.js" --name-status --pretty=format:"%h | %ad | %an | %s" --date=short
```

If command prints nothing, those files were never committed in history.