require("dotenv").config();
const Octokit = require("@octokit/rest");
const fetch = require("node-fetch");
const eaw = require("eastasianwidth");

const {
  GIST_ID,
  GH_TOKEN,
  LASTFM_API_KEY,
  LASTFM_USERNAME,
} = process.env;

const octokit = new Octokit({
  auth: `token ${GH_TOKEN}`,
});

const MAX_ITEMS = 5;
const BAR_LENGTH = 16;
const TITLE_WIDTH = 28;

/* ---------- helpers ---------- */

function visualLength(str) {
  return [...str].reduce((l, c) => l + eaw.characterLength(c), 0);
}

function ellipsis(str, maxWidth) {
  let out = "";
  for (const c of str) {
    if (visualLength(out + c + "...") > maxWidth) break;
    out += c;
  }
  return visualLength(str) > maxWidth ? out + "..." : str;
}

function padRight(str, width) {
  const diff = width - visualLength(str);
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function progressBar(pct, len) {
  const filled = Math.round((pct / 100) * len);
  return "█".repeat(filled) + "░".repeat(len - filled);
}

/* ---------- last.fm ---------- */

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function getTopTracks() {
  // 1️⃣ Try weekly chart first
  const weeklyURL =
    `https://ws.audioscrobbler.com/2.0/?method=user.getweeklytrackchart` +
    `&user=${encodeURIComponent(LASTFM_USERNAME)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json`;

  const weekly = await fetchJSON(weeklyURL);

  if (weekly?.weeklytrackchart?.track?.length) {
    return weekly.weeklytrackchart.track.map(t => ({
      name: t.name,
      plays: Number(t.playcount),
    }));
  }

  // 2️⃣ Fallback → last 7 days top tracks (guaranteed)
  const fallbackURL =
    `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks` +
    `&user=${encodeURIComponent(LASTFM_USERNAME)}` +
    `&period=7day` +
    `&limit=${MAX_ITEMS}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json`;

  const fallback = await fetchJSON(fallbackURL);

  if (!fallback?.toptracks?.track?.length) {
    throw new Error("No Last.fm track data available");
  }

  return fallback.toptracks.track.map(t => ({
    name: t.name,
    plays: Number(t.playcount),
  }));
}

/* ---------- main ---------- */

async function main() {
  const tracks = (await getTopTracks()).slice(0, MAX_ITEMS);
  const total = tracks.reduce((s, t) => s + t.plays, 0);

  const lines = tracks.map(t => {
    const title = padRight(
      ellipsis(t.name, TITLE_WIDTH),
      TITLE_WIDTH
    );

    const bar = progressBar((t.plays / total) * 100, BAR_LENGTH);
    const count = String(t.plays).padStart(4);

    return `${title} ${bar} ${count}`;
  });

  const gist = await octokit.gists.get({ gist_id: GIST_ID });
  const filename = Object.keys(gist.data.files)[0];

  await octokit.gists.update({
    gist_id: GIST_ID,
    files: {
      [filename]: { content: lines.join("\n") },
    },
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
