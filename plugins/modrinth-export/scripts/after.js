// Die zuletzt gebaute Mod-Datei als neue Version zu Modrinth hochladen
async function upload(anvil) {
  const data = (await anvil.content.data()) || {};
  if (!data.project) return anvil.ui.toast("Erst „Modrinth: Projekt verbinden“ ausführen.", "error");
  const token = await anvil.secrets.get("token");
  if (!token) return anvil.ui.toast("Kein Zugangsschlüssel gespeichert – „Modrinth: Projekt verbinden“ ausführen.", "error");
  let jar;
  try {
    jar = await anvil.export.jar();
  } catch (e) {
    return anvil.ui.toast("Noch keine Mod-Datei gebaut. Erst unter „Export“ bauen.", "error");
  }
  const guess = (jar.name.match(/-(\d[\w.+]*)\.jar$/) || [])[1] || "1.0.0";
  const v = await anvil.ui.prompt(`„${jar.name}“ zu „${data.title}“ hochladen`, [
    { key: "version", label: "Versionsnummer", def: guess },
    { key: "name", label: "Name der Version", def: `${anvil.project.name} ${guess}` },
    { key: "channel", label: "Kanal", type: "select", def: data.channel || "release", options: [["release", "Release"], ["beta", "Beta"], ["alpha", "Alpha"]] },
    { key: "changelog", label: "Änderungen (Markdown)", type: "textarea", def: "" },
  ]);
  if (!v) return;
  const meta = {
    project_id: data.project,
    version_number: v.version.trim(),
    name: v.name.trim() || v.version.trim(),
    changelog: v.changelog,
    version_type: v.channel,
    game_versions: [anvil.project.mcVersion],
    loaders: ["neoforge"],
    featured: true,
    status: "listed",
    dependencies: [],
    file_parts: ["file"],
    primary_file: "file",
  };
  await anvil.ui.toast("Lade zu Modrinth hoch …");
  const r = await anvil.net.fetch("https://api.modrinth.com/v2/version", {
    method: "POST",
    headers: { Authorization: token },
    multipart: [
      { name: "data", text: JSON.stringify(meta), contentType: "application/json" },
      { name: "file", base64: jar.base64, filename: jar.name, contentType: "application/java-archive" },
    ],
  });
  if (r.status >= 200 && r.status < 300) {
    const ver = JSON.parse(r.text);
    return anvil.ui.toast(`Version ${ver.version_number} ist jetzt auf Modrinth.`, "success");
  }
  let msg = r.text.slice(0, 200);
  try {
    msg = JSON.parse(r.text).description || msg;
  } catch (e) {}
  if (r.status === 401) msg = "Der Zugangsschlüssel ist ungültig oder hat nicht das Recht „Create versions“.";
  await anvil.ui.toast(`Hochladen fehlgeschlagen (${r.status}): ${msg}`, "error");
}

// Läuft nach jedem erfolgreichen Bauen
export default async function (anvil) {
  const data = (await anvil.content.data()) || {};
  if (!data.project || data.ask === false) return;
  const ok = await anvil.ui.confirm("Zu Modrinth hochladen?", `Die neue Mod-Datei als Version von „${data.title}“ veröffentlichen.`);
  if (ok) await upload(anvil);
}
