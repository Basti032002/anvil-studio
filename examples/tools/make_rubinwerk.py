import json, os, random, base64, io, math
from PIL import Image
import sys
R = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rubinwerk"
MOD = "rubinwerk"
A = f"{R}/src/main/resources/assets/{MOD}/textures"
LIB = f"{R}/.anvil/textures"
for d in [f"{A}/block", f"{A}/item", LIB]: os.makedirs(d, exist_ok=True)
rnd = random.Random(7)

def hexc(h, a=255): h=h.lstrip('#'); return (int(h[0:2],16),int(h[2:4],16),int(h[4:6],16),a)
def shade(c, k): return tuple(max(0,min(255,int(v*k))) for v in c[:3])+(c[3],)
def img(): return Image.new("RGBA",(16,16),(0,0,0,0))
def noise_fill(im, base, amt=0.12, seed=1):
    r=random.Random(seed)
    for y in range(16):
        for x in range(16):
            im.putpixel((x,y), shade(base, 1+(r.random()-0.5)*2*amt))
    return im

STONE=hexc("7d7d7d"); DEEP=hexc("4a4a52")
RUBY=hexc("d01c3a"); RUBY_D=hexc("8a0f24"); RUBY_L=hexc("ff6b84"); RUBY_W=hexc("ffd0d8")

def gem(im, x, y, big=False):
    pts=[(1,0),(0,1),(1,1),(2,1),(1,2)] if not big else [(1,0),(2,0),(0,1),(1,1),(2,1),(3,1),(1,2),(2,2)]
    for i,(dx,dy) in enumerate(pts):
        c = RUBY_L if (dx,dy) in [(1,0),(1,1)] else (RUBY_D if dy==2 else RUBY)
        if 0<=x+dx<16 and 0<=y+dy<16: im.putpixel((x+dx,y+dy),c)

def ore(base, seed):
    im=noise_fill(img(), base, 0.14, seed)
    for (x,y,b) in [(2,3,True),(9,2,False),(11,8,True),(3,10,False),(7,12,True),(12,13,False)]: gem(im,x,y,b)
    return im

def ruby_block(frame=0, frames=1):
    im=img()
    for y in range(16):
        for x in range(16):
            c=RUBY
            if x in (0,15) or y in (0,15): c=RUBY_D
            elif x==1 or y==1: c=RUBY_L
            elif x==14 or y==14: c=shade(RUBY,0.8)
            elif (x+y)%5==0: c=shade(RUBY,1.08)
            im.putpixel((x,y),c)
    # Glanzstreifen läuft diagonal
    if frames>1:
        pos = -6 + frame*(28/frames)
        for y in range(2,14):
            for x in range(2,14):
                dd = (x+y) - (pos+8)
                if 0<=dd<2: im.putpixel((x,y),RUBY_W if dd<1 else RUBY_L)
    return im

