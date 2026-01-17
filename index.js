require("dotenv").config();
const Octokit = require("@octokit/rest");
const fetch = require("node-fetch");
const eaw = require("eastasianwidth");

const { GIST_ID, GH_TOKEN } = process.env;

const LASTFM_USERNAME =
  process.env.LFMUSERNAME || process.env.LASTFM_USERNAME;

const LASTFM_API_KEY =
  process.env.LASTFM_KEY || process.env.LASTFM_API_KEY;

if (!LASTFM_USERNAME || !LASTFM_API_KEY) {
  console.error("Missing Last.fm configuration");
  process.exit(0);
}

const octokit = new Octokit({
  auth: `token ${GH_TOKEN}`,
});

const MAX_ITEMS = 10;
const TRACK_WIDTH = 18;

// 🔧 Artist column pulled closer
const ARTIST_COLUMN = 34;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/* ---------- utils ---------- */

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

function repeat(char, count) {
  return count > 0 ? char.repeat(count) : "";
}

/* ---------- last.fm ---------- */

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

  return json?.recenttracks?.track || [];
}

/* ---------- main ---------- */

async function main() {
  const now = Date.now();
  const tracks = await getRecentTracks();

  const playMap = new Map();

  for (const t of tracks) {
    if (t["@attr"]?.nowplaying === "true") continue;
    if (!t.date?.uts) continue;

    const playedAt = Number(t.date.uts) * 1000;
    if (now - playedAt > SEVEN_DAYS_MS) continue;

    const track = t.name.trim();
    const artist = t.artist["#text"].trim();
    const key = `${track}|||${artist}`;

    playMap.set(key, (playMap.get(key) || 0) + 1);
  }

  let content;

  if (playMap.size === 0) {
    content = "No scrobbles in the last 7 days.";
  } else {
    const ranked = [...playMap.entries()]
      .map(([key, plays]) => {
        const [track, artist] = key.split("|||");
        return { track, artist, plays };
      })
      .sort((a, b) => b.plays - a.plays)
      .slice(0, MAX_ITEMS);

    content = ranked
      .map(item => {
        const prefix = "▶ ";

        const trackText = ellipsis(item.track, TRACK_WIDTH);

        // Fixed-column dot leader (keeps vertical alignment)
        const dotsCount = Math.max(
          1,
          ARTIST_COLUMN -
            visualLength(prefix + trackText) -
            1
        );

        const dots = repeat(".", dotsCount);

        return (
          prefix +
          trackText +
          " " +
          dots +
          " 🎵 " +
          item.artist
        );
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
