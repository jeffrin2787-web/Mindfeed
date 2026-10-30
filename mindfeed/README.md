# MindFeed

**Your Feed. Your Mind. Your Rules.**

MindFeed is an adaptive, explainable, user-controlled social platform demonstrator. It brings together account trust, pre-publication moderation, evidence-aware claim checks, personalized discovery, and digital well-being in one application.

## What's included

- **TrustID**: account trust overview and verification requests.
- **BotShield**: a transparent heuristic assessment of available account activity (not proof that an account is a bot).
- **SafePost AI**: pre-publication screening, pending-review status, moderator decisions, and appeals.
- **TruthCheck AI**: claim assessment, result history, and supporting evidence links.
- **Adaptive AI Feed**: topic-based ranking, feed modes, post creation, likes, comments, saved posts, follows, profile views, and recommendation feedback.
- **Phone verification**: short-lived OTPs, attempt limits, resend cooldowns, and configurable Twilio SMS delivery. Local development mode clearly states that no SMS is sent.
- **Media publishing**: authenticated image/video uploads with size and file-signature checks, local previews, and persistent post media references.
- **Demonstration feed**: an idempotent seed script adds 63 varied posts across learning, technology, science, careers, news literacy, sports, nature, sustainability, art, and photography.
- **Distraction Shield**: blocked topics and repetition controls.
- **TimeGuard**: persistent usage sessions, daily usage totals, session/daily limits, and break-reminder settings.
- **Study Mode**: learning topic preferences, a focus timer, and optional learning interactions.
- **Account and privacy settings**, reports, appeals, review queue, and user activity.
- Professional responsive UI with a branded 404 experience, light/dark theme, site search, mobile navigation, metadata, favicon, social image, `robots.txt`, `sitemap.xml`, and `llms.txt`.

The app includes seeded sample posts and accounts for demonstration. They are test content, not real users or endorsements. The separate `seed_demo_content.py` script adds 63 more varied items without deleting existing users or posts.

## Quick start — no Node/npm required

This is the simplest way to run the included standalone web client and the FastAPI backend together.

### Requirements

- Python 3.11 or newer (Python 3.12 recommended)
- Internet access only for installing Python dependencies; the app's local demo workflows do not require AI API credentials

### Windows PowerShell

```powershell
cd mindfeed
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. API documentation is at **http://127.0.0.1:8000/api/docs**.

If PowerShell blocks activation, you can install with `py -m pip install -r requirements.txt` and run `py -m uvicorn backend.app:app --host 127.0.0.1 --port 8000` without activating the environment.

### macOS / Linux

```bash
cd mindfeed
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Or after installing dependencies, use `./run.sh`.

### Demo sign-in

On the sign-in screen, select **Explore demo**. The development seed account is `demo@mindfeed.local`; the demo button obtains a short-lived application token from the backend without needing a password. Demo login is enabled by default in development and must be disabled for public production deployments.

To create a normal account, use the registration screen. Account credentials are stored as PBKDF2 password hashes; passwords are not stored in plaintext.

### Phone OTP behavior

Local development uses `SMS_MODE=development`; it does not send SMS. The generated code is displayed only in development when `DEV_EXPOSE_OTP=true`. For real delivery, configure Twilio values in `.env` and set `SMS_MODE=twilio`. Never expose development OTPs in production.

## React/Vite development workflow (Windows-friendly ports)

The full React source is in `frontend/src`. The React development server defaults to port **5174** and proxies API requests to the MindFeed backend on **8001**. These ports are intentionally separate from common existing local projects on 5173/8000.

Start the backend in the first PowerShell terminal:

```powershell
cd C:\path\to\MindFeed-upgraded\mindfeed
if (!(Test-Path .env) -and (Test-Path .env.example)) { Copy-Item .env.example .env }
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8001
```

Start the frontend in a second PowerShell terminal:

```powershell
cd C:\path\to\MindFeed-upgraded\mindfeed\frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5174/`). The frontend proxies `/api`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt` to port 8001. If port 5174 is already occupied, Vite will select another free port and print the actual URL. To use a different backend port, set `MINDFEED_API_TARGET`, for example `$env:MINDFEED_API_TARGET = 'http://127.0.0.1:8002'` before starting Vite, and start FastAPI on that same port.

To create the React production bundle:

```powershell
npm run build
```

The standalone client in `frontend/dist` is provided as a no-build fallback for environments where installing npm packages is unavailable. The Dockerfile builds the React client in a Node stage and serves that compiled bundle from FastAPI.

## Docker Compose — PostgreSQL-backed deployment

Requires Docker Engine and Docker Compose, plus network access to pull the PostgreSQL and Node/Python images and install npm/Python packages during the build.

1. Copy `.env.example` to `.env`.
2. Set a strong unique `SECRET_KEY` and a strong `POSTGRES_PASSWORD` in `.env`.
3. Set `PUBLIC_SITE_URL` and `CORS_ORIGINS` to the real intended site origins when deploying.
4. Ensure `ENABLE_DEMO_LOGIN=false` for a public environment.
5. Start it:

```bash
docker compose up --build -d
docker compose logs -f web
```

The site is served at `http://localhost:8000` on the host. PostgreSQL data is stored in the `mindfeed_pgdata` named volume. Do not publish this local setup publicly without configuring TLS/reverse proxy, strong secrets, database backup and recovery, rate limiting, monitoring, allowed origins, and production policies.

