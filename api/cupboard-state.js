import { BlobNotFoundError, head, list, put } from "@vercel/blob";
import { applyOperations, normalizeState } from "./_cupboard-state-core.js";

const LEGACY_STORAGE_PATHNAME =
  process.env.CUPBOARD_LEGACY_STATE_PATHNAME || "cupboard-state.json";
const EVENT_PREFIX =
  process.env.CUPBOARD_EVENT_PREFIX || "cupboard-events/";
const EXTRA_ALLOWED_ORIGINS = String(
  process.env.CUPBOARD_ALLOWED_ORIGINS || ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  "https://cupboard-list-site.vercel.app",
  "https://i-think-we-struck-goals-here.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...EXTRA_ALLOWED_ORIGINS
]);

function resolveCorsOrigin(originHeader) {
  if (!originHeader) {
    return null;
  }

  try {
    const origin = new URL(originHeader).origin;
    return ALLOWED_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

function setResponseHeaders(req, res) {
  const origin = resolveCorsOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-content-type-options", "nosniff");
}

function sendJson(res, statusCode, payload) {
  res
    .status(statusCode)
    .setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function parseBody(req) {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "object") {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function isNotFound(error) {
  return (
    error instanceof BlobNotFoundError ||
    error?.name === "BlobNotFoundError" ||
    String(error?.message || "").toLowerCase().includes("does not exist")
  );
}

async function readLegacyState() {
  let metadata;
  try {
    metadata = await head(LEGACY_STORAGE_PATHNAME);
  } catch (error) {
    if (isNotFound(error)) {
      return { state: null, etag: null };
    }
    throw error;
  }

  const url = new URL(metadata.url);
  url.searchParams.set("version", metadata.etag);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });

  if (!response.ok) {
    throw new Error(`Failed to read cloud storage (${response.status}).`);
  }

  return {
    state: normalizeState(await response.json())
  };
}

function eventPathname(operation, timestamp) {
  const nonce = globalThis.crypto.randomUUID();
  const payload = Buffer.from(JSON.stringify(operation)).toString("base64url");
  return `${EVENT_PREFIX}${String(timestamp).padStart(13, "0")}~${nonce}~${payload}.json`;
}

function parseEvent(pathname) {
  if (!pathname.startsWith(EVENT_PREFIX) || !pathname.endsWith(".json")) {
    return null;
  }

  const encoded = pathname
    .slice(EVENT_PREFIX.length, -".json".length)
    .split("~");
  if (encoded.length !== 3) {
    return null;
  }

  const timestamp = Number(encoded[0]);
  if (!Number.isSafeInteger(timestamp)) {
    return null;
  }

  try {
    return {
      timestamp,
      operation: JSON.parse(Buffer.from(encoded[2], "base64url").toString())
    };
  } catch {
    return null;
  }
}

async function listEvents() {
  const blobs = [];
  let cursor;

  do {
    const page = await list({
      prefix: EVENT_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs
    .map((blob) => ({ pathname: blob.pathname, event: parseEvent(blob.pathname) }))
    .filter(({ event }) => event)
    .sort((a, b) => a.pathname.localeCompare(b.pathname))
    .map(({ event }) => event);
}

async function readState() {
  const [{ state: legacyState }, events] = await Promise.all([
    readLegacyState(),
    listEvents()
  ]);
  let state = legacyState;

  for (const event of events) {
    state = applyOperations(
      state,
      [event.operation],
      new Date(event.timestamp).toISOString()
    );
  }

  return state;
}

async function appendOperations(operations) {
  const timestamp = Date.now();
  await Promise.all(
    operations.map((operation, index) =>
      put(eventPathname(operation, timestamp + index), "", {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json; charset=utf-8"
      })
    )
  );
  return timestamp + operations.length - 1;
}

export default async function handler(req, res) {
  setResponseHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      const state = await readState();
      return sendJson(res, 200, { data: state });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Blob not configured";
      return sendJson(res, 503, {
        error: `Cloud storage unavailable: ${message}`
      });
    }
  }

  if (req.method === "POST") {
    const parsed = parseBody(req);
    const operations = parsed?.operations;
    if (
      !Array.isArray(operations) ||
      operations.length === 0 ||
      operations.length > 100
    ) {
      return sendJson(res, 400, {
        error: "Provide between 1 and 100 cupboard operations."
      });
    }

    try {
      const currentState = await readState();
      const timestamp = await appendOperations(operations);
      const state = applyOperations(
        currentState,
        operations,
        new Date(timestamp).toISOString()
      );
      return sendJson(res, 200, { data: state });
    } catch (error) {
      const statusCode = error instanceof TypeError ? 400 : 503;
      const message =
        error instanceof Error ? error.message : "Blob not configured";
      return sendJson(res, statusCode, {
        error:
          statusCode === 400
            ? message
            : `Cloud storage unavailable: ${message}`
      });
    }
  }

  if (req.method === "PUT") {
    const parsed = parseBody(req);
    const payload = parsed?.data ?? parsed;
    if (!payload || typeof payload !== "object") {
      return sendJson(res, 400, { error: "Invalid payload." });
    }

    const normalized = normalizeState(payload);

    try {
      const currentState = await readState();
      const restoredIds = new Set(normalized.items.map((item) => item.id));
      const operations = [
        ...normalized.items.map((item) => ({ type: "upsert", item })),
        ...currentState.items
          .filter((item) => !restoredIds.has(item.id))
          .map((item) => ({ type: "delete", id: item.id }))
      ];
      const timestamp = await appendOperations(operations);
      return sendJson(res, 200, {
        data: applyOperations(
          currentState,
          operations,
          new Date(timestamp).toISOString()
        )
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Blob not configured";
      return sendJson(res, 503, {
        error: `Cloud storage unavailable: ${message}`
      });
    }
  }

  res.setHeader("allow", "GET, POST, PUT, OPTIONS");
  return sendJson(res, 405, { error: "Method not allowed." });
}
