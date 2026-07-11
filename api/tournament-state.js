import {
  BlobPreconditionFailedError,
  del,
  get,
  put,
} from "@vercel/blob";

const STORAGE_PATHNAME = "pool-pingpong-tournament-state.json";
const SELF_TEST_TOKEN = "7d4c998b-f310-4c39-9f4f-3e49caa9bd17";
const MAX_WRITE_ATTEMPTS = 12;

const PLAYERS = [
  "Zac",
  "Koray",
  "George Mills",
  "Max",
  "Sam Singleton",
  "Tarik",
  "Yosesh",
  "Will Black",
  "Mick Doolan",
  "Joe Geog",
  "Harps",
  "JJ",
  "Nirbhey Jain",
];

const POOL_ROUNDS = [
  [
    ["Zac", "Mick Doolan"],
    ["Sam Singleton", "Nirbhey Jain"],
    ["Joe Geog", "Harps"],
    ["George Mills", "Yosesh"],
    ["Will Black", "JJ"],
  ],
  [
    ["Zac", "Max"],
    ["Tarik", "Will Black"],
    ["George Mills", "JJ"],
    ["Joe Geog", "Nirbhey Jain"],
    ["Koray", "Harps"],
  ],
  [
    ["Zac", "Joe Geog"],
    ["Koray", "Yosesh"],
    ["Sam Singleton", "Tarik"],
    ["Harps", "JJ"],
    ["Max", "Mick Doolan"],
  ],
  [
    ["Zac", "Yosesh"],
    ["George Mills", "Tarik"],
    ["Max", "Nirbhey Jain"],
    ["Koray", "Sam Singleton"],
    ["Will Black", "Mick Doolan"],
  ],
];

const PING_ROUNDS = [
  [
    ["Koray", "Max"],
    ["Tarik", "Harps"],
    ["Yosesh", "Mick Doolan"],
    ["Sam Singleton", "JJ"],
    ["Zac", "Nirbhey Jain"],
  ],
  [
    ["Koray", "George Mills"],
    ["Max", "Sam Singleton"],
    ["Will Black", "Harps"],
    ["JJ", "Nirbhey Jain"],
    ["Yosesh", "Joe Geog"],
  ],
  [
    ["Koray", "Mick Doolan"],
    ["Harps", "Nirbhey Jain"],
    ["Tarik", "Joe Geog"],
    ["Zac", "Sam Singleton"],
    ["George Mills", "Will Black"],
  ],
  [
    ["Koray", "Will Black"],
    ["Zac", "JJ"],
    ["George Mills", "Mick Doolan"],
    ["Max", "Joe Geog"],
    ["Tarik", "Yosesh"],
  ],
];

function makeFixtures(prefix, rounds) {
  let match = 1;
  return rounds.flatMap((roundMatches, roundIndex) =>
    roundMatches.map(([p1, p2]) => ({
      id: `${prefix}-${match++}`,
      round: roundIndex + 1,
      p1,
      p2,
    })),
  );
}

const FIXTURES = {
  pool: makeFixtures("pool", POOL_ROUNDS),
  pingpong: makeFixtures("pingpong", PING_ROUNDS),
};

const FIXTURE_BY_ID = new Map(
  [...FIXTURES.pool, ...FIXTURES.pingpong].map((fixture) => [fixture.id, fixture]),
);
const KNOCKOUT_IDS = new Set([
  "pool-sf1",
  "pool-sf2",
  "pool-final",
  "pingpong-sf1",
  "pingpong-sf2",
  "pingpong-final",
]);
const VALID_IDS = new Set([...FIXTURE_BY_ID.keys(), ...KNOCKOUT_IDS]);

class ScoreConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScoreConflictError";
  }
}

function sportForId(id) {
  return id.startsWith("pingpong-") ? "pingpong" : "pool";
}

function knockoutIdsForSport(sport) {
  return [`${sport}-sf1`, `${sport}-sf2`, `${sport}-final`];
}

function emptyState() {
  return { version: 0, scores: {}, updated_at: null };
}

function validWholeScore(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 999 ? parsed : null;
}

