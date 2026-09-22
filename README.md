# Coupon Checker Backend

A small Express server that stands between your static frontend and IRD's
public winners API. It solves the CORS problem (IRD's API has no CORS
headers for browser requests) by fetching server-to-server and handing
clean JSON back to your frontend — live, with a short in-memory cache so
it doesn't hammer IRD on every visitor hit.

This replaces the old `data.json` + GitHub Actions snapshot pipeline
entirely. There's no scheduled job — data is fetched on demand and cached
for 5 minutes.

## Endpoints

- `GET /api/health` — trivial `{ ok: true }` check. Point your keep-alive
  ping service at this one so pings don't cause extra IRD API calls.
- `GET /api/winners` — same shape as the old `data.json`, fetched live
  (cached for 5 minutes).
- `GET /api/winners/refresh` — bypasses the cache and forces a fresh pull
  from IRD. Handy for manually confirming new draws are showing up.

Response shape from `/api/winners`:

```json
{
  "snapshotDate": "2026-09-22T10:15:00.000Z",
  "source": "https://prize.ird.gov.np/api/v1/public/winners",
  "draws": [
    {
      "id": "draw_...",
      "category": "Bumper Prize",
      "title": "Bhadra 16–31 (Sept 1–16)",
      "from": "2026-09-01",
      "to": "2026-09-16",
      "published": "2026-09-17",
      "deadline": "2026-10-02",
      "open": true,
      "winners": [{ "r": 1, "c": "048915618211" }]
    }
  ]
}
```

## Running locally

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`. Try `http://localhost:3000/api/winners`.

## Deploying to Render

1. Push this folder to a GitHub (or GitLab/Bitbucket) repo.
2. In Render: **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine to start
4. Deploy. Render gives you a URL like `https://coupon-checker-backend.onrender.com`.
5. Test it: `https://coupon-checker-backend.onrender.com/api/winners`.

No environment variables are required to get started — `ALLOWED_ORIGIN`
defaults to `*`. Once your frontend has a real domain, set
`ALLOWED_ORIGIN` in Render's dashboard to that exact origin (e.g.
`https://couponchecker.com`) to lock CORS down.

## Keeping it warm (avoiding Render's free-tier spin-down)

Render's free web services spin down after ~15 minutes of no traffic and
take a few seconds to wake back up on the next request. Ping
`/api/health` every ~14 minutes to keep it warm, using any external
scheduler — no GitHub Actions involved:

- **cron-job.org** (free) — add a job hitting
  `https://your-service.onrender.com/api/health` every 14 minutes.
- **UptimeRobot** (free) — same idea, plus you get downtime alerts.
- **Betterstack / Freshping** — similar free monitors.

Pinging `/api/health` (not `/api/winners`) means the keep-alive traffic
never triggers extra calls to IRD's API.

## Updating the frontend

In your existing `index.html`, change the line that loads local data:

```js
// old
fetch("./data.json")

// new
fetch("https://your-service.onrender.com/api/winners")
```

Everything downstream (the winner-matching logic, the Winners page
rendering) stays the same, since the response shape is unchanged from the
old `data.json`.

## Notes

- `MAX_PAGES` (30) and `PAGE_SIZE` (20) in `server.js` mirror the caps from
  the original `scripts/fetch-winners.mjs` — raise `MAX_PAGES` if IRD ever
  publishes more than 600 winners across draws.
- The 5-minute in-memory cache resets on every server restart/redeploy —
  fine for this use case, but know that a fresh deploy means the very
  first request after it will be a live IRD fetch (slightly slower).
