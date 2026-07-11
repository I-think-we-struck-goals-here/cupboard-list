import {
  BlobPreconditionFailedError,
  del,
  get,
  put,
} from "@vercel/blob";

const STORAGE_PATHNAME = "pool-pingpong-tournament-state.json";
const MAX_WRITE_ATTEMPTS = 24;

export const PLAYERS = [
  "Zac", "Koray", "George Mills", "Max", "Sam Singleton", "Tarik",
  "Yosesh", "Will Black", "Mick Doolan", "Joe Geog", "Harps", "JJ",
  "Nirbhey Jain",
];

const POOL_ROUNDS = [
  [["Zac", "Mick Doolan"], ["Sam Singleton", "Nirbhey Jain"], ["Joe Geog", "Harps"], ["George Mills", "Yosesh"], ["Will Black", "JJ"]],
  [["Zac", "Max"], ["Tarik", "Will Black"], ["George Mills", "JJ"], ["Joe Geog", "Nirbhey Jain"], ["Koray", "Harps"]],
  [["Zac", "Joe Geog"], ["Koray", "Yosesh"], ["Sam Singleton", "Tarik"], ["Harps", "JJ"], ["Max", "Mick Doolan"]],
  [["Zac", "Yosesh"], ["George Mills", "Tarik"], ["Max", "Nirbhey Jain"], ["Koray", "Sam Singleton"], ["Will Black", "Mick Doolan"]],
];

const PING_ROUNDS = [
  [["Koray", "Max"], ["Tarik", "Harps"], ["Yosesh", "Mick Doolan"], ["Sam Singleton", "JJ"], ["Zac", "Nirbhey Jain"]],
  [["Koray", "George Mills"], ["Max", "Sam Singleton"], ["Will Black", "Harps"], ["JJ", "Nirbhey Jain"], ["Yosesh", "Joe Geog"]],
  [["Koray", "Mick Doolan"], ["Harps", "Nirbhey Jain"], ["Tarik", "Joe Geog"], ["Zac", "Sam Singleton"], ["George Mills", "Will Black"]],
  [["Koray", "Will Black"], ["Zac", "JJ"], ["George Mills", "Mick Doolan"], ["Max", "Joe Geog"], ["Tarik", "Yosesh"]],
];

function makeFixtures(prefix, rounds) {
  let number = 1;
  return rounds.flatMap((matches, roundIndex) =>
    matches.map(([p1, p2]) => ({
      id: `${prefix}-${number++}`,
      round: roundIndex + 1,
      p1,
      p2,
    })),
  );
}

export const FIXTURES = {
  pool: makeFixtures("pool", POOL_ROUNDS),
  pingpong: makeFixtures("pingpong", PING_ROUNDS),
};

const FIXTURE_BY_ID = new Map(
  [...FIXTURES.pool, ...FIXTURES.pingpong].map((fixture) => [fixture.id, fixture]),
);
const KNOCKOUT_IDS = new Set([
  "pool-sf1", "pool-sf2", "pool-final",
  "pingpong-sf1", "pingpong-sf2", "pingpong-final",
]);
const VALID_IDS = new Set([...FIXTURE_BY_ID.keys(), ...KNOCKOUT_IDS]);

class ScoreConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScoreConflictError";
  }
}

function emptyState() {
  return { version: 0, updated_at: null, scores: {} };
}

function sportForId(id) {
  return id.startsWith("pingpong-") ? "pingpong" : "pool";
}

function knockoutIds(sport) {
  return [`${sport}-sf1`, `${sport}-sf2`, `${sport}-final`];
}

function validScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 999 ? score : null;
}

function normalizeScores(value) {
  const scores = {};
  if (!value || typeof value !== "object") return scores;

  for (const [id, raw] of Object.entries(value)) {
    if (!VALID_IDS.has(id) || !raw || typeof raw !== "object") continue;
    const p1Score = validScore(raw.p1_score);
    const p2Score = validScore(raw.p2_score);
    if (p1Score === null || p2Score === null || p1Score === p2Score) continue;

    const fixture = FIXTURE_BY_ID.get(id);
    const p1 = fixture?.p1 ?? String(raw.p1 || "").trim();
    const p2 = fixture?.p2 ?? String(raw.p2 || "").trim();
    if (!PLAYERS.includes(p1) || !PLAYERS.includes(p2) || p1 === p2) continue;

    scores[id] = {
      p1_score: p1Score,
      p2_score: p2Score,
      p1,
      p2,
      entered_by: String(raw.entered_by || "Guest").slice(0, 80),
      updated_at: String(raw.updated_at || new Date(0).toISOString()),
    };
  }
  return scores;
}

