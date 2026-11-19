// Setzt die Version überall gleichzeitig:  node scripts/version.mjs 0.3.0
// Danach: git commit -am "Version 0.3.0" && git tag v0.3.0 && git push --follow-tags
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? "")) {
  console.error("Aufruf: node scripts/version.mjs 1.2.3   (oder 1.2.3-beta.1)");
  process.exit(1);
}

function edit(file, fn) {
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) console.warn(`! ${file}: nichts geändert`);
  writeFileSync(file, after);
  console.log(`✔ ${file}`);
}

const json = (file) =>
  edit(file, (s) => {
    const data = JSON.parse(s);
    data.version = version;
    return JSON.stringify(data, null, 2) + "\n";
  });

json("package.json");
json("src-tauri/tauri.conf.json");
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = ".*"$/m, `version = "${version}"`));
edit("src-tauri/Cargo.lock", (s) =>
  s.replace(/(name = "anvil-studio"\r?\nversion = )".*"/, `$1"${version}"`),
);
edit("package-lock.json", (s) => {
  const data = JSON.parse(s);
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return JSON.stringify(data, null, 2) + "\n";
});

console.log(`\nVersion ${version} gesetzt. Release veröffentlichen:\n`);
console.log(`  git commit -am "Version ${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push --follow-tags`);
