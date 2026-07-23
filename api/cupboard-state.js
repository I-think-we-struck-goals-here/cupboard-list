import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put
} from "@vercel/blob";
import { applyOperations, normalizeState } from "./_cupboard-state-core.js";

const STORAGE_PATHNAME =
  process.env.CUPBOARD_STATE_PATHNAME || "cupboard-state-private.json";
const LEGACY_STORAGE_PATHNAME =
  process.env.CUPBOARD_LEGACY_STATE_PATHNAME || "cupboard-state.json";
const MAX_WRITE_ATTEMPTS = 12;
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

function isPreconditionFailure(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error instanceof BlobPreconditionFailedError ||
    error?.name === "BlobPreconditionFailedError" ||
    error?.status === 412 ||
    error?.statusCode === 412 ||
    message.includes("conditional request cannot succeed") ||
    message.includes("conflicting operation against this resource")
  );
}

function isAlreadyExists(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 409 ||
    error?.statusCode === 409 ||
    error?.name === "BlobAlreadyExistsError" ||
    message.includes("already exists")
  );
}

function delay(attempt) {
  const milliseconds =
    Math.min(250, 10 * 1.6 ** attempt) + Math.floor(Math.random() * 20);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    state: normalizeState(await response.json()),
    etag: null
  };
}

async function readState() {
  const result = await get(STORAGE_PATHNAME, {
    access: "private",
    useCache: false
  });

  if (!result) {
    return readLegacyState();
  }

  if (result.statusCode !== 200 || !result.stream) {
    throw new Error("Cloud storage returned an unexpected response.");
  }

  return {
    state: normalizeState(await new Response(result.stream).json()),
    etag: result.blob.etag
  };
}

async function writeState(state, etag) {
  const options = {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8"
  };

  if (etag) {
    options.allowOverwrite = true;
    options.ifMatch = etag;
  } else {
    options.allowOverwrite = false;
  }

  await put(STORAGE_PATHNAME, JSON.stringify(state), options);
}

async function applyOperationsSafely(operations) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { state, etag } = await readState();
    const nextState = applyOperations(state, operations);

    try {
      await writeState(nextState, etag);
      return nextState;
    } catch (error) {
      const conflicted =
        (etag && isPreconditionFailure(error)) ||
        (!etag && isAlreadyExists(error));
      if (!conflicted) {
        throw error;
      }
      await delay(attempt);
    }
  }

  throw new Error("The shared cupboard is busy. Please retry.");
}

export default async function handler(req, res) {
  setResponseHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      const { state } = await readState();
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
      const state = await applyOperationsSafely(operations);
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
    normalized.version += 1;
    normalized.updatedAt = new Date().toISOString();

    try {
      await put(STORAGE_PATHNAME, JSON.stringify(normalized), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8"
      });
      return sendJson(res, 200, { data: normalized });
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
