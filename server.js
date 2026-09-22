import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

// --- Config -----------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // lock this down to your real domain once you have one
const IRD_BASE_URL = "https://prize.ird.gov.np/api/v1/public/winners";
const PAGE_SIZE = 20;
const MAX_PAGES = 30; // safety cap, same as the old fetch-winners.mjs script
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — keeps us from hammering IRD on every visitor hit

app.use(cors({ origin: ALLOWED_ORIGIN }));

// --- In-memory cache ----------------------------------------------------
let cache = { data: null, fetchedAt: 0 };

function isCacheFresh() {
  return cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

// --- Fetch + transform (ported from scripts/fetch-winners.mjs) ---------
async function fetchAllDraws() {
  const draws = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${IRD_BASE_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`IRD API responded ${res.status} ${res.statusText}`);
    }

    const body = await res.json();
    const pageDraws = body.draws || [];
    draws.push(...pageDraws);

    if (!body.has_more) break;
    offset += PAGE_SIZE;
  }

  return draws;
}

function transformDraw(draw) {
  return {
    id: draw.draw_id,
    category: draw.category_title_en,
    title: draw.title_en,
    from: draw.eligible_from,
    to: draw.eligible_to,
    published: draw.published_at,
    deadline: draw.claim_deadline,
    open: draw.claim_open,
    winners: (draw.winners || []).map((w) => ({
      r: w.winner_rank,
      c: w.prize_coupon_number,
    })),
  };
}

async function getWinnersData() {
  if (isCacheFresh()) return cache.data;

  const rawDraws = await fetchAllDraws();
  const data = {
    snapshotDate: new Date().toISOString(),
    source: IRD_BASE_URL,
    draws: rawDraws.map(transformDraw),
  };

  cache = { data, fetchedAt: Date.now() };
  return data;
}

// --- Routes ---------------------------------------------------------------

// Lightweight — safe to hit every 14 minutes from a ping service without
// causing extra calls to IRD's API.
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Same shape as the old data.json file, fetched live (with short caching).
app.get("/api/winners", async (req, res) => {
  try {
    const data = await getWinnersData();
    res.json(data);
  } catch (err) {
    console.error("Failed to fetch winners:", err);
    res.status(502).json({
      error: "Could not reach IRD's winners API. Please try again shortly.",
    });
  }
});

// Force a fresh fetch, bypassing the cache — handy for manual checks.
app.get("/api/winners/refresh", async (req, res) => {
  cache = { data: null, fetchedAt: 0 };
  try {
    const data = await getWinnersData();
    res.json(data);
  } catch (err) {
    console.error("Failed to refresh winners:", err);
    res.status(502).json({
      error: "Could not reach IRD's winners API. Please try again shortly.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Coupon checker backend listening on port ${PORT}`);
});
