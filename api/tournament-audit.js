import { runTournamentAudit } from "./_tournament-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const result = await runTournamentAudit();
    res.setHeader("cache-control", "no-store");
    res.status(result.passed ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({ passed: false, error: error instanceof Error ? error.message : "Audit failed" });
  }
}
