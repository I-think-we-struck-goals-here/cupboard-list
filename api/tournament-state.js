import { handleTournament } from "./_tournament-core.js";

export default async function tournamentState(req, res) {
  if (req.method === "GET") {
    res.setHeader(
      "Vercel-CDN-Cache-Control",
      "max-age=15, stale-while-revalidate=2, stale-if-error=60",
    );
  }

  return handleTournament(req, res);
}