function normalizeState(value) {
  return {
    version: Number.isSafeInteger(value?.version) && value.version >= 0 ? value.version : 0,
    updated_at: value?.updated_at ? String(value.updated_at) : null,
    scores: normalizeScores(value?.scores ?? value),
  };
}

function cloneState(state) {
  return {
    version: state.version,
    updated_at: state.updated_at,
    scores: Object.fromEntries(
      Object.entries(state.scores).map(([id, score]) => [id, { ...score }]),
    ),
  };
}

function publicState(state) {
  return {
    version: state.version,
    updated_at: state.updated_at,
    scores: state.scores,
  };
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

function sendJson(res, status, payload) {
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-content-type-options", "nosniff");
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function delay(attempt) {
  const ms = Math.min(400, 12 * 1.6 ** attempt) + Math.floor(Math.random() * 25);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPreconditionFailure(error) {
  return error instanceof BlobPreconditionFailedError ||
    error?.name === "BlobPreconditionFailedError" ||
    error?.status === 412 || error?.statusCode === 412;
}

function isAlreadyExists(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 409 || error?.statusCode === 409 ||
    error?.name === "BlobAlreadyExistsError" || message.includes("already exists");
}

async function readState(pathname = STORAGE_PATHNAME) {
  const result = await get(pathname, {
    access: "public",
    headers: { "cache-control": "no-cache" },
  });
  if (!result) return { state: emptyState(), etag: null };
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error("Score storage returned an invalid response.");
  }
  const text = await new Response(result.stream).text();
  return {
    state: normalizeState(text ? JSON.parse(text) : {}),
    etag: result.blob.etag,
  };
}

async function writeState(pathname, state, etag) {
  const options = {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  };
  if (etag) {
    options.allowOverwrite = true;
    options.ifMatch = etag;
  } else {
    options.allowOverwrite = false;
  }
  return put(pathname, JSON.stringify(state), options);
}

async function mutateState(mutator, pathname = STORAGE_PATHNAME) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { state: current, etag } = await readState(pathname);
    const draft = cloneState(current);
    const result = mutator(draft);
    draft.version = current.version + 1;
    draft.updated_at = new Date().toISOString();

    try {
      await writeState(pathname, draft, etag);
      return { state: draft, result };
    } catch (error) {
      if ((etag && isPreconditionFailure(error)) || (!etag && isAlreadyExists(error))) {
        await delay(attempt);
        continue;
      }
      throw error;
    }
  }
  throw new ScoreConflictError("The scoreboard is busy. Please retry in a moment.");
}

function standings(scores, sport) {
  const rows = Object.fromEntries(
    PLAYERS.map((name) => [name, {
      name, played: 0, won: 0, lost: 0, for: 0, against: 0,
      diff: 0, average: 0, winRate: 0,
    }]),
  );

  for (const fixture of FIXTURES[sport]) {
    const score = scores[fixture.id];
    if (!score) continue;
    const p1 = rows[fixture.p1];
    const p2 = rows[fixture.p2];
    p1.played += 1;
    p2.played += 1;
    p1.for += score.p1_score;
    p1.against += score.p2_score;
    p2.for += score.p2_score;
    p2.against += score.p1_score;
    if (score.p1_score > score.p2_score) {
      p1.won += 1;
      p2.lost += 1;
    } else {
      p2.won += 1;
      p1.lost += 1;
    }
  }

  for (const row of Object.values(rows)) {
    row.diff = row.for - row.against;
    row.average = row.played ? row.diff / row.played : 0;
    row.winRate = row.played ? row.won / row.played : 0;
  }

  return Object.values(rows).sort((a, b) =>
    b.winRate - a.winRate || b.average - a.average || b.diff - a.diff ||
    b.for - a.for || a.name.localeCompare(b.name),
  );
}

function leagueComplete(scores, sport) {
  return FIXTURES[sport].every((fixture) => Boolean(scores[fixture.id]));
}

