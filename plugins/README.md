# Plugins für Anvil Studio

Ein Plugin ist eine `.anvilplugin`-Datei – ein ZIP mit `plugin.json` im obersten Ordner.
Installieren: Anvil Studio → Strg K → „Plugins verwalten“ → „Plugin-Datei installieren …“ (oder Datei ins Fenster ziehen).
Zum Entwickeln kann auch ein Ordner installiert werden („Neues Plugin anlegen“ erzeugt ein Gerüst).

## plugin.json

```json
{
  "id": "mein-plugin",            // a–z, 0–9, - und _
  "name": "Mein Plugin",
  "version": "1.0.0",
  "author": "Ich",
  "description": "…",
  "permissions": ["content.read"],
  "contributes": {
    "nodes": ["nodes.json"],      // Blueprint-Knoten (oder direkt als Liste)
    "abilities": ["abilities.json"],
    "editors": [],
    "commands": [{ "id": "x", "label": "…", "script": "scripts/x.js" }],
    "export": [{ "id": "y", "label": "…", "when": "after", "script": "scripts/y.js" }],
    "mods": [{ "id": "geckolib", "name": "GeckoLib", "file": "mods/geckolib.jar", "versionRange": "[4.7,)" }]
  }
}
```

### Berechtigungen
`content.read`, `content.write`, `files.write` (nur `src/main/resources` und `src/main/java`),
`export.jar` (gebaute Mod-Datei lesen), `secrets` (Schlüssel sicher speichern), `network:<host>` (nur https, nur dieser Host).

## Blueprint-Knoten (`nodes`)
```json
{ "kind": "ring", "cat": "world", "label": "Partikel-Ring", "desc": "…",
  "props": [{ "key": "radius", "label": "Radius", "type": "number", "def": "2", "pin": "num" }],
  "java": "level.sendParticles(…, x + {{num:radius}}, y, z, 1, 0, 0, 0, 0);" }
```
- `cat`: event, flow, values, vars, block, world, player, other
- Werte-Knoten: `"value": "num" | "bool" | "text"` und `"expr"` statt `"java"`
- Platzhalter: `{{num:key}}`, `{{int:key}}`, `{{text:key}}`, `{{bool:key}}` (alle mit Werte-Verbindung),
  `{{ident:key}}` (Java-Bezeichner, z. B. `FLAME`), `{{id:key}}` (`"minecraft:stone"`), `{{out:<id>}}` (Ablauf-Ausgang), `{{modid}}`
- Im Code verfügbar: `level` (ServerLevel), `player` (Player, kann null sein), `target` (LivingEntity), `x`, `y`, `z`, `state`, `stack`
- Klassen bitte voll ausschreiben (`net.minecraft.world.phys.AABB`). Hilfsfunktionen in `"methods"`.

## Fähigkeiten (`abilities`)
```json
{ "kind": "aura", "group": "Aussehen", "label": "Partikel-Aura", "every": 10,
  "props": [{ "key": "count", "label": "Anzahl", "type": "number", "def": "4" }],
  "tick": "level.sendParticles(…, pos.getX() + 0.5, …, {{int:count}}, …);",
  "use": "player.sendSystemMessage(…); return true;" }
```
Im Code: `level`, `pos`, `state`, `be` (Tick) bzw. `player` (Rechtsklick).

## Editoren (`editors`)
```json
{ "id": "quests", "label": "Quests", "item": "Quest",
  "fields": [{ "key": "title", "label": "Titel" }, { "key": "xp", "label": "XP", "type": "number", "def": "10" }],
  "files": [{ "path": "data/{{modid}}/quests/{{id}}.json", "template": "{ \"title\": {{json:title}}, \"xp\": {{raw:xp}} }" }] }
```

## Skripte
`export default async function (anvil) { … }` – laufen abgeschottet (kein Internet, keine Dateien).
`anvil.project`, `anvil.content.get/set/data/setData`, `anvil.ui.toast/confirm/prompt/pickFile`,
`anvil.files.write`, `anvil.export.jar`, `anvil.net.fetch(url, { method, headers, json, body, multipart })`,
`anvil.secrets.get/set`, `anvil.log`.
