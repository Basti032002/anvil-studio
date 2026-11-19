# Anvil Studio

Ein Windows-Launcher zum **Erstellen, Bauen und Testen von Minecraft-Mods**. Projekt anlegen, auf **▶ Testen** klicken und Minecraft startet mit deiner Mod.

> Version 0.5 · NeoForge · Minecraft 1.21.1 / 1.21.4 / 1.21.8 / 1.21.10

## Funktionen

- **Projekte verwalten:** Übersicht mit Status des letzten Builds bzw. Testlaufs
- **Neues Projekt:** Lädt die offizielle NeoForge-MDK-Vorlage (ModDevGradle) und benennt Mod-ID, Paket und Klassen auf dein Projekt um. Danach wird ein Git-Repo angelegt.
- **Java-Verwaltung:** Lädt bei Bedarf Eclipse Temurin 21 herunter, es muss nichts von Hand installiert werden
- **Testen:** Startet `runClient` wahlweise ins Hauptmenü oder direkt in eine Testwelt (`--quickPlaySingleplayer`). Außerdem gibt es Server, Datagen und Bauen.
- **Live-Konsole:** Gradle- und Spielausgabe mit farbigen Warnungen und Fehlern sowie einem Filter „Probleme“
- **Crash-Reports:** Der neueste Absturz wird zusammengefasst angezeigt und kann geöffnet werden
- **Export:** `.jar` bauen und im Explorer anzeigen
- **IDE:** Projekt per Knopf in VS Code oder IntelliJ IDEA öffnen
- **Studio-Oberfläche:** Eigene Titelleiste, Activity-Bar, Statusleiste, Startkonfigurationen wie in einer IDE, Animationen (abschaltbar)
- **Einstellungen:** Update-Verhalten, Standard-Editor, Speicherort, Darstellung
- **Automatische Updates:** Anvil Studio sucht im öffentlichen Repo [anvil-studio-releases](https://github.com/Basti032002/anvil-studio-releases) nach neuen Versionen (bei jedem Start, täglich, wöchentlich oder nur manuell). Es lädt den Installer, prüft die SHA-256-Prüfsumme, installiert und startet neu. Läuft gerade ein Spiel oder Build, wartet es damit.

## Update-Kanäle

| Kanal | Version | Wo | Wer bekommt sie |
|---|---|---|---|
| Stabil | `1.2.3` | öffentlich: `anvil-studio-releases` | alle |
| Beta | `1.2.3-beta.1` | öffentlich: `anvil-studio-releases` (Pre-Release) | wer in den Einstellungen „Beta“ wählt |
| Dev | `1.2.3-dev.1` | **privat**: `anvil-studio-dev` | nur eingeladene Tester mit GitHub-Anmeldung |

Die Dev-Sperre erzwingt GitHub selbst: Nur wer Lesezugriff auf `anvil-studio-dev` hat, kann die Installer laden. Tester lädst du im Entwicklerbereich unter **Tester** ein.

Experimentelle Funktionen nur in Dev-Builds zeigen:

```ts
const isDev = useAppVersion().includes("-dev");   // Oberfläche
```
```rust
let is_dev = env!("CARGO_PKG_VERSION").contains("-dev");  // Backend
```

## Entwicklerbereich

Nur für das Konto `Basti032002`. Anmeldung über die GitHub App „Anvil Studio“ (Device Flow), das Token liegt in der Windows-Anmeldeinformationsverwaltung.

- **Übersicht:** Version im Code, neuestes Release, Downloads, letzter Build und noch nicht veröffentlichte Commits
- **Veröffentlichen:** Fehlerbehebung, neue Funktionen, großes Update oder Beta wählen und Notizen schreiben. Anvil Studio erstellt den Versions-Commit auf `main`, danach erscheint das Release automatisch. Der Fortschritt wird live angezeigt.
- **Releases:** Downloads je Version, als Beta oder stabil markieren, Notizen bearbeiten, löschen
- **Tester:** Tester für Dev-Versionen einladen und entfernen
- **Builds:** Status der GitHub-Actions-Läufe, fehlgeschlagene Läufe neu starten

Einrichtung (einmalig): GitHub App unter Settings → Developer settings → **GitHub Apps** anlegen. Device Flow aktivieren, Webhook aus, Ablauf der Nutzer-Tokens aus. Repository-Rechte: Contents (Read & write), Actions (Read & write), Administration (Read & write), Metadata (Read). Die App auf `anvil-studio`, `anvil-studio-releases` und `anvil-studio-dev` installieren. Die **Client ID** als Repo-Variable `ANVIL_GITHUB_CLIENT_ID` hinterlegen.

Tastenkürzel: `Strg K` Befehlspalette · `F5` Starten · `Umschalt F5` Stoppen · `Strg B` Bauen · `Strg N` Neues Projekt · `Strg ,` Einstellungen

## Arbeitsbereich

- **Inhalte:** Blöcke und Items per Formular (Material, Härte, Leuchtkraft, Werkzeug, Seltenheit, Essbarkeit, Rezept). Beim Speichern entstehen `anvil/AnvilContent.java`, Blockstates, Modelle, Loot-Tabellen, Rezepte, Werkzeug-Tags und Übersetzungen (de/en), jeweils im Format der Minecraft-Version. Die Hauptklasse wird einmalig um `AnvilContent.register(modEventBus)` ergänzt. Grundlage ist `.anvil/content.json`.
  - **Formen:** zu jedem Block optional Treppe, Stufe, Mauer und Zaun – mit Blockstates, Modellen, Loot, Rezepten und Tags.
  - **Erze:** Drop mit Glück-Bonus und Behutsamkeit, Erfahrung, optionale Tiefenschiefer-Variante, Weltgenerierung (Oberwelt/Nether/Ende, Adergröße, Häufigkeit, Höhe) über NeoForge-Biome-Modifier.
  - **Werkzeuge & Rüstung:** Schwert, Spitzhacke, Axt, Schaufel, Hacke sowie Rüstungssets mit Vorlagen wie Vanilla, Reparatur-Item und Platzhalter-Texturen für die getragene Rüstung.
- **Mod-Einstellungen:** Name, Version, Autor, Beschreibung, Lizenz, Logo und Kreativ-Tab (Name und Symbol).
- **Symbole:** Vanilla-Blöcke werden aus den echten Blockmodellen als 3D-Symbole gezeichnet – wie im Inventar, inklusive Zäunen, Mauern, Treppen und Gras-Einfärbung.- **Pixel-Editor:** 16×16 mit Stift, Radierer, Füllen, Pipette, Spiegeln, Rückgängig und PNG-Import. Vorschau als drehender 3D-Block bzw. als Item. Speichert automatisch.
- **Code:** eingebauter Monaco-Editor (offline) mit Dateibaum und Tabs, `Strg S` speichert.
- **Mods:** Modrinth-Suche für NeoForge und die Projektversion. Abhängigkeiten kommen automatisch mit, Downloads werden per SHA-512 geprüft. Vor jedem Start wird nach `run/mods` kopiert (nur, was Anvil Studio selbst dort abgelegt hat, wird wieder entfernt).
- **Konsole:** Gradle- und Spielausgabe, Probleme, Absturz-Report.
- **Java:** Temurin 21 wird mit Prüfsumme geladen und nach dem Entpacken getestet; eine beschädigte Installation lässt sich mit „Java reparieren“ neu laden. Downloads werden bei Abbrüchen fortgesetzt und fallen notfalls auf IPv4, `curl.exe` und den Windows-Dienst BITS zurück.
- **Import:** bestehende NeoForge-Projekte (ModDevGradle) per Ordnerauswahl übernehmen.

## Kompatibilität & Migration

- Programmdaten (`projects.json`, `settings.json`) haben eine Datenversion (`state.json`). Bei einem Update wird vor jeder Migration nach `backups/` gesichert.
- Projektdaten (`.anvil/content.json`, `.anvil/mods.json`) haben eine Schema-Version. Beim Öffnen werden ältere Formate migriert (Sicherung in `.anvil/backups/`). Haben sich die Vorlagen geändert, werden Blöcke und Items automatisch neu erzeugt.
- Der Workflow **Generator-Test** kompiliert erzeugten Code bei jeder Änderung am Generator gegen NeoForge 1.21.1, 1.21.4, 1.21.8 und 1.21.10 und startet anschließend einen Server, damit auch Loot-Tabellen, Rezepte, Tags und Weltgenerierung geprüft werden.

## Geplant

- Fabric und Forge als weitere Loader
- Hot-Swap (Code-Änderungen ohne Neustart)
- Minecraft-Version eines Projekts wechseln

## Entwickeln

Voraussetzungen: [Node.js](https://nodejs.org) ≥ 20, [Rust](https://rustup.rs) (stable) und unter Windows die [WebView2/MSVC-Voraussetzungen von Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # Entwicklungsmodus mit Hot-Reload
npm run tauri build    # Installer (.exe/.msi) in src-tauri/target/release/bundle
```

Tests für die Vorlagen-Anpassung (mit einem lokal heruntergeladenen MDK-Zip):

```bash
cd src-tauri
ANVIL_TEST_MDK=/pfad/zu/MDK-1.21.1-ModDevGradle-main.zip cargo test
```

Bei jedem Push auf `main` baut GitHub Actions den Windows-Installer (als Artefakt am Workflow-Lauf).

## Neue Version veröffentlichen

```bash
node scripts/version.mjs 0.3.0      # setzt die Version in allen Dateien
git commit -am "Version 0.3.0"
git push
```

Sobald auf `main` eine Version ankommt, für die es noch kein Release gibt, baut der Workflow den Installer und veröffentlicht ihn als Release `v0.3.0` im öffentlichen Repo `Basti032002/anvil-studio-releases`. Der Quellcode bleibt privat. Dafür braucht der Workflow das Secret `RELEASES_TOKEN`, ein Fine-grained Token mit „Contents: Read and write“ nur für das Release-Repo. Laufende Anvil-Studio-Installationen finden das Update dann von selbst. Versionen mit Bindestrich (z. B. `0.3.0-beta.1`) werden als Vorabversion veröffentlicht und nur angeboten, wenn „Vorabversionen“ in den Einstellungen aktiv ist.

## Aufbau

```
src/                 React + TypeScript Oberfläche
  views/             Projektliste, Neues Projekt, Arbeitsbereich
  store.ts           Logs & laufende Prozesse (bleiben beim Ansichtswechsel erhalten)
src-tauri/src/
  projects.rs        Projektliste (projects.json im App-Datenordner)
  java.rs            Temurin-Download & -Verwaltung
  template.rs        MDK laden, entpacken, umbenennen
  runner.rs          gradlew starten/stoppen, Ausgabe als Events streamen
  util.rs            IDE/Explorer öffnen, Jars & Crash-Reports finden
  settings.rs        Einstellungen (settings.json)
  updater.rs         GitHub-Releases prüfen, Installer laden & starten
```

Daten liegen unter `%APPDATA%\net.forgehost.anvilstudio` (Projektliste, Einstellungen, JDK). Projekte landen standardmäßig unter `Dokumente\Anvil Studio`.

## Hinweise

- Der **erste Testlauf dauert einige Minuten**, weil Gradle Minecraft und NeoForge herunterlädt und dekompiliert. Danach geht es schnell.
- Testläufe nutzen den Offline-Dev-Account von NeoForge, daher ist kein Microsoft-Login nötig.
- Für „Direkt in Welt“ muss die Welt existieren. Starte einmal über das Hauptmenü und lege sie mit dem eingestellten Namen an.
