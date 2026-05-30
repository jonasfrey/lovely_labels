# Screencast-Skript — LB2 Deployment

## 1. Intro (~30 s)
- Projekt kurz zeigen: Lovely Labels, Browser-App für 3D-Namensschilder
- Stack nennen: Deno-Server + Vue/Vite-Client + ImageMagick
- Ziel: Produktionsreifes Deployment auf Render.com via Docker + GitHub Actions

## 2. Repo-Tour (~1 min)
- `server.ts` — Deno-Server, `/api/health` zeigen
- `client/` — Vue 3 + Vite
- `Dockerfile` — Multi-Stage erklären (Node-Build → Deno-Runtime + ImageMagick)
- `.dockerignore` — `tiffs/` (973 MB) ausgeschlossen
- `render.yaml` — Blueprint (Plan, Region, Healthcheck, Autodeploy)
- `.github/workflows/ci.yml` — Build + Deploy-Hook-Trigger

## 3. Render-Setup zeigen (~1 min)
- Render-Dashboard → New + → Blueprint
- Repo auswählen → render.yaml wird gelesen
- Service `lovely-labels` wird angelegt
- Deploy Hook URL kopieren → GitHub Secret `RENDER_DEPLOY_HOOK` setzen

## 4. Live-Deploy demonstrieren (~2 min)
- Kleine Code-Änderung machen (z. B. README oder Header-Text)
- `git commit` + `git push origin main`
- GitHub Actions: Workflow läuft → typecheck → vite build → docker build → deploy trigger
- Render-Dashboard: Build-Log live mitlaufen lassen

## 5. Live-App zeigen (~1 min)
- Render-URL öffnen → App lädt
- `/api/health` im Browser → `ok`
- Text eingeben, Font wechseln (server-rendered via `/api/text`)
- Tile-Frame anwenden (server-rendered via `/api/tile/...`)
- STL exportieren

## 6. Abschluss (~30 s)
- 12-Factor-Punkte kurz benennen: Config via Env (`PORT`, `MAGICK_BIN`), Stateless, Build/Release/Run getrennt
- CI/CD-Pipeline = automatisierter Build → Test → Deploy bei jedem Push auf `main`
- Rollback-Option in Render erwähnen (vorheriger Deploy mit einem Klick)
