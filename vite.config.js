import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function replaceOrThrow(source, oldValue, newValue, message) {
  if (!source.includes(oldValue)) throw new Error(message);
  return source.replace(oldValue, newValue);
}

function lines(...values) {
  return values.join("\n");
}

function tournamentFrontendOverrides() {
  renderTable = function renderTable() {
    const rows = standings();
    const qualifyingPlaces = S.sport === "pingpong" ? 8 : 4;
    document.querySelector("#tableView .section-head .muted").textContent =
      S.sport === "pingpong" ? "Top eight qualify" : "Top four qualify";

    $("#table").innerHTML = rows.some((row) => row.p)
      ? `<div class="table-wrap"><table><thead><tr><th>Pos</th><th>Player</th><th>P</th><th>W</th><th>L</th><th>For</th><th>Against</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${rows.map((row, index) => `<tr class="${index < qualifyingPlaces ? "top" : ""}"><td>${index + 1}</td><td>${esc(row.name)}</td><td>${row.p}</td><td>${row.w}</td><td>${row.l}</td><td>${row.f}</td><td>${row.a}</td><td>${row.d > 0 ? "+" : ""}${row.d}</td><td><strong>${row.pts}</strong></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty">The table will appear as scores are entered.</div>';
  };

  renderFinals = function renderFinals() {
    const complete = games().every((game) => S.scores[game.id]);
    const isPingPong = S.sport === "pingpong";
    const qualifierCount = isPingPong ? 8 : 4;
    const top = complete
      ? standings().slice(0, qualifierCount).map((row) => row.name)
      : [];
    const prefix = S.sport;
    const match = (id, stage, p1, p2, seed1 = "", seed2 = "") =>
      p1 && p2
        ? card({ id, p1, p2, seed1, seed2 }, stage)
        : `<div class="card"><div class="stage">${stage}</div><div class="empty" style="border:0;padding:18px 0">Waiting for the previous round.</div></div>`;

    document.querySelector("#tableView .section-head .muted").textContent =
      isPingPong ? "Top eight qualify" : "Top four qualify";
    document.querySelector("#finalsView h2").textContent = isPingPong
      ? "Quarter-finals, semi-finals & final"
      : "Semi-finals & final";
    document.querySelector("#finalsView .section-head .muted").textContent = isPingPong
      ? "1st v 8th · 4th v 5th · 2nd v 7th · 3rd v 6th"
      : "1st v 4th · 2nd v 3rd";

    if (!isPingPong) {
      const a = top[0] || "";
      const b = top[3] || "";
      const c = top[1] || "";
      const d = top[2] || "";
      const finalist1 = winner(`${prefix}-sf1`, a, b);
      const finalist2 = winner(`${prefix}-sf2`, c, d);
      const champion = winner(`${prefix}-final`, finalist1, finalist2);

      $("#finals").innerHTML = `${complete ? "" : `<div class="empty" style="margin-bottom:12px">Complete all ${games().length} league fixtures to lock the top four.</div>`}<div class="finals">${match(`${prefix}-sf1`, "Semi-final 1", a, b, "1", "4")}${match(`${prefix}-sf2`, "Semi-final 2", c, d, "2", "3")}<div class="final">${match(`${prefix}-final`, "Final", finalist1, finalist2)}</div></div>${champion ? `<div class="champion">Champion<strong>${esc(champion)}</strong></div>` : ""}`;
      return;
    }

    const qfPairs = [
      [top[0] || "", top[7] || "", "1", "8"],
      [top[3] || "", top[4] || "", "4", "5"],
      [top[1] || "", top[6] || "", "2", "7"],
      [top[2] || "", top[5] || "", "3", "6"],
    ];
    const qfWinners = qfPairs.map(([p1, p2], index) =>
      winner(`${prefix}-qf${index + 1}`, p1, p2),
    );
    const sf1 = [qfWinners[0], qfWinners[1]];
    const sf2 = [qfWinners[2], qfWinners[3]];
    const finalist1 = winner(`${prefix}-sf1`, sf1[0], sf1[1]);
    const finalist2 = winner(`${prefix}-sf2`, sf2[0], sf2[1]);
    const champion = winner(`${prefix}-final`, finalist1, finalist2);

    $("#finals").innerHTML = `${complete ? "" : `<div class="empty" style="margin-bottom:12px">Complete all ${games().length} league fixtures to lock the top eight.</div>`}<div class="finals"><div class="round-title">Quarter-finals</div>${qfPairs.map(([p1, p2, seed1, seed2], index) => match(`${prefix}-qf${index + 1}`, `Quarter-final ${index + 1}`, p1, p2, seed1, seed2)).join("")}<div class="round-title">Semi-finals</div>${match(`${prefix}-sf1`, "Semi-final 1", sf1[0], sf1[1])}${match(`${prefix}-sf2`, "Semi-final 2", sf2[0], sf2[1])}<div class="round-title">Final</div><div class="final">${match(`${prefix}-final`, "Final", finalist1, finalist2)}</div></div>${champion ? `<div class="champion">Champion<strong>${esc(champion)}</strong></div>` : ""}`;
  };
}

