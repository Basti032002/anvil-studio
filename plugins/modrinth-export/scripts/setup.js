// Projekt auf Modrinth verbinden. Der Zugangsschlüssel wird sicher in Windows gespeichert.
export default async function (anvil) {
  const data = (await anvil.content.data()) || {};
  const hasToken = !!(await anvil.secrets.get("token"));
  const v = await anvil.ui.prompt("Modrinth verbinden", [
    { key: "project", label: "Projekt auf Modrinth (ID oder Slug aus der Adresse)", def: data.slug || "" },
    {
      key: "token",
      label: hasToken ? "Zugangsschlüssel (leer lassen = gespeicherten behalten)" : "Zugangsschlüssel – modrinth.com → Einstellungen → PATs, Recht „Create versions“",
      type: "password",
      def: "",
    },
    { key: "channel", label: "Kanal für neue Versionen", type: "select", def: data.channel || "release", options: [["release", "Release"], ["beta", "Beta"], ["alpha", "Alpha"]] },
    { key: "ask", label: "Nach jedem Bauen fragen, ob hochgeladen werden soll", type: "bool", def: data.ask === false ? "false" : "true" },
  ]);
  if (!v) return;
  if (!v.project.trim()) return anvil.ui.toast("Bitte ein Projekt angeben.", "error");
  if (v.token.trim()) await anvil.secrets.set("token", v.token.trim());
  const r = await anvil.net.fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(v.project.trim())}`);
  if (r.status !== 200) return anvil.ui.toast(`Projekt „${v.project}“ wurde auf Modrinth nicht gefunden.`, "error");
  const p = JSON.parse(r.text);
  await anvil.content.setData({ project: p.id, slug: p.slug, title: p.title, channel: v.channel, ask: v.ask === "true" });
  await anvil.ui.toast(`Verbunden mit „${p.title}“ – zum Übernehmen das Projekt speichern.`, "success");
}