## Configuration

Copy `.env.example` to `.env`. The backend loads a project-local `.env` file if it exists; values already present in the process environment take precedence. A local run uses SQLite by default. The main values are:

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development`, `test`, or `production` |
| `SECRET_KEY` | Signs application bearer tokens; use a long random secret outside local development |
| `DATABASE_URL` | SQLite default or PostgreSQL connection URL |
| `ENABLE_DEMO_LOGIN` | Enables the seeded demo login; set `false` publicly |
| `PUBLIC_SITE_URL` | Canonical origin used by sitemap and public metadata |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins for API calls |
| `OPENAI_API_KEY` | Optional key to use OpenAI's moderation endpoint for text moderation |
| `OPENAI_MODERATION_MODEL` | Optional moderation model name, default `omni-moderation-latest` |
| `VITE_GA_MEASUREMENT_ID` | Reserved for optional analytics; analytics does not activate without an integration and appropriate consent configuration |

When `OPENAI_API_KEY` is not configured, SafePost uses a limited transparent local-rule demonstration. If a configured OpenAI moderation request fails, new content is held for review instead of silently approved. The API health response reports the active moderation mode.

## Database migrations

Alembic migrations are in `migrations/`. For an existing configured database:

```bash
alembic upgrade head
```

To generate a migration after changing SQLAlchemy models:

```bash
alembic revision --autogenerate -m "describe schema change"
alembic upgrade head
```

For a local demo, the application also calls SQLAlchemy `create_all` at startup to make a fresh SQLite database easy to run. For production, use the versioned migration command as part of deployment and do not rely on `create_all` to evolve an existing schema.

## Important implementation notes and honest limitations

This repository is a functional full-stack project demonstrator, not a production-scale social network.

- **Moderation**: without an OpenAI moderation key, this uses a small set of transparent local text heuristics. It is not a trained multimodal safety model. No image/video moderation model is configured by default.
- **TruthCheck**: the current local catalog supports a small set of example claims and reports its `curated_demo` source mode. It does not perform live web search or establish source independence for arbitrary claims. Unknown claims should return an insufficient-evidence result. Live evidence retrieval needs a selected and implemented provider plus its credentials.
- **TrustID/BotShield**: account trust and bot-risk results are demonstrator heuristics based on data available to the app. They are not official identity verification and do not prove an account is automated.
- **External feeds**: the sample feed uses internal posts. External social network APIs are not automatically available; access must be implemented under each provider's terms and licensing rules.
- **TimeGuard**: tracks active usage within the supported MindFeed app session. A web app cannot prevent a user from switching to other websites or devices.
- **Guardian controls**: parent/guardian linking uses an explicit child-account acceptance workflow. Authorized guardians can manage supported child settings after acceptance. This demonstrator does not independently verify legal guardianship; a public child-focused service needs stronger guardian verification, an age policy, a privacy model, abuse prevention, and applicable legal review.
- **Deployment and SEO submission**: the files/metadata are prepared, but a custom domain, HTTPS certificate, domain email, real analytics property, Search Console verification, public indexing, external services, and production backups require ownership/access and configuration. They are not claimed to be live by default.
- **Sample content**: seeded sample accounts/posts are synthetic demonstration content, not real endorsements.

## API overview

- `GET /api/health` — database health and active AI mode
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/demo`
- `GET /api/auth/me`, `PATCH /api/auth/profile`
- `GET /api/feed`, `POST /api/posts`, `POST /api/posts/{id}/like`, `POST /api/posts/{id}/feedback`
- `GET/PUT /api/preferences`, `GET /api/dashboard/stats`, `GET /api/profile/summary`
- `POST /api/moderation/check`, `GET /api/moderation/queue`, reviewer decision endpoints
- `POST /api/truthcheck`, `GET /api/truthcheck/history`
- Trust/verification, reports, appeals, search, and TimeGuard session APIs
- `GET /api/family/links`, guardian link request/respond/revoke endpoints, and linked-child settings endpoints
- `GET /robots.txt`, `GET /sitemap.xml`, `GET /llms.txt`

The full interactive API reference is available at `/api/docs` while the backend is running.

## Tests

