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

async function getTopTracksSafe() {
  // Try weekly chart
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

  // Fallback: last 7 days
  const fallbackURL =
    `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks` +
    `&user=${encodeURIComponent(LASTFM_USERNAME)}` +
    `&period=7day` +
    `&limit=${MAX_ITEMS}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json`;

  const fallback = await fetchJSON(fallbackURL);

  if (fallback?.toptracks?.track?.length) {
    return fallback.toptracks.track.map(t => ({
      name: t.name,
      plays: Number(t.playcount),
    }));
  }

  // Absolute fallback: no crash
  return [];
}

/* ---------- main ---------- */

async function main() {
  const tracks = (await getTopTracksSafe()).slice(0, MAX_ITEMS);

  let content;

  if (!tracks.length) {
    content = "No scrobbles in the last 7 days.";
  } else {
    const total = tracks.reduce((s, t) => s + t.plays, 0);

    content = tracks.map(t => {
      const title = padRight(
        ellipsis(t.name, TITLE_WIDTH),
        TITLE_WIDTH
      );
      const bar = progressBar((t.plays / total) * 100, BAR_LENGTH);
      const count = String(t.plays).padStart(4);
      return `${title} ${bar} ${count}`;
    }).join("\n");
  }

  const gist = await octokit.gists.get({ gist_id: GIST_ID });
  const filename = Objec
