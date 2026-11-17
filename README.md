# Svéd ragozás – gyakorló

Helyben futó, Anki-szerű gyakorló app svéd igékhez és melléknevekhez. Nincs szerver, nincs internet, nem kell telepíteni semmit.

## Indítás

Kattints duplán az `index.html` fájlra, és megnyílik a böngészőben (Safari, Chrome vagy Firefox).

Vagy kattints duplán a **Svéd ragozás** ikonra (`Svéd ragozás.app`) a mappában. A Dockba is áthúzhatod, onnan egy kattintással indul. Ha az első indításkor a macOS figyelmeztet, kattints rá jobb gombbal, majd **Megnyitás**.

## Hogyan működik

- Az app véletlenszerűen ad egy szót a **magyar jelentésével** és az **alapformájával** (igéknél az infinitiv, mellékneveknél az en-alak).
- **Igéknél** ezeket kell beírnod: imperativ, presens, preteritum, supinum.
  **Mellékneveknél**: ett-alak, plural, komparativ, superlativ, superlativ (határozott).
- `Enter`-rel a következő mezőre lépsz, az utolsó mezőben `Enter` ellenőriz, aztán újabb `Enter` hozza a következő szót.
- A hibás mező piros lesz, alatta zölddel a helyes alak. Ha csak az ékezet hiányzik, az app ezt is jelzi.
- Ha egy alak nem létezik (pl. a `kunna` imperativusza), a mező szürke, nem kell kitölteni.
- Ha több alak is helyes (pl. `sa/sade`, `gett/givit`), bármelyiket elfogadja.
- Svéd betűk: az å ä ö gombokkal, vagy gépelés közben: `a:` → ä, `o:` → ö, `aa` → å.

### Ismétlés (mint az Ankiban)

- Minden szó 0–6 szinten áll. Hibátlan válasz után egy szinttel feljebb lép.
- Ha hibázol, a szó visszaesik (2 vagy több hibánál 0-ra), és **3 kártya múlva újra előjön**.
- Az alacsony szintű szavak sokkal gyakrabban jönnek elő, a jól tudottak ritkán.
- **3. szinttől az alapforma eltűnik**: csak a magyar jelentést látod, és az infinitivet / en-alakot is neked kell beírnod.

A haladást a böngésző tárolja (localStorage). A **Haladás** fülön elmentheted egy `.json` fájlba, és onnan vissza is töltheted (pl. másik gépen vagy böngészőben).

## Új szavak felvétele

**1. Az Import fülön**, soronként egy szó, pontosvesszővel vagy tabulátorral elválasztva:

```
ige; infinitiv; imperativ; presens; preteritum; supinum; magyar jelentés[; csoport]
mn;  en-alak; ett-alak; plural; komparativ; superlativ; superlativ best.; magyar jelentés
```

Példa:

```
ige; tala; tala; talar; talade; talat; beszél
ige; springa; spring; springer; sprang; sprungit; fut; stark
mn; varm; varmt; varma; varmare; varmast; varmaste; meleg
```

- A csoport `stark`, `oregelbunden` vagy `övrig` lehet (alapértelmezés: `övrig`).
- Nem létező alak: `—` vagy `-`. Több helyes alak: `sa/sade`.
- Ha a szó már szerepel, az adatai felülíródnak, a haladás megmarad.
- Az importált szavak a böngészőben tárolódnak, és a mentésfájlba is bekerülnek.

**Ha csak az alapformákat tudod:** küldd el őket Claude-nak, és kérd, hogy adja vissza ebben a formátumban a ragozással és a magyar jelentéssel együtt. Az eredményt illeszd be az Import fülön.

**2. Közvetlenül a fájlban:** a `data/words.js` a beépített lista, ugyanilyen oszloprenddel. Ide felvett szavak minden böngészőben megjelennek.

## Fájlok

| Fájl | Tartalom |
|---|---|
| `index.html` | az oldal |
| `app.js` | gyakorló logika, ismétlés, import, mentés |
| `style.css` | megjelenés (világos és sötét mód) |
| `data/words.js` | beépített szólista: 82 erős ige, 21 rendhagyó ige, 50 melléknév |
