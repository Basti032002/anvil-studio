//! Eigene Strukturen: im Spiel mit dem Strukturblock gespeichert (.nbt), im Editor
//! übernommen und als Jigsaw-Struktur in die Weltgenerierung eingebaut.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct StructPiece {
    /// Vorlage unter data/<modid>/structure/, z. B. "haus" oder "haus/turm"
    pub template: String,
    /// Pool, in den das Teil kommt ("" = Start)
    pub pool: String,
    pub weight: u32,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct StructDef {
    pub id: String,
    pub name_en: String,
    pub name_de: String,
    pub pieces: Vec<StructPiece>,
    /// In der Oberwelt automatisch generieren
    pub overworld: bool,
    /// Nur in diesen Vanilla-Biomen (leer = alle Oberwelt-Biome)
    pub biomes: Vec<String>,
    /// "surface" | "underground" | "sky"
    pub placement: String,
    /// Oberfläche: Versatz zur Oberfläche, sonst feste Y-Höhe
    pub y: i32,
    /// Etwa alle N Chunks
    pub spacing: u32,
    pub separation: u32,
    /// Wie viele Teile hintereinander angebaut werden (Verbundblöcke)
    pub depth: u32,
    /// "none" | "beard_thin" | "beard_box" | "bury" | "encapsulate"
    pub adapt: String,
}

// ---- NBT lesen ---------------------------------------------------------------------

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StructInfo {
    pub size: [i32; 3],
    pub blocks: usize,
    /// Blöcke ohne Luft, häufigste zuerst
    pub palette: Vec<(String, usize)>,
    /// Ziel-Pools der Verbundblöcke (Jigsaw)
    pub pools: Vec<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
enum Tag {
    End,
    Num(f64),
    Bytes(usize),
    Str(String),
    List(Vec<Tag>),
    Compound(Vec<(String, Tag)>),
    Ints(Vec<i32>),
}

struct Rd<'a> {
    b: &'a [u8],
    i: usize,
}

impl Rd<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        if self.i + n > self.b.len() {
            return Err("NBT-Datei ist unvollständig".into());
        }
        let s = &self.b[self.i..self.i + n];
        self.i += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }
    fn i16(&mut self) -> Result<i16, String> {
        let s = self.take(2)?;
        Ok(i16::from_be_bytes([s[0], s[1]]))
    }
    fn i32(&mut self) -> Result<i32, String> {
        let s = self.take(4)?;
        Ok(i32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn string(&mut self) -> Result<String, String> {
        let n = self.i16()? as u16 as usize;
        Ok(String::from_utf8_lossy(self.take(n)?).into_owned())
    }
    fn tag(&mut self, ty: u8, depth: usize) -> Result<Tag, String> {
        if depth > 64 {
            return Err("NBT zu tief verschachtelt".into());
        }
        Ok(match ty {
            0 => Tag::End,
            1 => Tag::Num(self.u8()? as i8 as f64),
            2 => Tag::Num(self.i16()? as f64),
            3 => Tag::Num(self.i32()? as f64),
            4 => {
                let s = self.take(8)?;
                Tag::Num(i64::from_be_bytes(s.try_into().unwrap()) as f64)
            }
            5 => {
                let s = self.take(4)?;
                Tag::Num(f32::from_be_bytes(s.try_into().unwrap()) as f64)
            }
            6 => {
                let s = self.take(8)?;
                Tag::Num(f64::from_be_bytes(s.try_into().unwrap()))
            }
            7 => {
                let n = self.i32()?.max(0) as usize;
                self.take(n)?;
                Tag::Bytes(n)
            }
            8 => Tag::Str(self.string()?),
            9 => {
                let inner = self.u8()?;
                let n = self.i32()?.max(0) as usize;
                let mut v = Vec::with_capacity(n.min(65536));
                for _ in 0..n {
                    v.push(self.tag(inner, depth + 1)?);
                }
                Tag::List(v)
            }
            10 => {
                let mut v = vec![];
                loop {
                    let t = self.u8()?;
                    if t == 0 {
                        break;
                    }
                    let name = self.string()?;
                    v.push((name, self.tag(t, depth + 1)?));
                }
                Tag::Compound(v)
            }
            11 => {
                let n = self.i32()?.max(0) as usize;
                let mut v = Vec::with_capacity(n.min(65536));
                for _ in 0..n {
                    v.push(self.i32()?);
                }
                Tag::Ints(v)
            }
            12 => {
                let n = self.i32()?.max(0) as usize;
                self.take(n * 8)?;
                Tag::Bytes(n * 8)
            }
            _ => return Err(format!("Unbekannter NBT-Typ {ty}")),
        })
    }
}

impl Tag {
    fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(v) => v.iter().find(|(k, _)| k == key).map(|(_, t)| t),
            _ => None,
        }
    }
    fn num(&self) -> Option<f64> {
        if let Tag::Num(n) = self { Some(*n) } else { None }
    }
    fn str(&self) -> Option<&str> {
        if let Tag::Str(s) = self { Some(s) } else { None }
    }
    fn list(&self) -> &[Tag] {
        if let Tag::List(v) = self { v } else { &[] }
    }
}

