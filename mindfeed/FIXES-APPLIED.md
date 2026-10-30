# MindFeed local startup fixes

## What changed

- Pinned frontend packages to compatible, known versions instead of `latest`. This avoids silently moving to a new Vite/Rolldown native-binding combination when `npm install` is rerun.
- Configured the React/Vite development server to use port `5174` by default, with automatic fallback to another free port.
- Configured the Vite API proxy to target `http://127.0.0.1:8001` by default. This avoids accidentally sending MindFeed sign-in/demo requests to another app already using port `8000`, which can produce `Not Found` responses.
- Made the backend proxy target configurable through `MINDFEED_API_TARGET`.
- Updated the React development instructions in `README.md`.

No frontend application components, routes, database models, or user records were intentionally removed or redesigned.

## Windows PowerShell startup

Terminal 1 — backend:

```powershell
cd C:\Users\jefri\Downloads\MindFeed-upgraded\mindfeed
if (!(Test-Path .env) -and (Test-Path .env.example)) { Copy-Item .env.example .env }
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8001
```

Terminal 2 — frontend:

```powershell
cd C:\Users\jefri\Downloads\MindFeed-upgraded\mindfeed\frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5174/`. The API docs are at `http://127.0.0.1:8001/api/docs`.

If `.venv` is located one directory above `mindfeed`, activate it in Terminal 1 with:

```powershell
& ..\.venv\Scripts\Activate.ps1
```

## Verification status

- Backend Python syntax check: passed.
- Existing backend pytest suite: 10 passed.
- Frontend dependency installation/build: not verified in this packaging environment because `npm install` exceeded the available execution time. Run `npm install` and `npm run build` locally to verify the frontend on your machine.
