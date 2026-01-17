require("dotenv").config();
const Octokit = require("@octokit/rest");
const fetch = require("node-fetch");
const eaw = require("eastasianwidth");

const { GIST_ID, GH_TOKEN, LASTFM_API_KEY } = process.env;

const LASTFM_USERNAME =
  process.env.LFMUSERNAME || process.env.LASTFM_USERNAME;

if (!LASTFM_USERNAME) {
  console.error("Missing LFMUSERNAME");
  process.exit(0);
}

const octokit = new Octokit({
  auth: `token ${GH_TOKEN}`,
});

const MAX_ITEMS = 5;
const BAR_LENGTH = 16;
const TITLE_WIDTH = 28;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

function progressBar(percent, length) {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

async function getRecentTracks() {
  const url =
    "https://ws.audioscrobbler.com/2.0/?" +
    "method=user.getrecenttracks" +
    "&user=" + encodeURIComponent(LASTFM_USERNAME) +
    "&limit=200" +
    "&api_key=" + LASTFM_API_KEY +
    "&format=json";

  const res = await fetch(url);
  const json = await res.json();
  return json && json.recenttracks && json.recenttracks.track
    ? json.recenttracks.track
    : [];
}

async function main() {
  const now = Date.now();
  const tracks = await getRecentTracks();
  const playCount = new Map();

  for (const t of tracks) {
    if (t["@attr"] && t["@attr"].nowplaying === "true") continue;
    if (!t.date || !t.date.uts) continue;

    const playedAt = Number(t.date.uts) * 1000;
    if (now - playedAt > SEVEN_DAYS_MS) continue;

    const name = t.name.trim();
    playCount.set(name, (playCount.get(name) || 0) + 1);
  }

  let content;

  if (playCount.size === 0) {
    content = "No scrobbles in the last 7 days.";
  } else {
    const ranked = [...playCount.entries()]
      .map(([name, plays]) => ({ name, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, MAX_ITEMS);

    const total = ranked.reduce((s, t) => s + t.plays, 0);

    content = ranked
      .map(t => {
        const title = padRight(
          ellipsis(t.name, TITLE_WIDTH),
          TITLE_WIDTH
        );
        const bar = progressBar((t.plays / total) * 100, BAR_LENGTH);
        const count = String(t.plays).padStart(4);
        return title + " " + bar + " " + count;
      })
      .join("\n");
  }

  const gist = await octokit.gists.get({ gist_id: GIST_ID });
  const filename = Object.keys(gist.data.files)[0];

  await octokit.gists.update({
    gist_id: GIST_ID,
    files: {
      [filename]: { content },
    },
  });
}

main().catch(err => {
  console.error(err);
  process.exit(0);
});
