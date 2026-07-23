# Seedance API Wrapper

A small full-stack wrapper around ByteDance/BytePlus's **Seedance** video generation API
([ModelArk docs](https://docs.byteplus.com/en/docs/ModelArk/2291680)):

- `backend/` — Python (FastAPI) service that holds your API key server-side and proxies
  requests to the Seedance REST API (create task + poll task status).
- `frontend/` — React (Vite) UI: enter a prompt (optionally with a reference image),
  pick video settings, submit, and watch the result once it's ready.

The API key is never sent to or stored in the browser — the React app only ever talks to
your local FastAPI server, which attaches the key to outbound requests to BytePlus.

## Where to put your API key

1. Get a key from the BytePlus console: https://console.byteplus.com/ark/region:ark+eu-west-1/apiKey
2. In `backend/`, copy the example env file:
   ```bash
   cd backend
   cp .env.example .env
   ```
3. Open `backend/.env` and paste your key into `ARK_API_KEY`:
   ```env
   ARK_API_KEY=your_byteplus_ark_api_key_here
   ```

That's the only place the key lives. `backend/.env` is already listed in `.gitignore` so it
won't get committed.

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Already set up? Just run:

```bash
cd backend
source .venv/bin/activate        # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000` (interactive docs at `/docs`).

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api/*` requests to the backend on
port 8000 (see `frontend/vite.config.js`), so no extra config is needed.

## How it works

1. The React form posts your prompt + settings to `POST /api/generate` on the FastAPI
   backend.
2. The backend calls BytePlus's `POST /contents/generations/tasks` with your `ARK_API_KEY`
   and returns a `task_id`.
3. The frontend polls `GET /api/tasks/{task_id}` (backed by BytePlus's
   `GET /contents/generations/tasks/{task_id}`) with increasing backoff until the task
   reaches a terminal state (`succeeded`, `failed`, `expired`, or `cancelled`).
4. On success, the video is streamed from the `video_url` BytePlus returns. **That URL
   expires 24 hours after generation** — download it if you want to keep it.

## Configuration

Extra options can be set in `backend/.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `ARK_API_KEY` | *(required)* | Your BytePlus ModelArk API key |
| `ARK_BASE_URL` | `https://ark.ap-southeast.bytepluses.com/api/v3` | Region endpoint. Change if BytePlus assigns you a different region. |
| `SEEDANCE_MODEL` | `dreamina-seedance-2-0-260128` | Model ID used unless the frontend request overrides it |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin for the frontend dev server |

## Notes / limitations

- Only text-to-video and single-image-to-video (first frame) are wired up in the UI. The
  backend (`backend/app/schemas.py`) already supports multiple reference images/roles
  (`first_frame`, `last_frame`, `reference_image`, `reference_video`, `reference_audio`)
  if you want to extend the form.
- Generation is billed per BytePlus's pricing — there's no free tier.
- Video URLs expire 24 hours after generation, so the wrapper doesn't persist videos
  anywhere; add storage (e.g. S3) if you need history.
