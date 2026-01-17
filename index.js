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

/* ---------------- helpers ---------------- */

function visualLength(str) {
  return [...str].reduce((len, ch) => len + eaw.characterLength(ch), 0);
}

function ellipsis(str, maxWidth) {
  let out = "";
  for (const ch of str) {
    if (visualLength(out + ch + "...") > maxWidth) break;
    out += ch;
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

/* ---------------- last.fm ---------------- */

async function getWeeklyTopTracks() {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=user.getweeklytrackchart` +
    `&user=${encodeURIComponent(LASTFM_USERNAME)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.weeklytrackchart?.track) {
    throw new Error("Invalid Last.fm response");
  }

  return json.weeklytrackchart.track.map(t => ({
    name: t.name,
    plays: Number(t.playcount),
  }));
}

/* ---------------- main ---------------- */

async function main() {
  const tracks = await getWeeklyTopTracks();
  const top = tracks.slice(0, MAX_ITEMS);

  const totalPlays = top.reduce((s, t) => s + t.plays, 0);

  const lines = top.map(t => {
    const title = padRight(
      ellipsis(t.name, TITLE_WIDTH),
      TITLE_WIDTH
    );

    const bar = progressBar((t.plays / totalPlays) * 100, BAR_LENGTH);
    const count = String(t.plays).padStart(4);

    return `${title} ${bar} ${count}`;
  });

  const gist = await octokit.gists.get({ gist_id: GIST_ID });
  const filename = Object.keys(gist.data.files)[0];

  await octokit.gists.update({
    gist_id: GIST_ID,
    files: {
      [filename]: {
        content: lines.join("\n"),
      },
    },
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
