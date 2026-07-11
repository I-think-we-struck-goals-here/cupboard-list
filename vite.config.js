import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function optimiseTournamentSync() {
  return {
    name: "optimise-tournament-sync",
    apply: "build",
    async closeBundle() {
      const file = resolve("dist/tournament/index.html");
      let html = await readFile(file, "utf8");

      const oldRequest = "headers:{'Content-Type':'application/json'},cache:'no-store',...options,signal:controller.signal";
      const newRequest = "headers:{'Content-Type':'application/json'},...options,...((options.method||'GET').toUpperCase()==='GET'?{}:{cache:'no-store'}),signal:controller.signal";
      if (!html.includes(oldRequest)) {
        throw new Error("Tournament request code changed, polling optimisation was not applied.");
      }
      html = html.replace(oldRequest, newRequest);

      const oldPoll = "setInterval(()=>{if(!document.hidden&&S.saving.size===0)load()},8000)";
      const newPoll = "setInterval(()=>{if(!document.hidden&&S.saving.size===0)load()},10000)";
      if (!html.includes(oldPoll)) {
        throw new Error("Tournament polling interval changed, polling optimisation was not applied.");
      }
      html = html.replace(oldPoll, newPoll);

      await writeFile(file, html);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [optimiseTournamentSync()],
});
