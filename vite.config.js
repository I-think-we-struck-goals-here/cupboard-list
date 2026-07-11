import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function replaceOrThrow(source, oldValue, newValue, message) {
  if (!source.includes(oldValue)) throw new Error(message);
  return source.replace(oldValue, newValue);
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

      const expectedPoll = "setInterval(()=>{if(!document.hidden&&S.saving.size===0)load()},30000)";
      if (!html.includes(expectedPoll)) {
        throw new Error("Tournament polling interval changed, polling optimisation was not applied.");
      }

      await writeFile(file, html);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [optimiseTournament()],
});