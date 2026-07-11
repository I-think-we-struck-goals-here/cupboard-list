const TARGET = "https://cupboard-list-site.vercel.app/api/tournament-state";

function snapshot(response) {
  return {
    status: response.status,
    cache: response.headers.get("x-vercel-cache"),
    age: response.headers.get("age"),
    etag: response.headers.get("etag"),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const first = await fetch(TARGET);
  await first.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = await fetch(TARGET);
  await second.arrayBuffer();

  res.setHeader("cache-control", "no-store");
  res.status(200).json({ first: snapshot(first), second: snapshot(second) });
}