function scoreMatches(score, pair) {
  return Boolean(score && pair && score.p1 === pair[0] && score.p2 === pair[1]);
}

function winner(score, pair) {
  if (!scoreMatches(score, pair)) return null;
  return score.p1_score > score.p2_score ? pair[0] : pair[1];
}

function expectedKnockoutPair(id, scores) {
  const sport = sportForId(id);
  if (!leagueComplete(scores, sport)) return null;
  const top = standings(scores, sport).slice(0, 4).map((row) => row.name);

  if (id === `${sport}-sf1`) return [top[0], top[3]];
  if (id === `${sport}-sf2`) return [top[1], top[2]];
  if (id !== `${sport}-final`) return null;

  const sf1Pair = [top[0], top[3]];
  const sf2Pair = [top[1], top[2]];
  const finalist1 = winner(scores[`${sport}-sf1`], sf1Pair);
  const finalist2 = winner(scores[`${sport}-sf2`], sf2Pair);
  return finalist1 && finalist2 ? [finalist1, finalist2] : null;
}

function assertExpectedVersion(currentScore, expectedUpdatedAt) {
  const current = currentScore?.updated_at ?? null;
  const expected = expectedUpdatedAt == null ? null : String(expectedUpdatedAt);
  if (current !== expected) {
    throw new ScoreConflictError(
      "Someone else changed this match. The latest score has been loaded.",
    );
  }
}

function clearDependants(scores, id) {
  const removed = [];
  const sport = sportForId(id);
  const candidates = FIXTURE_BY_ID.has(id)
    ? knockoutIds(sport)
    : id === `${sport}-sf1` || id === `${sport}-sf2`
      ? [`${sport}-final`]
      : [];

  for (const dependant of candidates) {
    if (!scores[dependant]) continue;
    delete scores[dependant];
    removed.push(dependant);
  }
  return removed;
}

function applyOperation(state, body) {
  const fixtureId = String(body?.fixture_id || "");
  if (!VALID_IDS.has(fixtureId)) throw new TypeError("Unknown fixture.");
  assertExpectedVersion(state.scores[fixtureId], body?.expected_updated_at);

  if (body?.action === "delete") {
    const invalidated = clearDependants(state.scores, fixtureId);
    delete state.scores[fixtureId];
    return { invalidated };
  }
  if (body?.action !== "save") throw new TypeError("Unknown action.");

  const p1Score = validScore(body?.p1_score);
  const p2Score = validScore(body?.p2_score);
  if (p1Score === null || p2Score === null) {
    throw new TypeError("Enter valid whole-number scores between 0 and 999.");
  }
  if (p1Score === p2Score) throw new TypeError("Matches cannot end in a draw.");

  const fixture = FIXTURE_BY_ID.get(fixtureId);
  let pair;
  if (fixture) {
    pair = [fixture.p1, fixture.p2];
  } else {
    pair = expectedKnockoutPair(fixtureId, state.scores);
    const submitted = [String(body?.p1 || ""), String(body?.p2 || "")];
    if (!pair || pair[0] !== submitted[0] || pair[1] !== submitted[1]) {
      throw new ScoreConflictError(
        "The knockout bracket changed. The latest bracket has been loaded.",
      );
    }
  }

  const invalidated = clearDependants(state.scores, fixtureId);
  state.scores[fixtureId] = {
    p1_score: p1Score,
    p2_score: p2Score,
    p1: pair[0],
    p2: pair[1],
    entered_by: String(body?.entered_by || "Guest").slice(0, 80),
    updated_at: new Date().toISOString(),
  };
  return { invalidated };
}

