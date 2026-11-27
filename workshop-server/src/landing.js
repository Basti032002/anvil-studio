// Öffentliche Startseite des Workshop-Servers (für Browser-Besucher und die Mojang-Prüfung).
// Zweisprachig (Englisch/Deutsch); Impressum erscheint, sobald IMPRINT_* gesetzt ist.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function imprint() {
  const name = process.env.IMPRINT_NAME;
  if (!name) return "";
  const addr = (process.env.IMPRINT_ADDRESS || "").split("|").map(esc).join("<br>");
  const mail = process.env.IMPRINT_EMAIL;
  return `<section id="imprint"><h2><span data-l="en">Legal notice</span><span data-l="de">Impressum</span></h2>
<p><span data-l="en">Responsible according to § 5 DDG:</span><span data-l="de">Angaben gemäß § 5 DDG:</span><br>${esc(name)}${addr ? "<br>" + addr : ""}${mail ? `<br><span data-l="en">Email</span><span data-l="de">E-Mail</span>: <a href="mailto:${esc(mail)}">${esc(mail)}</a>` : ""}</p></section>`;
}

export function landingPage({ stats, latest }) {
  const cards = latest.length
    ? latest
        .map(
          (it) => `<div class="card"><img src="/api/items/${esc(it.id)}/icon" alt="" onerror="this.style.visibility='hidden'">
<div><b>${esc(it.title)}</b><small>${esc(it.owner_name)} · MC ${esc(it.mc_version)}</small><p>${esc(it.summary)}</p></div></div>`,
        )
        .join("")
    : `<p class="muted"><span data-l="en">No projects published yet – be the first!</span><span data-l="de">Noch keine Projekte veröffentlicht – sei der Erste!</span></p>`;
  const contact = process.env.IMPRINT_EMAIL || process.env.CONTACT_EMAIL;

  return `<!DOCTYPE html><html lang="en" data-lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anvil Studio – Mod workshop</title>
<meta name="description" content="Anvil Studio is a free Windows tool for creating, testing and sharing NeoForge mods for Minecraft: Java Edition.">
<style>
:root{--bg:#0f1115;--panel:#171a21;--line:#262b35;--text:#e7e9ee;--muted:#9aa1ad;--accent:#f59e0b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
a{color:var(--accent)}main{max-width:960px;margin:0 auto;padding:0 24px 64px}
header{display:flex;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto;padding:20px 24px}
.logo{font-weight:700;font-size:18px;display:flex;gap:10px;align-items:center}.logo i{font-style:normal;background:var(--accent);color:#111;border-radius:8px;width:32px;height:32px;display:grid;place-items:center}
.lang button{background:none;border:1px solid var(--line);color:var(--muted);padding:4px 10px;border-radius:6px;cursor:pointer;font:inherit;font-size:13px}
.lang button.on{color:var(--text);border-color:var(--accent)}
.hero{padding:48px 0 32px}.hero h1{font-size:40px;line-height:1.15;margin:0 0 16px}.hero p{color:var(--muted);font-size:18px;max-width:640px;margin:0}
.stats{display:flex;gap:16px;margin:32px 0 8px;flex-wrap:wrap}.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 20px;min-width:160px}
.stat b{display:block;font-size:28px;color:var(--accent)}.stat span{color:var(--muted);font-size:14px}
.ok{display:inline-flex;gap:6px;align-items:center;color:#4ade80;font-size:14px;margin-top:16px}
section{margin-top:56px}h2{font-size:24px;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.two{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.feat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}.feat b{display:block;margin-bottom:6px}.feat p{margin:0;color:var(--muted);font-size:15px}
.card{display:flex;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.card img{width:56px;height:56px;border-radius:8px;image-rendering:pixelated;background:#222;flex:none}.card small{display:block;color:var(--muted)}.card p{margin:4px 0 0;color:var(--muted);font-size:14px}
.muted{color:var(--muted)}ul{padding-left:20px}li{margin:6px 0}
.privacy{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px}.privacy p,.privacy li{color:#c9ced8}
footer{max-width:960px;margin:0 auto;padding:24px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
html[data-lang=en] [data-l=de],html[data-lang=de] [data-l=en]{display:none}
</style></head><body>
<header><div class="logo"><i>⚒</i>Anvil Studio</div>
<div class="lang"><button data-set="en">EN</button> <button data-set="de">DE</button></div></header>
<main>
<div class="hero">
<h1><span data-l="en">Create, test and share Minecraft mods – without writing code.</span><span data-l="de">Minecraft-Mods erstellen, testen und teilen – ohne Code zu schreiben.</span></h1>
<p><span data-l="en">Anvil Studio is a free, non-commercial Windows app for building NeoForge mods for Minecraft: Java Edition. This server hosts its community workshop, where creators publish their mods and source code.</span><span data-l="de">Anvil Studio ist eine kostenlose, nicht-kommerzielle Windows-App, mit der man NeoForge-Mods für Minecraft: Java Edition baut. Dieser Server betreibt den Community-Workshop, in dem Creator ihre Mods und Quellcodes veröffentlichen.</span></p>
<div class="stats">
<div class="stat"><b>${stats.items}</b><span><span data-l="en">published projects</span><span data-l="de">veröffentlichte Projekte</span></span></div>
<div class="stat"><b>${stats.creators}</b><span><span data-l="en">creators</span><span data-l="de">Creator</span></span></div>
<div class="stat"><b>${stats.downloads}</b><span><span data-l="en">downloads</span><span data-l="de">Downloads</span></span></div>
</div>
<div class="ok">● <span data-l="en">Workshop server online</span><span data-l="de">Workshop-Server online</span></div>
</div>

<section><h2><span data-l="en">What Anvil Studio does</span><span data-l="de">Was Anvil Studio kann</span></h2><div class="grid two">
<div class="feat"><b><span data-l="en">Visual mod editor</span><span data-l="de">Visueller Mod-Editor</span></b><p><span data-l="en">Blocks, items, recipes, mobs, custom dimensions and a 3D model editor – logic is built with node-based blueprints.</span><span data-l="de">Blöcke, Items, Rezepte, Mobs, eigene Dimensionen und ein 3D-Modell-Editor – Logik entsteht mit Node-Blueprints.</span></p></div>
<div class="feat"><b><span data-l="en">One-click testing</span><span data-l="de">Testen per Klick</span></b><p><span data-l="en">Builds the mod with Gradle and starts a test client or server, with hot reload for quick iteration.</span><span data-l="de">Baut die Mod mit Gradle und startet einen Test-Client oder -Server, mit Hot Reload für schnelles Ausprobieren.</span></p></div>
<div class="feat"><b><span data-l="en">Community workshop</span><span data-l="de">Community-Workshop</span></b><p><span data-l="en">Share finished mods with images and trailers, or publish the source so others can learn from it and remix it.</span><span data-l="de">Fertige Mods mit Bildern und Trailern teilen oder den Quellcode veröffentlichen, damit andere davon lernen und weiterbauen.</span></p></div>
<div class="feat"><b><span data-l="en">Download &amp; play</span><span data-l="de">Herunterladen &amp; spielen</span></b><p><span data-l="en">Workshop mods can be launched directly in their own Minecraft instance using the player's own licensed Minecraft account.</span><span data-l="de">Workshop-Mods starten direkt in einer eigenen Minecraft-Instanz – mit dem eigenen, gekauften Minecraft-Konto.</span></p></div>
</div></section>

<section><h2><span data-l="en">Latest projects</span><span data-l="de">Neueste Projekte</span></h2><div class="grid">${cards}</div>
<p class="muted"><span data-l="en">Browsing, downloading and playing happen inside the Anvil Studio app.</span><span data-l="de">Stöbern, Herunterladen und Spielen geht in der Anvil-Studio-App.</span></p></section>

<section id="privacy"><h2><span data-l="en">Sign-in &amp; privacy</span><span data-l="de">Anmeldung &amp; Datenschutz</span></h2><div class="privacy">
<div data-l="en">
<p>Anvil Studio signs users in with their Microsoft account using the official device code flow. The app never sees the account password.</p>
<ul>
<li>To use Anvil Studio you create an account with email and password. The server stores the email address, an optional display name, the password only as a salted scrypt hash, the time of registration and last sign-in, and a session (valid for 180 days). The email address is used only for the confirmation code and password resets. You can delete the account at any time in Anvil Studio (Settings → Account).</li>
<li>The Microsoft, Xbox Live and Minecraft tokens stay on the user's PC. The refresh token is stored in the Windows Credential Manager.</li>
<li>The Minecraft access token is used to launch the game and, once per sign-in, sent to this workshop server only to verify the Minecraft name and UUID with Mojang. The server does not store it.</li>
<li>The workshop server stores: Minecraft name and UUID, a workshop session (valid for 30 days), uploaded projects with their files, images and descriptions, reports and anonymous daily download counts.</li>
<li>Technical server logs (including IP addresses) are kept only briefly for operation and security. Traffic passes through Cloudflare.</li>
<li>No data is sold or shared with third parties. No tracking, no ads.</li>
<li>Users can delete their own uploads at any time in the app. To delete your account data entirely, contact us${contact ? ` at <a href="mailto:${esc(contact)}">${esc(contact)}</a>` : ""}.</li>
</ul></div>
<div data-l="de">
<p>Anvil Studio meldet Nutzer über den offiziellen Microsoft-Gerätecode-Ablauf mit ihrem Microsoft-Konto an. Das Passwort sieht die App nie.</p>
<ul>
<li>Für Anvil Studio legst du ein Konto mit E-Mail und Passwort an. Der Server speichert die E-Mail-Adresse, einen freiwilligen Anzeigenamen, das Passwort nur als gesalzenen scrypt-Hash, Zeitpunkt der Registrierung und letzten Anmeldung sowie eine Sitzung (180 Tage gültig). Die E-Mail-Adresse wird nur für den Bestätigungscode und zum Zurücksetzen des Passworts genutzt. Das Konto lässt sich jederzeit in Anvil Studio löschen (Einstellungen → Konto).</li>
<li>Die Microsoft-, Xbox-Live- und Minecraft-Tokens bleiben auf dem PC des Nutzers, das Refresh-Token in der Windows-Anmeldeinformationsverwaltung.</li>
<li>Das Minecraft-Token dient zum Starten des Spiels und wird pro Anmeldung einmal an diesen Workshop-Server geschickt, nur um Minecraft-Name und UUID bei Mojang zu prüfen. Der Server speichert es nicht.</li>
<li>Der Workshop-Server speichert: Minecraft-Name und UUID, eine Workshop-Sitzung (30 Tage gültig), hochgeladene Projekte mit Dateien, Bildern und Beschreibungen, Meldungen sowie anonyme tägliche Download-Zahlen.</li>
<li>Technische Server-Logs (inklusive IP-Adressen) werden nur kurz für Betrieb und Sicherheit aufbewahrt. Der Datenverkehr läuft über Cloudflare.</li>
<li>Keine Weitergabe oder Verkauf von Daten. Kein Tracking, keine Werbung.</li>
<li>Eigene Uploads lassen sich jederzeit in der App löschen. Für die vollständige Löschung deiner Daten melde dich bei uns${contact ? ` unter <a href="mailto:${esc(contact)}">${esc(contact)}</a>` : ""}.</li>
</ul></div>
</div></section>
${imprint()}
</main>
<footer><span data-l="en">Anvil Studio is a fan project and is not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Synergies AB.</span><span data-l="de">Anvil Studio ist ein Fanprojekt und steht in keiner Verbindung zu Mojang Studios oder Microsoft. Minecraft ist eine Marke von Mojang Synergies AB.</span>
 · <a href="#privacy"><span data-l="en">Privacy</span><span data-l="de">Datenschutz</span></a>${process.env.IMPRINT_NAME ? ` · <a href="#imprint"><span data-l="en">Legal notice</span><span data-l="de">Impressum</span></a>` : ""}</footer>
<script>
(function(){var h=document.documentElement,k="lang",l;
try{l=localStorage.getItem(k)}catch(e){}
if(!l)l=(navigator.language||"en").toLowerCase().startsWith("de")?"de":"en";
function set(x){h.dataset.lang=x;h.lang=x;document.querySelectorAll("[data-set]").forEach(function(b){b.classList.toggle("on",b.dataset.set===x)});try{localStorage.setItem(k,x)}catch(e){}}
document.querySelectorAll("[data-set]").forEach(function(b){b.onclick=function(){set(b.dataset.set)}});set(l)})();
</script></body></html>`;
}
