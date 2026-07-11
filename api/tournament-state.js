import { list, put } from "@vercel/blob";

const STORAGE_PATHNAME = "pool-pingpong-tournament-state.json";

const PLAYERS = [
  "Zac", "Koray", "George Mills", "Max", "Sam Singleton", "Tarik",
  "Yosesh", "Will Black", "Mick Doolan", "Joe Geog", "Harps", "JJ",
  "Nirbhey Jain"
];

const POOL_ROUNDS = [
  [["Zac", "Mick Doolan"], ["Sam Singleton", "Nirbhey Jain"], ["Joe Geog", "Harps"], ["George Mills", "Yosesh"], ["Will Black", "JJ"]],
  [["Zac", "Max"], ["Tarik", "Will Black"], ["George Mills", "JJ"], ["Joe Geog", "Nirbhey Jain"], ["Koray", "Harps"]],
  [["Zac", "Joe Geog"], ["Koray", "Yosesh"], ["Sam Singleton", "Tarik"], ["Harps", "JJ"], ["Max", "Mick Doolan"]],
  [["Zac", "Yosesh"], ["George Mills", "Tarik"], ["Max", "Nirbhey Jain"], ["Koray", "Sam Singleton"], ["Will Black", "Mick Doolan"]]
];

const PING_ROUNDS = [
  [["Koray", "Max"], ["Tarik", "Harps"], ["Yosesh", "Mick Doolan"], ["Sam Singleton", "JJ"], ["Zac", "Nirbhey Jain"]],
  [["Koray", "George Mills"], ["Max", "Sam Singleton"], ["Will Black", "Harps"], ["JJ", "Nirbhey Jain"], ["Yosesh", "Joe Geog"]],
  [["Koray", "Mick Doolan"], ["Harps", "Nirbhey Jain"], ["Tarik", "Joe Geog"], ["Zac", "Sam Singleton"], ["George Mills", "Will Black"]],
  [["Koray", "Will Black"], ["Zac", "JJ"], ["George Mills", "Mick Doolan"], ["Max", "Joe Geog"], ["Tarik", "Yosesh"]]
];

function makeFixtures(prefix, rounds) {
  let match = 1;
  return rounds.flatMap((roundMatches, roundIndex) =>
    roundMatches.map(([p1, p2]) => ({
      id: `${prefix}-${match++}`,
      round: roundIndex + 1,
      p1,
      p2
    }))
  );
}

const FIXTURES = {
  pool: makeFixtures("pool", POOL_ROUNDS),
  pingpong: makeFixtures("pingpong", PING_ROUNDS)
};

const LEAGUE_IDS = new Set([...FIXTURES.pool, ...FIXTURES.pingpong].map((fixture) => fixture.id));
const KNOCKOUT_IDS = new Set([
  "pool-sf1", "pool-sf2", "pool-final",
  "pingpong-sf1", "pingpong-sf2", "pingpong-final"
]);
const VALID_IDS = new Set([...LEAGUE_IDS, ...KNOCKOUT_IDS]);

function sendJson(res, statusCode, payload) {
  res.setHeader("cache-control", "no-store, max-age=0");
  res.status(statusCode).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function normaliseScores(value) {
  const scores = {};
  if (!value || typeof value !== "object") return scores;

  for (const [id, score] of Object.entries(value)) {
    if (!VALID_IDS.has(id) || !score || typeof score !== "object") continue;
    const p1Score = Number(score.p1_score);
    const p2Score = Number(score.p2_score);
    if (!Number.isInteger(p1Score) || !Number.isInteger(p2Score)) continue;
    if (p1Score < 0 || p2Score < 0 || p1Score > 999 || p2Score > 999 || p1Score === p2Score) continue;
    scores[id] = {
      p1_score: p1Score,
      p2_score: p2Score,
      entered_by: String(score.entered_by || "Guest").slice(0, 80),
      updated_at: String(score.updated_at || new Date().toISOString())
    };
  }
  return scores;
}

async function readScores() {
  const { blobs } = await list({ prefix: STORAGE_PATHNAME, limit: 5 });
  const target = blobs.find((blob) => blob.pathname === STORAGE_PATHNAME);
  if (!target) return {};

  const response = await fetch(target.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to read scores (${response.status})`);
  const data = await response.json();
  return normaliseScores(data?.scores ?? data);
}

async function writeScores(scores) {
  const payload = {
    scores: normaliseScores(scores),
    updated_at: new Date().toISOString()
  };

  await put(STORAGE_PATHNAME, JSON.stringify(payload), {
    access: "public",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0
  });

  return payload.scores;
}

export default async function handler(req, res) {
  res.setHeader("allow", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    try {
      const scores = await readScores();
      return sendJson(res, 200, { players: PLAYERS, fixtures: FIXTURES, scores });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage unavailable";
      return sendJson(res, 503, { error: message });
    }
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const action = body?.action;
    const fixtureId = String(body?.fixture_id || "");

    if (!VALID_IDS.has(fixtureId)) {
      return sendJson(res, 400, { error: "Unknown fixture." });
    }

    try {
      const scores = await readScores();

      if (action === "delete") {
        delete scores[fixtureId];
      } else if (action === "save") {
        const p1Score = Number(body?.p1_score);
        const p2Score = Number(body?.p2_score);
        if (!Number.isInteger(p1Score) || !Number.isInteger(p2Score) || p1Score < 0 || p2Score < 0 || p1Score > 999 || p2Score > 999) {
          return sendJson(res, 400, { error: "Enter valid whole-number scores." });
        }
        if (p1Score === p2Score) {
          return sendJson(res, 400, { error: "Matches cannot end in a draw." });
        }
        scores[fixtureId] = {
          p1_score: p1Score,
          p2_score: p2Score,
          entered_by: String(body?.entered_by || "Guest").slice(0, 80),
          updated_at: new Date().toISOString()
        };
      } else {
        return sendJson(res, 400, { error: "Unknown action." });
      }

      const saved = await writeScores(scores);
      return sendJson(res, 200, { scores: saved });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage unavailable";
      return sendJson(res, 503, { error: message });
    }
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}
