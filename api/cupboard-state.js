import { kv } from "@vercel/kv";

const STORAGE_KEY = process.env.CUPBOARD_STATE_KEY || "cupboard:main";

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
      const existing = await kv.get(STORAGE_KEY);
      if (!existing) {
        return sendJson(res, 200, { data: null });
      }
      return sendJson(res, 200, { data: normalizeState(existing) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "KV not configured";
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
      await kv.set(STORAGE_KEY, normalized);
      return sendJson(res, 200, { data: normalized });
    } catch (error) {
      const message = error instanceof Error ? error.message : "KV not configured";
      return sendJson(res, 503, { error: `Cloud storage unavailable: ${message}` });
    }
  }

  res.setHeader("allow", "GET, PUT");
  return sendJson(res, 405, { error: "Method not allowed." });
}