Install development test dependencies, then run:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m py_compile backend/app.py
node --check frontend/dist/app.js
```

The included API tests cover signup, authentication, preferences, feed, post publishing/likes/feedback, fact-check history, reports, moderation review, usage tracking, protected reviewer access, parent-child link acceptance and setting enforcement, configured moderation-provider failure handling, and static SEO resources.

## Project structure

```text
mindfeed/
├── backend/app.py          # FastAPI routes, models, auth and service logic
├── frontend/src/           # React/Vite source
├── frontend/dist/          # Standalone runnable client / static assets
├── migrations/              # Alembic migration history
├── tests/                   # API integration tests
├── Dockerfile
├── compose.yaml             # FastAPI + PostgreSQL development stack
├── requirements.txt
└── .env.example
```

## Before public launch

Disable demo login, change the secret key and PostgreSQL password, configure TLS and trusted host/origin settings, select and configure real AI/evidence providers, review age-related safety and legal requirements, configure backups and monitoring, run dependency/security scans, and perform manual browser testing on the actual deployment.

## Social publishing, phone verification, and demo feed upgrade

The existing MindFeed architecture is retained. New interactions are added as isolated SQLAlchemy tables and API routes:

- `POST /api/media/upload` accepts JPEG, PNG, WEBP, GIF, MP4, WEBM, and MOV uploads (default maximum 20 MB). Files are stored under `uploads/` and served from `/uploads/`. Configure `MAX_UPLOAD_MB` to change the limit. For public deployments, use private object storage/CDN and malware scanning rather than the local disk.
- `GET/POST /api/posts/{post_id}/comments` reads and adds persistent comments.
- `POST /api/posts/{post_id}/save` toggles a saved post; `GET /api/posts/saved` lists the current user's saved posts.
- `POST /api/users/{target_user_id}/follow` toggles a follow; `GET /api/users/{target_user_id}/profile` returns a public profile summary.
- Registration accepts an optional E.164 phone number (for example `+14155552671`). When supplied, login is blocked until the number is verified.

### SMS OTP configuration

Local development defaults to `SMS_MODE=development`. This mode **does not send SMS**; with `APP_ENV=development` and `DEV_EXPOSE_OTP=true`, the API explicitly returns a development-only code so the flow can be tested locally. Do not enable code exposure in production.

For real delivery, set these in `.env` using values from your SMS provider:

```dotenv
APP_ENV=production
SMS_MODE=twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15551234567
DEV_EXPOSE_OTP=false
SECRET_KEY=use-a-long-random-secret-of-at-least-32-characters
```

The sender must be authorized for the recipient region. Delivery depends on provider account configuration, regional regulations, and verified sender settings. Provider credentials are never placed in frontend code. OTPs expire after five minutes, resend requests have a cooldown, and verification is limited to five attempts per issued code.

### Database migration and backup

Back up the database before upgrading. For SQLite, stop the app and copy `mindfeed.db` to a safe location. Then run:

```powershell
python -m alembic upgrade head
```

The new migration adds only phone-verification, comments, saved-posts, and follows tables; it does not delete or rewrite existing user/post rows. `Base.metadata.create_all()` remains in the existing startup path for fresh installs.

To restore SQLite, stop the app and replace `mindfeed.db` with the backup copy. For PostgreSQL, use `pg_dump` and `pg_restore` with your configured database URL/credentials.

### Seed 60–70 demonstration posts

Start the backend once so the existing sample accounts are initialized, then run:

```powershell
python seed_demo_content.py
```

The script adds varied topics and image/text content, is safe to rerun, and never deletes existing posts or users. Existing starter samples are preserved. Some sample images reference public Unsplash URLs and therefore require internet access; their availability should be checked on the target demonstration network. The seed script does not claim to have live-validated third-party image hosting.

### Verification workflow

1. Open `/register`, enter name, email, password, and phone in international format.
2. In development mode, use the clearly labelled development OTP shown on-screen; no SMS is sent in this mode.
3. For real phone delivery, configure Twilio first and confirm that the provider accepts the message.
4. After verification, sign in and publish a text, photo, or video post. Uploaded media is stored locally in `uploads/`.
5. Try likes, comments, saved posts, search, feed modes, moderation, and existing MindFeed safety/well-being pages.

For public deployment, also configure HTTPS, a secure production secret, a production database, storage lifecycle/backup policies, rate limiting at the reverse proxy, and a reviewed privacy/retention policy. Local-disk upload storage is intended for local demos, not multi-instance production hosting.

### Frontend source build note

The React source changes are in `frontend/src/App.jsx` and `frontend/src/styles.css`. To use all new UI interactions, rebuild the Vite app before launching the Python-only server:

```powershell
cd frontend
npm install
npm run build
cd ..
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

For live frontend development, run `npm run dev` in `frontend/` and run FastAPI in a second terminal. The development server proxies `/api` to the backend. In the preparation environment used for this upgrade, npm registry DNS was unavailable (`EAI_AGAIN`), so I could syntax-parse the JSX but could not regenerate or execute a fresh Vite production bundle here. The existing `dist/app.js` therefore remains the original prebuilt bundle until you run the build commands above; `dist/styles.css` includes the new violet theme. This limitation is documented rather than claiming an unrun build passed.