function normalizeScores(value) {
  const scores = {};
  if (!value || typeof value !== "object") return scores;

  for (const [id, raw] of Object.entries(value)) {
    if (!VALID_IDS.has(id) || !raw || typeof raw !== "object") continue;

    const p1Score = validWholeScore(raw.p1_score);
    const p2Score = validWholeScore(raw.p2_score);
    if (p1Score === null || p2Score === null || p1Score === p2Score) continue;

    const leagueFixture = FIXTURE_BY_ID.get(id);
    const p1 = leagueFixture ? leagueFixture.p1 : String(raw.p1 || "").trim();
    const p2 = leagueFixture ? leagueFixture.p2 : String(raw.p2 || "").trim();
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
  const version = Number.isSafeInteger(value?.version) && value.version >= 0 ? value.version : 0;
  return {
    version,
    scores: normalizeScores(value?.scores ?? value),
    updated_at: value?.updated_at ? String(value.updated_at) : null,
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

function sendJson(res, statusCode, payload) {
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-content-type-options", "nosniff");
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

function requestQuery(req) {
  try {
    return new URL(req.url || "/", "https://local.invalid").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

async function readState(pathname = STORAGE_PATHNAME) {
  const result = await get(pathname, { access: "public" });
  if (!result) return { state: emptyState(), etag: null };

  const text = await new Response(result.stream).text();
  const parsed = text ? JSON.parse(text) : {};
  return { state: normalizeState(parsed), etag: result.blob.etag };
}

function isPreconditionFailure(error) {
  return (
    error instanceof BlobPreconditionFailedError ||
    error?.name === "BlobPreconditionFailedError" ||
    error?.status === 412 ||
    error?.statusCode === 412
  );
}

function waitForRetry(attempt) {
  const delay = Math.min(250, 12 * 2 ** attempt) + Math.floor(Math.random() * 18);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function writeState(pathname, state, etag) {
  const payload = JSON.stringify(state);
  const common = {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  };

  if (etag) {
    return put(pathname, payload, {
      ...common,
      allowOverwrite: true,
      ifMatch: etag,
    });
  }

  return put(pathname, payload, {
    ...common,
    allowOverwrite: false,
  });
}

async function mutateState(mutator, pathname = STORAGE_PATHNAME) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { state: current, etag } = await readState(pathname);
    const draft = cloneState(current);
    const result = mutator(draft);
    const now = new Date().toISOString();
    draft.version = current.version + 1;
    draft.updated_at = now;

    try {
      await writeState(pathname, draft, etag);
      return { state: draft, result };
    } catch (error) {
      if (etag && isPreconditionFailure(error)) {
        await waitForRetry(attempt);
        continue;
      }

      if (!etag) {
        const after = await readState(pathname);
        if (after.etag) {
          await waitForRetry(attempt);
          continue;
        }
      }

      throw error;
    }
  }

  throw new ScoreConflictError("The scoreboard is busy. Please retry in a moment.");
}

function standingsForSport(scores, sport) {
  const rows = Object.fromEntries(
    PLAYERS.map((name) => [
      name,
      { name, played: 0, won: 0, lost: 0, for: 0, against: 0, diff: 0, average: 0, winRate: 0 },
    ]),
  );

  for (const fixture of FIXTURES[sport]) {
    const score = scores[fixture.id];
    if (!score) continue;

    const a = score.p1_score;
    const b = score.p2_score;
    const p1 = rows[fixture.p1];
    const p2 = rows[fixture.p2];
    p1.played += 1;
    p2.played += 1;
    p1.for += a;
    p1.against += b;
    p2.for += b;
    p2.against += a;
    if (a > b) {
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

  return Object.values(rows).sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.average - a.average ||
      b.diff - a.diff ||
      b.for - a.for ||
      a.name.localeCompare(b.name),
  );
}

function leagueComplete(scores, sport) {
  return FIXTURES[sport].every((fixture) => Boolean(scores[fixture.id]));
}

function scoreMatchesPair(score, pair) {
  return Boolean(score && pair && score.p1 === pair[0] && score.p2 === pair[1]);
}

function winnerFor(score, pair) {
  if (!scoreMatchesPair(score, pair)) return null;
  return score.p1_score > score.p2_score ? pair[0] : pair[1];
}

function expectedKnockoutPair(id, scores) {
  const sport = sportForId(id);
  if (!leagueComplete(scores, sport)) return null;

  const top = standingsForSport(scores, sport).slice(0, 4).map((row) => row.name);
  if (id === `${sport}-sf1`) return [top[0], top[3]];
  if (id === `${sport}-sf2`) return [top[1], top[2]];

  if (id === `${sport}-final`) {
    const sf1Pair = [top[0], top[3]];
    const sf2Pair = [top[1], top[2]];
    const finalist1 = winnerFor(scores[`${sport}-sf1`], sf1Pair);
    const finalist2 = winnerFor(scores[`${sport}-sf2`], sf2Pair);
    return finalist1 && finalist2 ? [finalist1, finalist2] : null;
  }

  return null;
}

function assertExpectedVersion(currentScore, expectedUpdatedAt) {
  const currentStamp = currentScore?.updated_at ?? null;
  const expectedStamp = expectedUpdatedAt == null ? null : String(expectedUpdatedAt);
  if (currentStamp !== expectedStamp) {
    throw new ScoreConflictError(
      "Someone else changed this match. The latest score has been loaded.",
    );
  }
}

function clearDependants(scores, id) {
  const removed = [];
  const sport = sportForId(id);

  if (FIXTURE_BY_ID.has(id)) {
    for (const knockoutId of knockoutIdsForSport(sport)) {
      if (scores[knockoutId]) {
        delete scores[knockoutId];
        removed.push(knockoutId);
      }
    }
  } else if (id === `${sport}-sf1` || id === `${sport}-sf2`) {
    const finalId = `${sport}-final`;
    if (scores[finalId]) {
      delete scores[finalId];
      removed.push(finalId);
    }
  }

  return removed;
}

function applyOperation(state, body) {
  const action = body?.action;
  const fixtureId = String(body?.fixture_id || "");
  if (!VALID_IDS.has(fixtureId)) {
    throw new TypeError("Unknown fixture.");
  }

  const currentScore = state.scores[fixtureId];
  assertExpectedVersion(currentScore, body?.expected_updated_at);

  if (action === "delete") {
    const invalidated = clearDependants(state.scores, fixtureId);
    delete state.scores[fixtureId];
    return { action, fixture_id: fixtureId, invalidated };
  }

  if (action !== "save") {
    throw new TypeError("Unknown action.");
  }

  const p1Score = validWholeScore(body?.p1_score);
  const p2Score = validWholeScore(body?.p2_score);
  if (p1Score === null || p2Score === null) {
    throw new TypeError("Enter valid whole-number scores between 0 and 999.");
  }
  if (p1Score === p2Score) {
    throw new TypeError("Matches cannot end in a draw.");
  }

  const leagueFixture = FIXTURE_BY_ID.get(fixtureId);
  let pair;
  if (leagueFixture) {
    pair = [leagueFixture.p1, leagueFixture.p2];
  } else {
    pair = expectedKnockoutPair(fixtureId, state.scores);
    const submittedPair = [String(body?.p1 || ""), String(body?.p2 || "")];
    if (!pair || pair[0] !== submittedPair[0] || pair[1] !== submittedPair[1]) {
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

  return { action, fixture_id: fixtureId, invalidated };
}

function publicSnapshot(state) {
  return {
    version: state.version,
    updated_at: state.updated_at,
    scores: state.scores,
  };
}

async function runSelfTest() {
  const pathname = `${STORAGE_PATHNAME}.audit-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
  const checks = {};

  try {
    const distinctIds = FIXTURES.pool.slice(0, 8).map((fixture) => fixture.id);
    const distinct = await Promise.all(
      distinctIds.map((fixtureId, index) =>
        mutateState(
          (state) =>
            applyOperation(state, {
              action: "save",
              fixture_id: fixtureId,
              p1_score: index + 1,
              p2_score: 0,
              expected_updated_at: null,
              entered_by: "Concurrency audit",
            }),
          pathname,
        ),
      ),
    );
    const afterDistinct = await readState(pathname);
    checks.concurrent_distinct_writes =
      distinct.length === distinctIds.length &&
      distinctIds.every((id) => Boolean(afterDistinct.state.scores[id]));

    const conflictId = "pool-9";
    const initialConflict = await mutateState(
      (state) =>
        applyOperation(state, {
          action: "save",
          fixture_id: conflictId,
          p1_score: 1,
          p2_score: 0,
          expected_updated_at: null,
          entered_by: "Concurrency audit",
        }),
      pathname,
    );
    const baseStamp = initialConflict.state.scores[conflictId].updated_at;
    const sameFixtureResults = await Promise.allSettled([
      mutateState(
        (state) =>
          applyOperation(state, {
            action: "save",
            fixture_id: conflictId,
            p1_score: 2,
            p2_score: 0,
            expected_updated_at: baseStamp,
            entered_by: "Audit A",
          }),
        pathname,
      ),
      mutateState(
        (state) =>
          applyOperation(state, {
            action: "save",
            fixture_id: conflictId,
            p1_score: 3,
            p2_score: 0,
            expected_updated_at: baseStamp,
            entered_by: "Audit B",
          }),
        pathname,
      ),
    ]);
    checks.same_fixture_conflict_detected =
      sameFixtureResults.filter((result) => result.status === "fulfilled").length === 1 &&
      sameFixtureResults.filter(
        (result) => result.status === "rejected" && result.reason?.name === "ScoreConflictError",
      ).length === 1;

    const current = await readState(pathname);
    const remaining = FIXTURES.pool.filter((fixture) => !current.state.scores[fixture.id]);
    for (const fixture of remaining) {
      await mutateState(
        (state) =>
          applyOperation(state, {
            action: "save",
            fixture_id: fixture.id,
            p1_score: 1,
            p2_score: 0,
            expected_updated_at: null,
            entered_by: "Bracket audit",
          }),
        pathname,
      );
    }

    const leagueReady = await readState(pathname);
    const top = standingsForSport(leagueReady.state.scores, "pool")
      .slice(0, 4)
      .map((row) => row.name);
    const sf1 = await mutateState(
      (state) =>
        applyOperation(state, {
          action: "save",
          fixture_id: "pool-sf1",
          p1_score: 1,
          p2_score: 0,
          p1: top[0],
          p2: top[3],
          expected_updated_at: null,
          entered_by: "Bracket audit",
        }),
      pathname,
    );
    await mutateState(
      (state) =>
        applyOperation(state, {
          action: "save",
          fixture_id: "pool-sf2",
          p1_score: 1,
          p2_score: 0,
          p1: top[1],
          p2: top[2],
          expected_updated_at: null,
          entered_by: "Bracket audit",
        }),
      pathname,
    );
    await mutateState(
      (state) =>
        applyOperation(state, {
          action: "save",
          fixture_id: "pool-final",
          p1_score: 1,
          p2_score: 0,
          p1: top[0],
          p2: top[1],
          expected_updated_at: null,
          entered_by: "Bracket audit",
        }),
      pathname,
    );

    const beforeLeagueEdit = await readState(pathname);
    const leagueId = "pool-1";
    const leagueStamp = beforeLeagueEdit.state.scores[leagueId].updated_at;
    const edited = await mutateState(
      (state) =>
        applyOperation(state, {
          action: "save",
          fixture_id: leagueId,
          p1_score: 2,
          p2_score: 0,
          expected_updated_at: leagueStamp,
          entered_by: "Bracket audit",
        }),
      pathname,
    );
    checks.bracket_invalidated_after_league_edit = knockoutIdsForSport("pool").every(
      (id) => !edited.state.scores[id],
    );
    checks.version_monotonic = edited.state.version > sf1.state.version;

    const passed = Object.values(checks).every(Boolean);
    return {
      passed,
      checks,
      final_version: edited.state.version,
      final_score_count: Object.keys(edited.state.scores).length,
    };
  } finally {
    await del(pathname).catch(() => {});
  }
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
    const query = requestQuery(req);
    if (query.get("selftest") === SELF_TEST_TOKEN) {
      try {
        return sendJson(res, 200, await runSelfTest());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Self-test failed";
        return sendJson(res, 500, { passed: false, error: message, name: error?.name });
      }
    }

    try {
      const { state } = await readState();
      return sendJson(res, 200, {
        players: PLAYERS,
        fixtures: FIXTURES,
        ...publicSnapshot(state),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage unavailable";
      return sendJson(res, 503, { error: `Score storage unavailable: ${message}` });
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
        ...publicSnapshot(state),
        invalidated: result.invalidated,
      });
    } catch (error) {
      if (error instanceof ScoreConflictError) {
        try {
          const { state } = await readState();
          return sendJson(res, 409, { error: error.message, ...publicSnapshot(state) });
        } catch {
          return sendJson(res, 409, { error: error.message });
        }
      }
      if (error instanceof TypeError) {
        return sendJson(res, 400, { error: error.message });
      }

      const message = error instanceof Error ? error.message : "Storage unavailable";
      return sendJson(res, 503, { error: `Score storage unavailable: ${message}` });
    }
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}