pub fn read_info(path: &Path) -> Result<StructInfo, String> {
    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut data = vec![];
    if raw.starts_with(&[0x1f, 0x8b]) {
        flate2::read::GzDecoder::new(&raw[..]).read_to_end(&mut data).map_err(|e| format!("Strukturdatei lässt sich nicht entpacken: {e}"))?;
    } else {
        data = raw;
    }
    let mut r = Rd { b: &data, i: 0 };
    let ty = r.u8()?;
    if ty != 10 {
        return Err("Keine Strukturdatei".into());
    }
    r.string()?;
    let root = r.tag(10, 0)?;
    let mut info = StructInfo::default();
    if let Some(Tag::List(s)) = root.get("size") {
        for (i, v) in s.iter().take(3).enumerate() {
            info.size[i] = v.num().unwrap_or(0.0) as i32;
        }
    }
    let palette: Vec<String> = root
        .get("palette")
        .or_else(|| root.get("palettes").and_then(|p| p.list().first()))
        .map(|p| p.list().iter().map(|s| s.get("Name").and_then(|n| n.str()).unwrap_or("?").to_string()).collect())
        .unwrap_or_default();
    let mut counts = vec![0usize; palette.len()];
    let mut pools = vec![];
    if let Some(blocks) = root.get("blocks") {
        for b in blocks.list() {
            let st = b.get("state").and_then(|s| s.num()).unwrap_or(-1.0) as i64;
            if st >= 0 && (st as usize) < counts.len() {
                counts[st as usize] += 1;
            }
            if let Some(pool) = b.get("nbt").and_then(|n| n.get("pool")).and_then(|p| p.str()) {
                if pool != "minecraft:empty" && !pools.iter().any(|x| x == pool) {
                    pools.push(pool.to_string());
                }
            }
        }
    }
    let mut pal: Vec<(String, usize)> = palette.into_iter().zip(counts).filter(|(n, c)| *c > 0 && !n.ends_with(":air") && n != "minecraft:structure_void").collect();
    pal.sort_by(|a, b| b.1.cmp(&a.1));
    info.blocks = pal.iter().map(|(_, c)| c).sum();
    info.palette = pal.into_iter().take(12).collect();
    info.pools = pools;
    Ok(info)
}

// ---- Suchen und übernehmen ---------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FoundStructure {
    /// Name wie im Strukturblock, z. B. "minecraft:haus" oder "traumwelt:turm"
    pub name: String,
    /// Kurzname zum Übernehmen
    pub short: String,
    pub world: String,
    pub file: String,
    pub modified: u64,
    pub info: Option<StructInfo>,
    pub error: Option<String>,
}

