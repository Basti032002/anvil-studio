# Umbau Arbeitsbereich (ab 0.5.0-dev.14)

Entwürfe: https://claude.ai/artifact/E4KzmzL67uww4FrnFPhwLK

Entscheidungen (Nov. 2026):
- Weltgenerierung: Baukasten als Standard **und** Knoten-Modus für Experten (Gelände-Formel)
- Localization: Deutsch + Englisch fest, alle Minecraft-Sprachen hinzufügbar
- Blueprints: Logik & Schleifen, mehr Ereignisse, mehr Aktionen, Variablen & Funktionen
- Jede Etappe wird einzeln als Dev-Release veröffentlicht

Wenn die Arbeit unterbrochen wird: in diesem Plan steht, was fertig ist. Mit der
nächsten offenen Etappe weitermachen.

## Etappen

1. [x] **Inhalte-Tab** (0.5.0-dev.14): eine Liste mit einklappbaren Gruppen, ein einziges Plus,
   Erstellen-Fenster mit „Alle“ + Suche (Strg+N), Übersicht mit Kacheln und „Noch offen“
2. [x] **Editoren mit Unterreitern** (0.5.0-dev.15): Block, Item, Kreatur, Dimension – Kopf mit Name/ID,
   Reiter (Allgemein, Aussehen, Funktion, Abbau & Drops, Rezept, Formen …), Vorschau rechts
3. [x] **Localization-Tab** (0.5.0-dev.16) (oben in der Leiste): alle Texte der Mod in einer Tabelle,
   Sprachen hinzufügen (alle MC-Sprachen), Filter „nur fehlende“, Import/Export JSON
4. [x] **Blueprints** (0.5.0-dev.17): Wenn/Sonst, UND/ODER/NICHT, Vergleich, Schleifen (n-mal, für jeden
   Spieler/Mob, solange), Warten, Variablen (Welt / pro Spieler), Mathe, eigene Funktionen,
   neue Ereignisse (Block abgebaut/platziert, Mob getötet, Tod, Sprung, Dimension, Item benutzt,
   Timer, Chat-Befehl) und Aktionen (Block setzen, Bereich füllen, Mob spawnen, Explosion,
   Partikel, Sound, Bossleiste, Scoreboard, Item geben/nehmen, Titel, Teleport, Befehl)
5. [ ] **Weltgenerierung – Vorlagen & Baukasten**: Vorlagen Overworld/Nether/End/eigene (+ weitere),
   Schritte Gelände, Schichten & Blöcke, Biome, Höhlen & Schluchten, Erze, schwebende Inseln,
   Strukturen & Pflanzen, Flüssigkeiten, Himmel & Licht, Kreaturen; Live-Vorschau (Karte + Querschnitt)
6. [ ] **Weltgenerierung – Knoten-Modus**: Gelände-Dichte aus Rauschen, Kurven, Mathe, Y-Verlauf
