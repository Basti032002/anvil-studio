# Anvil Studio – Workshop-Server

Kleiner Dienst für den Workshop in Anvil Studio: fertige Mods und Quellcode hochladen,
prüfen, sperren und herunterladen. Anmeldung mit dem Minecraft-Konto – der Server prüft das
Token direkt bei Mojang (`api.minecraftservices.com`), Passwörter sieht er nie.

## Starten

```bash
docker volume create workshop-data   # optional, compose legt es sonst selbst an
docker compose up -d --build
```

Der Dienst lauscht auf `127.0.0.1:8787`. Davor gehört ein Reverse-Proxy mit HTTPS, z. B. Caddy:

```
workshop.forge-host.net {
    request_body {
        max_size 200MB
    }
    reverse_proxy 127.0.0.1:8787
}
```

In Anvil Studio unter **Einstellungen → Workshop** die Adresse eintragen
(Standard: `https://workshop.forge-host.net`).

## Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung |
| --- | --- |
| `ADMIN_NAMES` | Minecraft-Namen der Admins, mit Komma getrennt |
| `ADMIN_UUIDS` | alternativ Minecraft-UUIDs (sicherer, Namen können sich ändern) |
| `DATA_DIR` | Speicherort für Datenbank und Dateien (im Container `/data`) |
| `PORT` | Port (Standard 8787) |

Ob neue Mods und neuer Quellcode erst freigegeben werden müssen, stellst du in Anvil Studio
unter **Admin → Workshop** ein.

## Sicherung

Alles liegt im Volume `workshop-data` (`workshop.db` + Ordner `files/`).

## Test

```bash
npm install && npm test
```
