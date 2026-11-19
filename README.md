# Anvil Studio

Ein Windows-Launcher zum **Erstellen, Bauen und Testen von Minecraft-Mods**. Projekt anlegen, auf **▶ Testen** klicken und Minecraft startet mit deiner Mod.

> Version 0.2 · NeoForge · Minecraft 1.21.1 / 1.21.4 / 1.21.8 / 1.21.10

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
- **Automatische Updates:** Anvil Studio sucht auf GitHub-Releases nach neuen Versionen (bei jedem Start, täglich, wöchentlich oder nur manuell). Es lädt den Installer, prüft die SHA-256-Prüfsumme, installiert und startet neu. Läuft gerade ein Spiel oder Build, wartet es damit.

## Geplant (Phase 2)

- Blöcke und Items per Formular anlegen (erzeugt Java + JSON)
- Pixel-Editor für 16×16-Texturen
- Andere Mods (z. B. JEI) zum Testen automatisch mitladen
- Eingebauter Code-Editor (Monaco)
- Fabric und Forge als weitere Loader
- Hot-Swap (Code-Änderungen ohne Neustart)

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
git tag v0.3.0
git push --follow-tags
```

Der Tag löst den Workflow aus. Der baut den Installer und erstellt das GitHub-Release, und laufende Anvil-Studio-Installationen finden das Update dann von selbst. Tags mit Bindestrich (z. B. `v0.3.0-beta.1`) werden als Vorabversion veröffentlicht und nur angeboten, wenn „Vorabversionen“ in den Einstellungen aktiv ist.

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
