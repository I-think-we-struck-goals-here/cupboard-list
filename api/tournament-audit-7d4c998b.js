import { runTournamentAudit } from "./_tournament-core.js";

function send(res, status, payload) {
  res.setHeader("cache-control", "no-store, max-age=0");
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
  try {
    return send(res, 200, await runTournamentAudit());
  } catch (error) {
    return send(res, 500, {
      passed: false,
      name: error?.name,
      error: error instanceof Error ? error.message : "Audit failed",
    });
  }
}
