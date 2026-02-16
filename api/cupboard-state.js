import { list, put } from "@vercel/blob";

const STORAGE_PATHNAME = process.env.CUPBOARD_STATE_PATHNAME || "cupboard-state.json";

function normalizeState(value) {
  const items = Array.isArray(value?.items)
    ? value.items
        .filter((item) => item && item.name && item.category)
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? "").trim(),
          quantity: String(item.quantity ?? ""),
          lowLevel: String(item.lowLevel ?? "1"),
          category: String(item.category ?? "").trim()
        }))
    : [];

  const customCategories = Array.isArray(value?.customCategories)
    ? value.customCategories.map((category) => String(category ?? "").trim()).filter(Boolean)
    : [];

  return {
    items,
    customCategories
  };
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function parseBody(req) {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  if (typeof req.body === "object") {
    return req.body;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { blobs } = await list({
        prefix: STORAGE_PATHNAME,
        limit: 5
      });

      const target = blobs.find((blob) => blob.pathname === STORAGE_PATHNAME);
      if (!target) {
        return sendJson(res, 200, { data: null });
      }

      const response = await fetch(target.url, {
        cache: "no-store"
      });

      if (!response.ok) {
        return sendJson(res, 503, {
          error: `Cloud storage unavailable: Failed to read blob (${response.status})`
        });
      }

      const parsed = await response.json();
      return sendJson(res, 200, { data: normalizeState(parsed) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Blob not configured";
      return sendJson(res, 503, { error: `Cloud storage unavailable: ${message}` });
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
      await put(STORAGE_PATHNAME, JSON.stringify(normalized), {
        access: "public",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8",
        cacheControlMaxAge: 0
      });
      return sendJson(res, 200, { data: normalized });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Blob not configured";
      return sendJson(res, 503, { error: `Cloud storage unavailable: ${message}` });
    }
  }

  res.setHeader("allow", "GET, PUT");
  return sendJson(res, 405, { error: "Method not allowed." });
}