fn modified_ms(p: &Path) -> u64 {
    p.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Im Testspiel gespeicherte Strukturen: run/saves/<Welt>/generated/<ns>/structure(s)/…/<name>.nbt
pub fn scan(root: &Path) -> Vec<FoundStructure> {
    let mut out = vec![];
    let saves = root.join("run").join("saves");
    let Ok(worlds) = std::fs::read_dir(&saves) else { return out };
    for w in worlds.flatten() {
        let gen = w.path().join("generated");
        let Ok(nss) = std::fs::read_dir(&gen) else { continue };
        for ns in nss.flatten() {
            let nsname = ns.file_name().to_string_lossy().to_string();
            for sub in ["structure", "structures"] {
                let dir = ns.path().join(sub);
                for e in walkdir::WalkDir::new(&dir).into_iter().flatten() {
                    let p = e.path();
                    if p.extension().and_then(|x| x.to_str()) != Some("nbt") {
                        continue;
                    }
                    let rel = p.strip_prefix(&dir).unwrap_or(p).with_extension("").to_string_lossy().replace('\\', "/");
                    let (info, error) = match read_info(p) {
                        Ok(i) => (Some(i), None),
                        Err(e) => (None, Some(e)),
                    };
                    out.push(FoundStructure {
                        name: format!("{nsname}:{rel}"),
                        short: rel.clone(),
                        world: w.file_name().to_string_lossy().to_string(),
                        file: p.to_string_lossy().to_string(),
                        modified: modified_ms(p),
                        info,
                        error,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

pub fn template_dir(root: &Path, modid: &str) -> PathBuf {
    root.join("src/main/resources/data").join(modid).join("structure")
}

/// Schon übernommene Vorlagen im Projekt
pub fn imported(root: &Path, modid: &str) -> Vec<FoundStructure> {
    let dir = template_dir(root, modid);
    let mut out = vec![];
    for e in walkdir::WalkDir::new(&dir).into_iter().flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("nbt") {
            continue;
        }
        let rel = p.strip_prefix(&dir).unwrap_or(p).with_extension("").to_string_lossy().replace('\\', "/");
        let (info, error) = match read_info(p) {
            Ok(i) => (Some(i), None),
            Err(e) => (None, Some(e)),
        };
        out.push(FoundStructure { name: format!("{modid}:{rel}"), short: rel, world: String::new(), file: p.to_string_lossy().to_string(), modified: modified_ms(p), info, error });
    }
    out.sort_by(|a, b| a.short.cmp(&b.short));
    out
}

pub fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 120 && s.split('/').all(|seg| !seg.is_empty() && seg != "." && seg != ".." && seg.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.')))
}

pub fn import(root: &Path, modid: &str, file: &Path, name: &str) -> Result<StructInfo, String> {
    if !valid_name(name) {
        return Err(format!("„{name}“ ist kein gültiger Name (Kleinbuchstaben, Ziffern, _ - . und /)."));
    }
    let info = read_info(file)?;
    let dest = template_dir(root, modid).join(format!("{name}.nbt"));
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(file, &dest).map_err(|e| e.to_string())?;
    Ok(info)
}

// ---- Weltgenerierung -------------------------------------------------------------

fn full(modid: &str, s: &str) -> String {
    if s.contains(':') { s.to_string() } else { format!("{modid}:{s}") }
}

/// (Pfad relativ zu data/<modid>/, Inhalt). `extra_biomes`: eigene Biome aus Dimensionen.
pub fn files(s: &StructDef, modid: &str, extra_biomes: &[String]) -> Vec<(String, Value)> {
    let mut out = vec![];
    let id = &s.id;
    let pieces: Vec<&StructPiece> = s.pieces.iter().filter(|p| valid_name(p.template.trim())).collect();
    if pieces.is_empty() {
        return out;
    }
    let element = |p: &StructPiece| {
        json!({ "weight": p.weight.clamp(1, 150), "element": {
            "element_type": "minecraft:single_pool_element",
            "location": full(modid, p.template.trim()),
            "projection": "rigid",
            "processors": "minecraft:empty"
        }})
    };
    // Start-Pool: Teile ohne Pool, sonst das erste Teil
    let mut start: Vec<Value> = pieces.iter().filter(|p| p.pool.trim().is_empty()).map(|p| element(p)).collect();
    if start.is_empty() {
        start.push(element(pieces[0]));
    }
    out.push((format!("worldgen/template_pool/{id}/start.json"), json!({ "fallback": "minecraft:empty", "elements": start })));
    // Weitere Pools (für Verbundblöcke) – nur im eigenen Namensraum
    let mut pools: Vec<String> = pieces.iter().map(|p| p.pool.trim().to_string()).filter(|p| !p.is_empty()).collect();
    pools.sort();
    pools.dedup();
    for pool in pools {
        let f = full(modid, &pool);
        let Some(path) = f.strip_prefix(&format!("{modid}:")) else { continue };
        if !valid_name(path) || path == format!("{id}/start") {
            continue;
        }
        let elements: Vec<Value> = pieces.iter().filter(|p| full(modid, p.pool.trim()) == f).map(|p| element(p)).collect();
        out.push((format!("worldgen/template_pool/{path}.json"), json!({ "fallback": "minecraft:empty", "elements": elements })));
    }
    // Struktur
    let (start_height, heightmap, step) = match s.placement.as_str() {
        "underground" => (json!({ "absolute": s.y }), None, "underground_structures"),
        "sky" => (json!({ "absolute": s.y }), None, "surface_structures"),
        _ => (json!({ "absolute": s.y }), Some("WORLD_SURFACE_WG"), "surface_structures"),
    };
    let adapt = match s.adapt.as_str() {
        "none" | "beard_thin" | "beard_box" | "bury" | "encapsulate" => s.adapt.as_str(),
        _ => {
            if s.placement == "surface" || s.placement.is_empty() {
                "beard_thin"
            } else {
                "none"
            }
        }
    };
    let mut st = json!({
        "type": "minecraft:jigsaw",
        "biomes": format!("#{modid}:has_structure/{id}"),
        "step": step,
        "spawn_overrides": {},
        "terrain_adaptation": adapt,
        "start_pool": format!("{modid}:{id}/start"),
        "size": s.depth.clamp(1, 20),
        "start_height": start_height,
        "max_distance_from_center": 80,
        "use_expansion_hack": false
    });
    if let Some(h) = heightmap {
        st["project_start_to_heightmap"] = json!(h);
    }
    out.push((format!("worldgen/structure/{id}.json"), st));
    // Verteilung
    let spacing = s.spacing.clamp(2, 4096);
    let separation = s.separation.min(spacing - 1).max(1);
    let salt = id.bytes().fold(14357617u32, |h, b| h.wrapping_mul(31).wrapping_add(b as u32)) & 0x7fff_ffff;
    out.push((
        format!("worldgen/structure_set/{id}.json"),
        json!({ "structures": [{ "structure": format!("{modid}:{id}"), "weight": 1 }],
            "placement": { "type": "minecraft:random_spread", "spacing": spacing, "separation": separation, "salt": salt } }),
    ));
    // Biome
    let mut values: Vec<String> = vec![];
    if s.overworld {
        if s.biomes.is_empty() {
            values.push("#minecraft:is_overworld".into());
        } else {
            values.extend(s.biomes.iter().map(|b| full("minecraft", b.trim())));
        }
    }
    values.extend(extra_biomes.iter().cloned());
    out.push((format!("tags/worldgen/biome/has_structure/{id}.json"), json!({ "replace": false, "values": values })));
    out
}

/// Kleine gültige Strukturdatei (3×3×3, Bruchstein-Rahmen) für Tests
#[cfg(test)]
pub fn sample_nbt() -> Vec<u8> {
    fn s(b: &mut Vec<u8>, x: &str) {
        b.extend((x.len() as u16).to_be_bytes());
        b.extend(x.as_bytes());
    }
    let mut b = vec![10u8];
    s(&mut b, "");
    b.push(3);
    s(&mut b, "DataVersion");
    b.extend(3955i32.to_be_bytes());
    b.push(9);
    s(&mut b, "size");
    b.push(3);
    b.extend(3i32.to_be_bytes());
    for v in [3i32, 3, 3] {
        b.extend(v.to_be_bytes());
    }
    b.push(9);
    s(&mut b, "palette");
    b.push(10);
    b.extend(2i32.to_be_bytes());
    for n in ["minecraft:cobblestone", "minecraft:air"] {
        b.push(8);
        s(&mut b, "Name");
        s(&mut b, n);
        b.push(0);
    }
    b.push(9);
    s(&mut b, "blocks");
    b.push(10);
    b.extend(27i32.to_be_bytes());
    for x in 0..3 {
        for y in 0..3 {
            for z in 0..3 {
                b.push(9);
                s(&mut b, "pos");
                b.push(3);
                b.extend(3i32.to_be_bytes());
                for v in [x, y, z] {
                    b.extend((v as i32).to_be_bytes());
                }
                b.push(3);
                s(&mut b, "state");
                let edge = [x, y, z].iter().filter(|v| **v == 0 || **v == 2).count() >= 2;
                b.extend((if edge { 0i32 } else { 1 }).to_be_bytes());
                b.push(0);
            }
        }
    }
    b.push(9);
    s(&mut b, "entities");
    b.push(10);
    b.extend(0i32.to_be_bytes());
    b.push(0);
    let mut gz = flate2::write::GzEncoder::new(vec![], flate2::Compression::default());
    std::io::Write::write_all(&mut gz, &b).unwrap();
    gz.finish().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_structure_nbt() {
        // kleine Struktur von Hand: size [2,1,1], palette [stone, jigsaw], blocks mit Pool
        fn s(b: &mut Vec<u8>, x: &str) {
            b.extend((x.len() as u16).to_be_bytes());
            b.extend(x.as_bytes());
        }
        let mut b = vec![10u8];
        s(&mut b, "");
        b.push(9);
        s(&mut b, "size");
        b.push(3);
        b.extend(3i32.to_be_bytes());
        for v in [2i32, 1, 1] {
            b.extend(v.to_be_bytes());
        }
        b.push(9);
        s(&mut b, "palette");
        b.push(10);
        b.extend(2i32.to_be_bytes());
        for n in ["minecraft:stone", "minecraft:jigsaw"] {
            b.push(8);
            s(&mut b, "Name");
            s(&mut b, n);
            b.push(0);
        }
        b.push(9);
        s(&mut b, "blocks");
        b.push(10);
        b.extend(2i32.to_be_bytes());
        b.push(3);
        s(&mut b, "state");
        b.extend(0i32.to_be_bytes());
        b.push(0);
        b.push(3);
        s(&mut b, "state");
        b.extend(1i32.to_be_bytes());
        b.push(10);
        s(&mut b, "nbt");
        b.push(8);
        s(&mut b, "pool");
        s(&mut b, "test:haus/teile");
        b.push(0);
        b.push(0);
        b.push(0);
        let dir = std::env::temp_dir().join("anvil_nbt_test");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("haus.nbt");
        let mut gz = flate2::write::GzEncoder::new(vec![], flate2::Compression::default());
        std::io::Write::write_all(&mut gz, &b).unwrap();
        std::fs::write(&f, gz.finish().unwrap()).unwrap();
        let info = read_info(&f).unwrap();
        std::fs::write(dir.join("sample.nbt"), sample_nbt()).unwrap();
        let sample = read_info(&dir.join("sample.nbt")).unwrap();
        assert_eq!(sample.size, [3, 3, 3]);
        assert!(sample.blocks > 0);
        assert_eq!(info.size, [2, 1, 1]);
        assert_eq!(info.blocks, 2);
        assert_eq!(info.pools, vec!["test:haus/teile".to_string()]);
    }

    #[test]
    fn structure_files() {
        let s = StructDef {
            id: "haus".into(),
            pieces: vec![
                StructPiece { template: "haus".into(), pool: "".into(), weight: 1 },
                StructPiece { template: "haus_turm".into(), pool: "haus/teile".into(), weight: 2 },
            ],
            overworld: true,
            placement: "surface".into(),
            spacing: 32,
            separation: 8,
            depth: 4,
            ..Default::default()
        };
        let f = files(&s, "test", &["test:welt_wiese".into()]);
        let paths: Vec<&str> = f.iter().map(|(p, _)| p.as_str()).collect();
        assert!(paths.contains(&"worldgen/template_pool/haus/teile.json"));
        assert!(paths.contains(&"worldgen/structure/haus.json"));
        let tag = &f.iter().find(|(p, _)| p.starts_with("tags/")).unwrap().1;
        assert_eq!(tag["values"][0], "#minecraft:is_overworld");
        assert_eq!(tag["values"][1], "test:welt_wiese");
    }
}