def bricks():
    im=img()
    mortar=hexc("5a2430")
    for y in range(16):
        for x in range(16):
            row=y//4; off=4 if row%2 else 0
            if y%4==3 or (x+off)%8==7: c=mortar
            else: c=shade(RUBY_D if (x+off)//8%2 else hexc("a8162f"), 1+(rnd.random()-0.5)*0.15)
            if y%4==0 and (x+off)%8!=7: c=shade(c,1.18)
            im.putpixel((x,y),c)
    return im

def lamp(on):
    im=img()
    frame=hexc("3c2a22")
    glass=hexc("ff4d6a") if on else hexc("5c1a26")
    for y in range(16):
        for x in range(16):
            if x in (0,15) or y in (0,15) or x in (7,8) or y in (7,8): c=frame
            else:
                d=min(x,15-x,y,15-y)
                c=shade(glass, (1.25 if on else 1.0) if d>2 else (1.0 if on else 0.85))
                if on and ((x,y) in [(3,3),(11,3),(3,11),(11,11)]): c=hexc("ffe6ea")
            im.putpixel((x,y),c)
    return im

METAL=hexc("6f747c"); METAL_D=hexc("3f434a"); METAL_L=hexc("a3a9b2")
def press_side():
    im=noise_fill(img(), METAL, 0.06, 3)
    for i in range(16):
        im.putpixel((i,0),METAL_L); im.putpixel((0,i),METAL_L); im.putpixel((i,15),METAL_D); im.putpixel((15,i),METAL_D)
    for (x,y) in [(2,2),(13,2),(2,13),(13,13)]: im.putpixel((x,y),METAL_D)
    for y in range(5,11):
        for x in range(3,13):
            if y in (5,10) or x in (3,12): im.putpixel((x,y),METAL_D)
            elif y%2==0: im.putpixel((x,y),shade(METAL,0.8))
    return im
def press_front():
    im=press_side()
    for y in range(3,13):
        for x in range(3,13):
            if y in (3,12) or x in (3,12): c=METAL_D
            else:
                d=abs(x-7.5)+abs(y-7.5)
                c=RUBY_L if d<2 else (RUBY if d<4 else RUBY_D)
            im.putpixel((x,y),c)
    return im
def press_top():
    im=noise_fill(img(), METAL, 0.06, 5)
    for i in range(16):
        im.putpixel((i,0),METAL_L); im.putpixel((0,i),METAL_L); im.putpixel((i,15),METAL_D); im.putpixel((15,i),METAL_D)
    for y in range(3,13):
        for x in range(3,13):
            if (x+y)%2==0: im.putpixel((x,y),METAL_D)
    return im

# ---- Items ----
def draw(pixels, colors):
    im=img()
    for y,row in enumerate(pixels):
        for x,ch in enumerate(row):
            if ch!='.': im.putpixel((x,y),colors[ch])
    return im
GEM = ["................",
       "................",
       ".....dddddd.....",
       "....dLLWLLRd....",
       "...dLLWLLRRRd...",
       "..dLLLLLRRRRRd..",
       "..dRRRRRRRRRRd..",
       "...dRRRRRRRRd...",
       "....dRRRRRRd....",
       ".....dRRRRd.....",
       "......dRRd......",
       ".......dd.......",
       "................",
       "................","................","................"]
GC={'d':RUBY_D,'L':RUBY_L,'W':RUBY_W,'R':RUBY}
def dust():
    im=img(); r=random.Random(11)
    for _ in range(26):
        x=r.randint(3,12); y=r.randint(6,13)
        im.putpixel((x,y), r.choice([RUBY,RUBY_D,RUBY_L]))
    for x in range(2,14): im.putpixel((x,14), hexc("7a5a40"))
    return im
STICK=hexc("6b4a2b"); STICK_L=hexc("9c7346")
def tool(kind):
    p={
     "sword":["..............dd",".............dLd","............dLRd","...........dLRd.","..........dLRd..",".........dLRd...","........dLRd....",".......dLRd.....","..cc..dLRd......","..cdcdLRd.......","...cdLRd........","....sdd.........","...sSc..........","..sSs.cc........",".sSs............",".ss............."],
     "pickaxe":["................","....dddddd......","...dLLLLRRd.....","..dLRddddRRd....","..dRd....dRRd...","..dd...sS.dRd...","......sS...dd...",".....sS.........","....sS..........","...sS...........","..sS............",".sS.............","sS..............","................","................","................"],
     "axe":["................","......ddd.......",".....dLLRd......","....dLRRRd......","....dLRsRd......","....ddRsSd......","......sS........",".....sS.........","....sS..........","...sS...........","..sS............",".sS.............","sS..............","................","................","................"],
     "shovel":["................","...........ddd..","..........dLRd..",".........dLRRd..",".........dRRd...","........sSdd....",".......sS.......","......sS........",".....sS.........","....sS..........","...sS...........","..sS............",".sS.............","................","................","................"],
     "hoe":["................","......dddd......",".....dLLRRd.....","....ddddsRd.....","........sSd.....",".......sS.......","......sS........",".....sS.........","....sS..........","...sS...........","..sS............",".sS.............","sS..............","................","................","................"],
    }[kind]
    return draw(p,{'d':RUBY_D,'L':RUBY_L,'R':RUBY,'s':STICK,'S':STICK_L,'c':hexc("e2b23c")})
def wand():
    p=["............ww..","...........wLRw.","..........wLRRdw","..........wRRdw.","...........wdw..","..........sS....",".........sS.....","........sS......",".......sS.......","......sS........",".....sS.........","....sS..........","...gS...........","..gg............","................","................"]
    return draw(p,{'w':RUBY_W,'L':RUBY_L,'R':RUBY,'d':RUBY_D,'s':STICK,'S':STICK_L,'g':hexc("e2b23c")})

def save(im, path): im.save(path)

def battery_front(level=0.6):
    im=press_side()
    for y in range(2,14):
        for x in range(5,11):
            if x in (5,10) or y in (2,13): im.putpixel((x,y),METAL_D)
            else:
                filled = (13-y) <= int(10*level)
                im.putpixel((x,y), (hexc("6fcf5a") if y>7 else hexc("f6d743")) if filled else hexc("2a2a2a"))
    for x in range(6,10): im.putpixel((x,1),METAL_L)
    return im
def generator_front():
    im=press_side()
    for y in range(6,13):
        for x in range(4,12):
            if y in (6,12) or x in (4,11): im.putpixel((x,y),METAL_D)
            else:
                d=(12-y)/6
                im.putpixel((x,y), hexc("ffe04a") if d<0.35 else (hexc("ff9a1f") if d<0.7 else hexc("c0392b")))
    for x in range(4,12,2): im.putpixel((x,3),METAL_D)
    return im
def solar_top():
    im=img()
    for y in range(16):
        for x in range(16):
            if x in (0,15) or y in (0,15): c=METAL_L
            elif x%5==0 or y%5==0: c=hexc("9fb9ff")
            else: c=shade(hexc("1d3b8b"),1+((x*7+y*3)%5)*0.04)
            im.putpixel((x,y),c)
    return im
def cable_tex():
    im=noise_fill(img(), RUBY_D, 0.08, 9)
    for y in range(16):
        for x in range(16):
            if (x+y)%6==0: im.putpixel((x,y),RUBY)
            if 6<=x<=9 and 6<=y<=9: im.putpixel((x,y),hexc("e2b23c"))
    return im

# eigene Block-Texturen
save(ore(STONE,1), f"{A}/block/ruby_ore.png")
save(ore(DEEP,2), f"{A}/block/deepslate_ruby_ore.png")
save(ruby_block(), f"{A}/block/ruby_block.png")
save(bricks(), f"{A}/block/ruby_bricks.png")
save(lamp(False), f"{A}/block/ruby_lamp.png")
save(lamp(True), f"{A}/block/ruby_lamp_on.png")
save(press_front(), f"{A}/block/ruby_press.png")
# Items
save(draw(GEM,GC), f"{A}/item/ruby.png")
save(dust(), f"{A}/item/ruby_dust.png")
save(wand(), f"{A}/item/ruby_wand.png")
for k in ["sword","pickaxe","axe","shovel","hoe"]: save(tool(k), f"{A}/item/ruby_{k}.png")

# Bibliothek (mit Ebenen-Dokument)
def lib(id, frames, frametime=4, layers=None):
    size=16
    if layers is None: layers=[[f] for f in frames]  # je Frame eine Ebene
    nl=len(layers[0])
    meta=[{"id":f"l{id}{i}","name":("Ebene %d"%(i+1)) if i else "Grundfarbe","visible":True,"opacity":1} for i in range(nl)]
    doc={"v":1,"size":size,"frametime":frametime,"interpolate":False,"layers":meta,
         "frames":[[base64.b64encode(l.tobytes()).decode() for l in fr] for fr in layers]}
    sheet=Image.new("RGBA",(size,size*len(layers)),(0,0,0,0))
    for i,fr in enumerate(layers):
        comp=Image.new("RGBA",(size,size),(0,0,0,0))
        for l in fr: comp=Image.alpha_composite(comp,l)
        sheet.paste(comp,(0,i*size))
    json.dump(doc, open(f"{LIB}/{id}.json","w"))
    sheet.save(f"{LIB}/{id}.png")

glint=[ruby_block(f,8) for f in range(8)]
lib("rubin_glanz", glint, frametime=3)
# Ziegel mit zwei Ebenen: Grundfarbe + Fugen
b=bricks(); base=Image.new("RGBA",(16,16),(0,0,0,0)); fugen=Image.new("RGBA",(16,16),(0,0,0,0))
for y in range(16):
    for x in range(16):
        c=b.getpixel((x,y))
        (fugen if c[:3]==hexc("5a2430")[:3] else base).putpixel((x,y),c)
lib("rubin_ziegel", None, layers=[[base,fugen]])
lib("presse_vorne", [press_front()])
lib("presse_seite", [press_side()])
lib("presse_oben", [press_top()])
lib("akku_vorne", [battery_front(0.2), battery_front(0.5), battery_front(0.8), battery_front(1.0)], frametime=10)
lib("generator_vorne", [generator_front()])
lib("solar_oben", [solar_top()])
save(cable_tex(), f"{A}/block/ruby_cable.png")
save(generator_front(), f"{A}/block/ruby_generator.png")
save(solar_top(), f"{A}/block/ruby_solar_panel.png")
save(battery_front(0.6), f"{A}/block/ruby_battery.png")

# ---- Inhalte ----
def recipe(rows, keys, count=1):
    grid=[]
    for r in rows:
        for ch in r: grid.append(keys.get(ch,""))
    return {"enabled":True,"kind":"crafting","shaped":True,"grid":grid,"count":count}
R_="rubinwerk:ruby"; S="minecraft:stick"
blocks=[
 {"id":"ruby_ore","nameEn":"Ruby Ore","nameDe":"Rubinerz","material":"stone","hardness":3,"resistance":3,"tool":"pickaxe","tier":"iron",
  "ore":{"enabled":True,"drop":R_,"dropMin":1,"dropMax":2,"xpMin":3,"xpMax":7,"deepslate":True,"dimension":"overworld","veinSize":6,"veinsPerChunk":7,"minY":-48,"maxY":24}},
 {"id":"ruby_block","nameEn":"Block of Ruby","nameDe":"Rubinblock","material":"metal","hardness":5,"resistance":6,"tool":"pickaxe","tier":"iron","light":3,
  "recipe":recipe(["RRR","RRR","RRR"],{"R":R_}),"faces":{"mode":"all","all":"rubin_glanz"}},
 {"id":"ruby_bricks","nameEn":"Ruby Bricks","nameDe":"Rubinziegel","material":"stone","hardness":2,"resistance":6,"tool":"pickaxe","tier":"wood",
  "shapes":["stairs","slab","wall"],"recipe":{**recipe(["RR","RR"],{"R":"rubinwerk:ruby_block"}),"count":4},"faces":{"mode":"all","all":"rubin_ziegel"}},
 {"id":"ruby_lamp","nameEn":"Ruby Lamp","nameDe":"Rubinlampe","kind":"lamp","material":"glass","hardness":0.3,"resistance":0.3,"tool":"none",
  "recipe":recipe([" G ","GRG"," G "],{"G":"minecraft:glowstone_dust","R":R_})},
 {"id":"ruby_press","nameEn":"Ruby Press","nameDe":"Rubin-Presse","kind":"machine","material":"metal","hardness":3.5,"resistance":6,"tool":"pickaxe","tier":"stone",
  "recipe":recipe(["III","IRI","IFI"],{"I":"minecraft:iron_ingot","R":"rubinwerk:ruby_block","F":"minecraft:furnace"}),
  "energy":{"capacity":20000,"rate":400,"generate":0,"source":"fuel","usePerTick":20},
  "machine":{"fuel":False,"electric":True,"gui":"rubin_presse","recipes":[
     {"input":R_,"inputCount":1,"output":"rubinwerk:ruby_dust","outputCount":2,"time":100},
     {"input":"minecraft:raw_iron","inputCount":1,"output":"minecraft:iron_ingot","outputCount":2,"time":160},
     {"input":"minecraft:raw_gold","inputCount":1,"output":"minecraft:gold_ingot","outputCount":2,"time":160}]},
  "faces":{"mode":"each","top":"presse_oben","bottom":"presse_oben","north":"presse_vorne","south":"presse_seite","east":"presse_seite","west":"presse_seite"}},
 {"id":"ruby_generator","nameEn":"Ruby Generator","nameDe":"Rubin-Generator","kind":"generator","material":"metal","hardness":3.5,"resistance":6,"tool":"pickaxe","tier":"stone",
  "energy":{"capacity":40000,"rate":400,"generate":40,"source":"fuel","usePerTick":0},"gui":"rubin_generator",
  "recipe":recipe(["III","IRI","IFI"],{"I":"minecraft:iron_ingot","R":"minecraft:redstone_block","F":"minecraft:furnace"}),
  "faces":{"mode":"each","top":"presse_oben","bottom":"presse_oben","north":"generator_vorne","south":"presse_seite","east":"presse_seite","west":"presse_seite"}},
 {"id":"ruby_solar_panel","nameEn":"Ruby Solar Panel","nameDe":"Rubin-Solarpanel","kind":"generator","material":"metal","hardness":2,"resistance":4,"tool":"pickaxe","tier":"wood",
  "energy":{"capacity":8000,"rate":100,"generate":15,"source":"solar","usePerTick":0},
  "recipe":recipe(["GGG","RDR","III"],{"G":"minecraft:glass","R":"rubinwerk:ruby_dust","D":"minecraft:daylight_detector","I":"minecraft:iron_ingot"}),
  "faces":{"mode":"pillar","top":"solar_oben","bottom":"presse_oben","side":"presse_seite"}},
 {"id":"ruby_battery","nameEn":"Ruby Battery Cell","nameDe":"Rubin-Akku","kind":"battery","material":"metal","hardness":3,"resistance":6,"tool":"pickaxe","tier":"stone",
  "energy":{"capacity":250000,"rate":1000,"generate":0,"source":"fuel","usePerTick":0},"gui":"rubin_akku",
  "recipe":recipe(["IRI","RBR","IRI"],{"I":"minecraft:iron_ingot","R":"minecraft:redstone","B":"rubinwerk:ruby_block"}),
  "faces":{"mode":"each","top":"presse_oben","bottom":"presse_oben","north":"akku_vorne","south":"presse_seite","east":"presse_seite","west":"presse_seite"}},
 {"id":"ruby_cable","nameEn":"Ruby Cable","nameDe":"Rubin-Kabel","kind":"cable","material":"metal","hardness":0.5,"resistance":1,"tool":"pickaxe","tier":"wood",
  "energy":{"capacity":1000,"rate":1000,"generate":0,"source":"fuel","usePerTick":0},
  "recipe":{**recipe(["   ","DGD","   "],{"D":"rubinwerk:ruby_dust","G":"minecraft:gold_ingot"}),"count":8}},
]
def toolitem(t, name_en, name_de, dmg, spd):
    rows={"sword":[" R "," R "," S "],"pickaxe":["RRR"," S "," S "],"axe":["RR ","RS "," S "],"shovel":[" R "," S "," S "],"hoe":["RR "," S "," S "]}[t]
    return {"id":f"ruby_{t}","nameEn":name_en,"nameDe":name_de,"kind":"tool","toolType":t,"toolTier":"iron","durability":900,"attackDamage":dmg,"attackSpeed":spd,
            "miningSpeed":7.5,"enchantability":18,"repairItem":R_,"stackSize":1,"recipe":recipe(rows,{"R":R_,"S":S})}
items=[
 {"id":"ruby","nameEn":"Ruby","nameDe":"Rubin","rarity":"uncommon","stackSize":64},
 {"id":"ruby_dust","nameEn":"Ruby Dust","nameDe":"Rubinstaub","stackSize":64,
  "recipe":{"enabled":True,"kind":"crafting","shaped":False,"grid":[R_,"","","","","","","",""],"count":1}},
 {"id":"ruby_wand","nameEn":"Ruby Wand","nameDe":"Rubin-Stab","rarity":"epic","stackSize":1,
  "recipe":recipe(["  D"," S ","S  "],{"D":"rubinwerk:ruby_dust","S":S})},
 toolitem("sword","Ruby Sword","Rubinschwert",7,1.6),
 toolitem("pickaxe","Ruby Pickaxe","Rubinspitzhacke",4,1.2),
 toolitem("axe","Ruby Axe","Rubinaxt",9,0.9),
 toolitem("shovel","Ruby Shovel","Rubinschaufel",4.5,1.0),
 toolitem("hoe","Ruby Hoe","Rubinhacke",1,3.0),
]
for it in items:
    it.setdefault("kind","basic"); it.setdefault("rarity","common")

variables=[
 {"name":"rubine","kind":"number","scope":"player","default":"0","desc":"Wie viele Rubin-Erze der Spieler abgebaut hat"},
 {"name":"magie","kind":"number","scope":"world","default":"0","desc":"Magie für den Rubin-Stab (0–1000), lädt sich von selbst"},
 {"name":"turbo","kind":"logic","scope":"world","default":"false","desc":"Turbo-Modus: lädt die Magie schneller"},
 {"name":"begruesst","kind":"logic","scope":"player","default":"false","desc":"Hat der Spieler die Begrüßung schon bekommen?"},
]
def el(kind,x,y,w,h,**k):
    d={"id":f"{kind}{x}{y}","kind":kind,"x":x,"y":y,"w":w,"h":h,"text":"","color":"#404040","var":"","max":100,"action":"","item":""}; d.update(k); return d
guis=[
 {"id":"rubin_presse","nameEn":"Ruby Press","nameDe":"Rubin-Presse","width":176,"height":166,"style":"light","showTitle":True,"elements":[
   el("slot_in",55,16,18,18), el("slot_fuel",55,52,18,18), el("flame",57,36,14,14), el("arrow",79,34,24,17), el("slot_out",111,31,26,26),
   el("energy",12,16,12,54,color="#d01c3a",var="@fe",max=1000),
   el("value",30,70,100,9,text="",var="@fe",color="#404040"),
   el("player_inv",7,83,162,76)]},
 {"id":"rubin_generator","nameEn":"Ruby Generator","nameDe":"Rubin-Generator","width":176,"height":166,"style":"light","showTitle":True,"elements":[
   el("slot_fuel",79,50,18,18), el("flame",81,32,14,14),
   el("energy",150,16,14,58,color="#d01c3a",var="@fe"),
   el("value",8,20,120,9,text="",var="@fe",color="#404040"),
   el("text",8,64,70,9,text="+40 FE/t",color="#2f9e44"),
   el("player_inv",7,83,162,76)]},
 {"id":"rubin_akku","nameEn":"Ruby Battery Cell","nameDe":"Rubin-Akku","width":176,"height":90,"style":"dark","showTitle":True,"elements":[
   el("energy",12,20,152,22,color="#6fcf5a",var="@fe"),
   el("value",12,50,152,9,text="",var="@fe",color="#ffffff"),
   el("text",12,66,152,9,text="Output: front side",color="#9d9d9d")]},
 {"id":"rubin_zentrale","nameEn":"Ruby Control","nameDe":"Rubin-Zentrale","width":200,"height":124,"style":"dark","showTitle":True,"elements":[
   el("panel",8,20,184,40,color="#3a1820"),
   el("item",16,32,16,16,item="rubinwerk:ruby"),
   el("value",40,28,140,9,text="Rubine: ",var="rubine",color="#ffd0d8"),
   el("value",40,42,140,9,text="Magie: ",var="magie",color="#ffd0d8"),
   el("energy",176,24,10,32,color="#9b5de5",var="magie",max=1000),
   el("button",8,70,90,20,text="Belohnung (5)",action="belohnung"),
   el("switch",102,70,90,20,text="Turbo",var="turbo"),
   el("text",8,100,184,9,text="Tipp: /rubin oeffnet dieses Fenster",color="#9d9d9d")]},
]
tags=[
 {"registry":"item","id":"c:gems","values":[R_],"desc":"Damit andere Mods Rubine als Edelstein erkennen"},
 {"registry":"item","id":"c:dusts","values":["rubinwerk:ruby_dust"],"desc":""},
 {"registry":"block","id":"c:storage_blocks","values":["rubinwerk:ruby_block"],"desc":""},
 {"registry":"block","id":"minecraft:beacon_base_blocks","values":["rubinwerk:ruby_block"],"desc":"Rubinblöcke als Leuchtfeuer-Sockel"},
 {"registry":"item","id":"minecraft:beacon_payment_items","values":[R_],"desc":"Rubine als Bezahlung fürs Leuchtfeuer"},
 {"registry":"item","id":"minecraft:piglin_loved","values":[R_,"rubinwerk:ruby_block"],"desc":"Piglins lieben Rubine"},
 {"registry":"item","id":"rubinwerk:rubin_sachen","values":[R_,"rubinwerk:ruby_dust","rubinwerk:ruby_block"],"desc":"Alles aus Rubin – für Bedingungen im Blueprint"},
]

# ---- Blueprints ----
def bp(name, chain, extra_nodes=(), extra_links=()):
    nodes=[]; links=[]
    for i,(nid,kind,props) in enumerate(chain):
        nodes.append({"id":nid,"kind":kind,"x":60+i*300,"y":80,"props":props})
        if i: links.append({"from":chain[i-1][0],"out":"next","to":nid})
    for n in extra_nodes: nodes.append(n)
    for l in extra_links: links.append(l)
    return {"name":name,"enabled":True,"nodes":nodes,"links":links}
def N(id,kind,x,y,**props): return {"id":id,"kind":kind,"x":x,"y":y,"props":{k:str(v) for k,v in props.items()}}
def L(a,o,b): return {"from":a,"out":o,"to":b}

blueprints=[]
# 1 Begrüßung
blueprints.append({"name":"Begrüßung","enabled":True,"nodes":[
  N("e","ev_join",60,120),
  N("if","if",340,120,cond="var",var="begruesst",value="true"),
  N("t","title",660,40,text="Willkommen im Rubinwerk!",subtitle="Suche Rubin-Erz unter Y 24",to="player"),
  N("g","give",960,40,item=R_,count=3),
  N("m","message",1260,40,text="Tipp: /rubin öffnet die Rubin-Zentrale. Strom: Rubin-Generator oder Solarpanel → Rubin-Kabel → Rubin-Presse oder Rubin-Akku.",to="player"),
  N("s","var_set",1560,40,var="begruesst",op="set",src="value",value="true"),
  N("sh","var_show",660,220,var="rubine",slot="sidebar"),
 ],"links":[L("e","next","if"),L("if","false","t"),L("t","next","g"),L("g","next","m"),L("m","next","s"),L("if","true","sh"),L("s","next","sh")]})
# 2 Rubin-Erz abgebaut
blueprints.append({"name":"Rubin-Erz zählen","enabled":True,"nodes":[
  N("e","ev_break",60,120,target="ruby_ore"),
  N("a","var_set",340,120,var="rubine",op="add",src="value",value="1"),
  N("ab","actionbar",640,120,text="Rubine abgebaut: {var:rubine}"),
  N("if","if",940,120,cond="var",var="rubine",cmp="eq",value="10"),
  N("t","title",1240,40,text="Rubin-Meister!",subtitle="10 Rubin-Erze abgebaut",to="player"),
  N("x","xp",1540,40,amount="50"),
  N("snd","sound",1840,40,sound="minecraft:ui.toast.challenge_complete"),
  N("e2","ev_break",60,340,target="deepslate_ruby_ore"),
  N("a2","var_set",340,340,var="rubine",op="add",src="value",value="1"),
 ],"links":[L("e","next","a"),L("a","next","ab"),L("ab","next","if"),L("if","true","t"),L("t","next","x"),L("x","next","snd"),L("e2","next","a2"),L("a2","next","ab")]})
# 3 Rubin-Stab
blueprints.append({"name":"Rubin-Stab","enabled":True,"nodes":[
  N("e","ev_click_item",60,120,target="ruby_wand"),
  N("if","if",340,120,cond="var",var="magie",cmp="ge",value="100"),
  N("m","var_math",660,40,var="magie",op="sub",src="num",value="100"),
  N("l","launch",960,40,strength="1.6",who="player"),
  N("p","particle",1260,40,particle="minecraft:crit",count="30"),
  N("s","sound",1560,40,sound="minecraft:entity.firework_rocket.launch"),
  N("eff","effect",1860,40,effect="slow_falling",seconds="6",level="1",who="player"),
  N("no","actionbar",660,240,text="Zu wenig Magie! ({var:magie}/100) – warte etwas oder schalte Turbo in /rubin ein."),
 ],"links":[L("e","next","if"),L("if","true","m"),L("m","next","l"),L("l","next","p"),L("p","next","s"),L("s","next","eff"),L("if","false","no")]})
# 4 Energie laden
blueprints.append({"name":"Magie laden","enabled":True,"nodes":[
  N("e","ev_timer",60,120,seconds="5"),
  N("if","if",340,120,cond="var",var="turbo",value="true"),
  N("fast","var_math",660,40,var="magie",op="add",src="num",value="40"),
  N("slow","var_math",660,240,var="magie",op="add",src="num",value="10"),
  N("cap","var_math",980,120,var="magie",op="min",src="num",value="1000"),
 ],"links":[L("e","next","if"),L("if","true","fast"),L("if","false","slow"),L("fast","next","cap"),L("slow","next","cap")]})
# 5 /rubin
blueprints.append({"name":"Rubin-Zentrale","enabled":True,"nodes":[
  N("e","ev_command",60,120,command="/rubin"),
  N("o","open_gui",360,120,gui="rubin_zentrale"),
 ],"links":[L("e","next","o")]})
# 6 Belohnung (Funktion für den Knopf)
blueprints.append({"name":"Belohnung","enabled":True,"nodes":[
  N("f","ev_function",60,120,fn="belohnung"),
  N("if","if",340,120,cond="var",var="rubine",cmp="ge",value="5"),
  N("sub","var_set",660,40,var="rubine",op="sub",src="value",value="5"),
  N("g","give",960,40,item="rubinwerk:ruby_block",count=1),
  N("s","sound",1260,40,sound="minecraft:entity.player.levelup"),
  N("lg","log",1560,40,text="{player} hat eine Belohnung abgeholt, Rubine jetzt: {var:rubine}"),
  N("no","message",660,240,text="Du brauchst 5 abgebaute Rubin-Erze (du hast {var:rubine}).",to="player"),
 ],"links":[L("f","next","if"),L("if","true","sub"),L("sub","next","g"),L("g","next","s"),L("s","next","lg"),L("if","false","no")]})

content={"schemaVersion":4,"blocks":blocks,"items":items,"tabIcon":"ruby","tabName":"Rubinwerk","languages":["de_de"],
  "variables":variables,"guis":guis,"tags":tags,"blueprints":blueprints,
  "brewing":[{"input":"awkward","ingredient":"rubinwerk:ruby_dust","output":"strength"}]}
json.dump(content, open(R + "/../rubinwerk-content.json","w"), ensure_ascii=False, indent=1)
print("ok")
