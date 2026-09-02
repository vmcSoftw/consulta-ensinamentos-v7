import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "app", "api", "ask");
const target = path.join(dir, "route.ts");

if (!fs.existsSync(dir)) {
  console.error("Pasta app/api/ask não encontrada.");
  process.exit(1);
}

const backups = fs.readdirSync(dir)
  .filter((n) => n.startsWith("route.ts.backup-"))
  .sort()
  .reverse();

if (!backups.length) {
  console.error("Nenhum backup do Perguntar encontrado.");
  process.exit(1);
}

const backup = path.join(dir, backups[0]);
fs.copyFileSync(backup, target);
console.log("Rota anterior restaurada a partir de:", backups[0]);