export async function handleTournament(req, res) {
  res.setHeader("allow", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    try {
      const { state } = await readState();
      return sendJson(res, 200, {
        players: PLAYERS,
        fixtures: FIXTURES,
        ...publicState(state),
      });
    } catch (error) {
      return sendJson(res, 503, {
        error: `Score storage unavailable: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    if (!body || typeof body !== "object") {
      return sendJson(res, 400, { error: "Invalid request body." });
    }

    try {
      const { state, result } = await mutateState((draft) => applyOperation(draft, body));
      return sendJson(res, 200, {
        ...publicState(state),
        invalidated: result.invalidated,
      });
    } catch (error) {
      if (error instanceof ScoreConflictError) {
        try {
          const { state } = await readState();
          return sendJson(res, 409, { error: error.message, ...publicState(state) });
        } catch {
          return sendJson(res, 409, { error: error.message });
        }
      }
      if (error instanceof TypeError) {
        return sendJson(res, 400, { error: error.message });
      }
      return sendJson(res, 503, {
        error: `Score storage unavailable: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

export async function runTournamentAudit() {
  const pathname = `${STORAGE_PATHNAME}.audit-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
  const checks = {};

  try {
    const distinctIds = FIXTURES.pool.slice(0, 12).map((fixture) => fixture.id);
    await Promise.all(distinctIds.map((fixtureId, index) =>
      mutateState((state) => applyOperation(state, {
        action: "save",
        fixture_id: fixtureId,
        p1_score: index + 1,
        p2_score: 0,
        expected_updated_at: null,
        entered_by: "Audit",
      }), pathname),
    ));
    const afterDistinct = await readState(pathname);
    checks.concurrent_distinct_writes = distinctIds.every((id) =>
      Boolean(afterDistinct.state.scores[id]),
    );

    const conflictId = "pool-13";
    const initial = await mutateState((state) => applyOperation(state, {
      action: "save",
      fixture_id: conflictId,
      p1_score: 1,
      p2_score: 0,
      expected_updated_at: null,
      entered_by: "Audit",
    }), pathname);
    const stamp = initial.state.scores[conflictId].updated_at;
    const conflictResults = await Promise.allSettled([
      mutateState((state) => applyOperation(state, {
        action: "save", fixture_id: conflictId, p1_score: 2, p2_score: 0,
        expected_updated_at: stamp, entered_by: "Audit A",
      }), pathname),
      mutateState((state) => applyOperation(state, {
        action: "save", fixture_id: conflictId, p1_score: 3, p2_score: 0,
        expected_updated_at: stamp, entered_by: "Audit B",
      }), pathname),
    ]);
    checks.same_fixture_conflict_detected =
      conflictResults.filter((result) => result.status === "fulfilled").length === 1 &&
      conflictResults.filter((result) =>
        result.status === "rejected" && result.reason?.name === "ScoreConflictError",
      ).length === 1;

    let snapshot = (await readState(pathname)).state;
    for (const fixture of FIXTURES.pool) {
      if (snapshot.scores[fixture.id]) continue;
      const result = await mutateState((state) => applyOperation(state, {
        action: "save", fixture_id: fixture.id, p1_score: 1, p2_score: 0,
        expected_updated_at: null, entered_by: "Audit",
      }), pathname);
      snapshot = result.state;
    }

    const top = standings(snapshot.scores, "pool").slice(0, 4).map((row) => row.name);
    const sf1 = await mutateState((state) => applyOperation(state, {
      action: "save", fixture_id: "pool-sf1", p1_score: 1, p2_score: 0,
      p1: top[0], p2: top[3], expected_updated_at: null, entered_by: "Audit",
    }), pathname);
    await mutateState((state) => applyOperation(state, {
      action: "save", fixture_id: "pool-sf2", p1_score: 1, p2_score: 0,
      p1: top[1], p2: top[2], expected_updated_at: null, entered_by: "Audit",
    }), pathname);
    await mutateState((state) => applyOperation(state, {
      action: "save", fixture_id: "pool-final", p1_score: 1, p2_score: 0,
      p1: top[0], p2: top[1], expected_updated_at: null, entered_by: "Audit",
    }), pathname);

    const beforeEdit = (await readState(pathname)).state;
    const edited = await mutateState((state) => applyOperation(state, {
      action: "save", fixture_id: "pool-1", p1_score: 2, p2_score: 0,
      expected_updated_at: beforeEdit.scores["pool-1"].updated_at,
      entered_by: "Audit",
    }), pathname);
    checks.bracket_invalidated_after_league_edit = knockoutIds("pool").every(
      (id) => !edited.state.scores[id],
    );
    checks.version_monotonic = edited.state.version > sf1.state.version;

    return {
      passed: Object.values(checks).every(Boolean),
      checks,
      final_version: edited.state.version,
      final_score_count: Object.keys(edited.state.scores).length,
    };
  } finally {
    await del(pathname).catch(() => {});
  }
}