function optimiseTournament() {
  return {
    name: "optimise-tournament",
    apply: "build",

    async buildStart() {
      const coreFile = resolve("api/_tournament-core.js");
      let core = await readFile(coreFile, "utf8");

      core = replaceOrThrow(
        core,
        "diff: 0, average: 0, winRate: 0,",
        "diff: 0, points: 0,",
        "Tournament standings fields changed, points scoring was not applied.",
      );
      core = replaceOrThrow(
        core,
        "row.average = row.played ? row.diff / row.played : 0;\n    row.winRate = row.played ? row.won / row.played : 0;",
        "row.points = row.won * 3;",
        "Tournament standings calculation changed, points scoring was not applied.",
      );
      core = replaceOrThrow(
        core,
        "b.winRate - a.winRate || b.average - a.average || b.diff - a.diff ||\n    b.for - a.for || a.name.localeCompare(b.name),",
        "b.points - a.points || b.diff - a.diff ||\n    b.for - a.for || a.name.localeCompare(b.name),",
        "Tournament standings sort changed, points scoring was not applied.",
      );
      core = replaceOrThrow(
        core,
        lines(
          "const KNOCKOUT_IDS = new Set([",
          '  "pool-sf1", "pool-sf2", "pool-final",',
          '  "pingpong-sf1", "pingpong-sf2", "pingpong-final",',
          "]);",
        ),
        lines(
          "const KNOCKOUT_IDS = new Set([",
          '  "pool-sf1", "pool-sf2", "pool-final",',
          '  "pingpong-qf1", "pingpong-qf2", "pingpong-qf3", "pingpong-qf4",',
          '  "pingpong-sf1", "pingpong-sf2", "pingpong-final",',
          "]);",
        ),
        "Tournament knockout IDs changed, ping pong quarter-finals were not added.",
      );
      core = replaceOrThrow(
        core,
        lines(
          "function knockoutIds(sport) {",
          "  return [`${sport}-sf1`, `${sport}-sf2`, `${sport}-final`];",
          "}",
        ),
        lines(
          "function knockoutIds(sport) {",
          '  return sport === "pingpong"',
          "    ? [`${sport}-qf1`, `${sport}-qf2`, `${sport}-qf3`, `${sport}-qf4`, `${sport}-sf1`, `${sport}-sf2`, `${sport}-final`]",
          "    : [`${sport}-sf1`, `${sport}-sf2`, `${sport}-final`];",
          "}",
        ),
        "Tournament knockout list changed, ping pong quarter-finals were not added.",
      );
      core = replaceOrThrow(
        core,
        lines(
          "function expectedKnockoutPair(id, scores) {",
          "  const sport = sportForId(id);",
          "  if (!leagueComplete(scores, sport)) return null;",
          "  const top = standings(scores, sport).slice(0, 4).map((row) => row.name);",
          "",
          "  if (id === `${sport}-sf1`) return [top[0], top[3]];",
          "  if (id === `${sport}-sf2`) return [top[1], top[2]];",
          "  if (id !== `${sport}-final`) return null;",
          "",
          "  const sf1Pair = [top[0], top[3]];",
          "  const sf2Pair = [top[1], top[2]];",
          "  const finalist1 = winner(scores[`${sport}-sf1`], sf1Pair);",
          "  const finalist2 = winner(scores[`${sport}-sf2`], sf2Pair);",
          "  return finalist1 && finalist2 ? [finalist1, finalist2] : null;",
          "}",
        ),
        lines(
          "function expectedKnockoutPair(id, scores) {",
          "  const sport = sportForId(id);",
          "  if (!leagueComplete(scores, sport)) return null;",
          "",
          '  if (sport === "pool") {',
          "    const top = standings(scores, sport).slice(0, 4).map((row) => row.name);",
          "    if (id === `${sport}-sf1`) return [top[0], top[3]];",
          "    if (id === `${sport}-sf2`) return [top[1], top[2]];",
          "    if (id !== `${sport}-final`) return null;",
          "    const finalist1 = winner(scores[`${sport}-sf1`], [top[0], top[3]]);",
          "    const finalist2 = winner(scores[`${sport}-sf2`], [top[1], top[2]]);",
          "    return finalist1 && finalist2 ? [finalist1, finalist2] : null;",
          "  }",
          "",
          "  const top = standings(scores, sport).slice(0, 8).map((row) => row.name);",
          "  const qfPairs = [",
          "    [top[0], top[7]],",
          "    [top[3], top[4]],",
          "    [top[1], top[6]],",
          "    [top[2], top[5]],",
          "  ];",
          "  if (id === `${sport}-qf1`) return qfPairs[0];",
          "  if (id === `${sport}-qf2`) return qfPairs[1];",
          "  if (id === `${sport}-qf3`) return qfPairs[2];",
          "  if (id === `${sport}-qf4`) return qfPairs[3];",
          "",
          "  const qfWinners = qfPairs.map((pair, index) =>",
          "    winner(scores[`${sport}-qf${index + 1}`], pair),",
          "  );",
          "  const sf1Pair = qfWinners[0] && qfWinners[1] ? [qfWinners[0], qfWinners[1]] : null;",
          "  const sf2Pair = qfWinners[2] && qfWinners[3] ? [qfWinners[2], qfWinners[3]] : null;",
          "  if (id === `${sport}-sf1`) return sf1Pair;",
          "  if (id === `${sport}-sf2`) return sf2Pair;",
          "  if (id !== `${sport}-final`) return null;",
          "",
          "  const finalist1 = winner(scores[`${sport}-sf1`], sf1Pair);",
          "  const finalist2 = winner(scores[`${sport}-sf2`], sf2Pair);",
          "  return finalist1 && finalist2 ? [finalist1, finalist2] : null;",
          "}",
        ),
        "Tournament bracket calculation changed, ping pong top-eight bracket was not applied.",
      );
      core = replaceOrThrow(
        core,
        lines(
          "  const candidates = FIXTURE_BY_ID.has(id)",
          "    ? knockoutIds(sport)",
          "    : id === `${sport}-sf1` || id === `${sport}-sf2`",
          "      ? [`${sport}-final`]",
          "      : [];",
        ),
        lines(
          "  let candidates = [];",
          "  if (FIXTURE_BY_ID.has(id)) {",
          "    candidates = knockoutIds(sport);",
          '  } else if (sport === "pool" && (id === "pool-sf1" || id === "pool-sf2")) {',
          '    candidates = ["pool-final"];',
          '  } else if (id === "pingpong-qf1" || id === "pingpong-qf2") {',
          '    candidates = ["pingpong-sf1", "pingpong-final"];',
          '  } else if (id === "pingpong-qf3" || id === "pingpong-qf4") {',
          '    candidates = ["pingpong-sf2", "pingpong-final"];',
          '  } else if (id === "pingpong-sf1" || id === "pingpong-sf2") {',
          '    candidates = ["pingpong-final"];',
          "  }",
        ),
        "Tournament dependency clearing changed, ping pong bracket resets were not applied.",
      );

      await writeFile(coreFile, core);
    },

    async closeBundle() {
      const file = resolve("dist/tournament/index.html");
      let html = await readFile(file, "utf8");

      html = replaceOrThrow(
        html,
        "fetch('/api/tournament-state',{",
        "fetch(options.fresh?'/api/tournament-state?fresh='+Date.now():'/api/tournament-state',{",
        "Tournament API endpoint changed, refresh bypass was not applied.",
      );
      html = replaceOrThrow(
        html,
        "headers:{'Content-Type':'application/json'},cache:'no-store',...options,signal:controller.signal",
        "headers:{'Content-Type':'application/json'},...options,...((options.method||'GET').toUpperCase()==='GET'?{}:{cache:'no-store'}),signal:controller.signal",
        "Tournament request code changed, polling optimisation was not applied.",
      );
      html = replaceOrThrow(
        html,
        "const data=await api();applyPayload(data);",
        "const data=await api(show?{fresh:true}:{});applyPayload(data);",
        "Tournament refresh code changed, refresh bypass was not applied.",
      );
      html = replaceOrThrow(
        html,
        "{name,p:0,w:0,l:0,f:0,a:0,d:0,av:0,pct:0}",
        "{name,p:0,w:0,l:0,f:0,a:0,d:0,pts:0}",
        "Tournament table fields changed, points scoring was not applied.",
      );
      html = replaceOrThrow(
        html,
        "row.d=row.f-row.a;row.av=row.p?row.d/row.p:0;row.pct=row.p?row.w/row.p:0}return Object.values(rows).sort((a,b)=>b.pct-a.pct||b.av-a.av||b.d-a.d||b.f-a.f||a.name.localeCompare(b.name))",
        "row.d=row.f-row.a;row.pts=row.w*3}return Object.values(rows).sort((a,b)=>b.pts-a.pts||b.d-a.d||b.f-a.f||a.name.localeCompare(b.name))",
        "Tournament table ranking changed, points scoring was not applied.",
      );
      html = replaceOrThrow(
        html,
        "Ranked by win percentage, then average score difference, total difference and points scored.",
        "Ranked by points, then score difference and points scored. Three points are awarded for a win.",
        "Tournament table explanation changed, points scoring copy was not applied.",
      );
      html = replaceOrThrow(
        html,
        "<th>Diff</th><th>Avg</th><th>Win %</th>",
        "<th>Diff</th><th>Pts</th>",
        "Tournament table headings changed, points column was not applied.",
      );
      html = replaceOrThrow(
        html,
        "<td>${row.d>0?'+':''}${row.d}</td><td>${row.av.toFixed(2)}</td><td>${Math.round(row.pct*100)}%</td>",
        "<td>${row.d>0?'+':''}${row.d}</td><td><strong>${row.pts}</strong></td>",
        "Tournament table cells changed, points column was not applied.",
      );
      html = replaceOrThrow(
        html,
        "</style>",
        ".finals .round-title{grid-column:1/-1;margin:10px 2px 0;color:var(--muted);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}</style>",
        "Tournament styles changed, knockout round headings were not added.",
      );

      const startup = "setConnection('connecting');load();setInterval(()=>{if(!document.hidden&&S.saving.size===0)load()},30000);";
      html = replaceOrThrow(
        html,
        startup,
        `(${tournamentFrontendOverrides.toString()})();${startup}`,
        "Tournament startup changed, top-eight frontend bracket was not applied.",
      );

      await writeFile(file, html);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [optimiseTournament()],
});