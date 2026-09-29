#!/usr/bin/env node
/**
 * DrPlusz cikk a szerkesztői kérdésből.
 * Nem hívódik a böngészőből, és nem tartalmaz API-kulcsot.
 *
 *   node tools/uj-cikk.mjs \
 *     --kerdes "..." \
 *     --forras "https://ods.od.nih.gov/factsheets/..." \
 *     --foto /útvonal/a-targyrol.jpg \
 *     --foto-alt "A tárgy a képen" \
 *     --foto-url "https://www.pexels.com/photo/..." \
 *     --foto-credit "Pexels, ingyenes licenc"
 *
 * A DEEPSEEK_API_KEY a környezetből jön. Ha nincs, a szkript megáll,
 * és nem ír kitalált cikket. Régi cikket nem ír felül.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ALLOWED_HOSTS = new Set([
  "ods.od.nih.gov",
  "www.nih.gov",
  "nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "www.efsa.europa.eu",
  "efsa.europa.eu",
]);
const HONAP = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

const MASIK_IKONOK = `<div class="masik-ikonok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 3.5v14.2M8.2 20.5h7.6M5 8.2h14M7.3 8.2 4.6 15.2h5.4L7.3 8.2zm9.4 0 2.7 7h-5.4l2.7-7"/></svg><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.3 9.5a2.8 2.8 0 0 1 5.1 1.5c0 1.5-2.1 1.8-2.1 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.2" cy="16.7" r="0.85" fill="currentColor"/></svg><svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M4 8h9M4 8l3-3M4 8l3 3M20 16H11M20 16l-3-3M20 16l-3 3"/></svg></div>`;

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) die("Ismeretlen argumentum: " + a);
    const key = a.slice(2);
    if (key === "help") return { help: true };
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) die("Hiányzik az érték: --" + key);
    out[key] = val;
    i++;
  }
  return out;
}

function usage() {
  console.log(`Használat: node tools/uj-cikk.mjs --kerdes "..." --forras URL --foto FÁJL --foto-alt "..." --foto-url URL --foto-credit "Pexels, ingyenes licenc" [--cim "..."]`);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slugify(s) {
  const map = { á: "a", é: "e", í: "i", ó: "o", ö: "o", ő: "o", ú: "u", ü: "u", ű: "u" };
  return String(s).toLowerCase().replace(/[áéíóöőúüű]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function paragraphs(list) {
  return (list || []).map((p) => `      <p>${esc(p)}</p>`).join("\n");
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function numbersIn(s) {
  return [...String(s).matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]);
}

function sourceHasNumber(source, raw) {
  const dot = raw.replace(",", ".");
  const comma = raw.replace(".", ",");
  const plain = dot.replace(".", "");
  return source.includes(raw) || source.includes(dot) || source.includes(comma) || (plain !== dot && source.includes(plain));
}

function todayBudapest() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" });
  const iso = fmt.format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  return { iso, szoveg: `${y}. ${HONAP[m - 1]} ${d}.` };
}

async function fetchSource(url) {
  let parsed;
  try { parsed = new URL(url); } catch { die("A forrás URL nem érvényes."); }
  if (parsed.protocol !== "https:") die("A forrás csak https lehet.");
  if (!ALLOWED_HOSTS.has(parsed.hostname)) die("A forrás csak NIH, PubMed vagy EFSA oldal lehet. Kapott: " + parsed.hostname);
  const res = await fetch(parsed.href, {
    redirect: "follow",
    headers: { "user-agent": "DrPluszCikk/1.0 (forras-ellenorzes)", accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) die("A forrás nem nyílt meg: HTTP " + res.status);
  const finalHost = new URL(res.url).hostname;
  if (!ALLOWED_HOSTS.has(finalHost)) die("A forrás átirányított egy nem engedett címre: " + finalHost);
  const text = htmlToText(await res.text());
  if (text.length < 400) die("A forrás szövege túl rövid, nem használom.");
  return { url: res.url, text };
}

async function draftWithModel(kerdes, cim, source) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) die("Nincs DEEPSEEK_API_KEY a környezetben. A szkript nem ír kitalált cikket, és a kulcs nem kerül a repóba.");
  const snippet = source.text.slice(0, 14000);
  const body = {
    model: "deepseek-flash",
    thinking: { type: "disabled" },
    temperature: 0.2,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Te a DrPlusz magazin írója vagy. Rövid, személyes, tegező magyar (a barátodnak mondod, nem magázol). Nem orvosi tanács, nem adag, nem diagnózis. Csak a megadott forrásszövegből dolgozol. Számot csak akkor írsz, ha az a forrásszövegben szerepel. Nem találsz ki statisztikát. Nem írsz át régi cikket. A válasz egyetlen JSON objektum.",
      },
      {
        role: "user",
        content: `Kérdés: ${kerdes}\nOpcionális cím: ${cim || "(nincs)"}\nForrás URL: ${source.url}\n\nForrásszöveg:\n${snippet}\n\nJSON séma, minden mező kötelező:\n{"cim":"","dek":"","kicker":"egy-két szó","mi_a_kerdes":["",""],"mit_neztek":[""],"mit_talaltak":["",""],"masik_cikk":"két-három szó, szám nélkül","masik_nezet":"két-három szó, szám nélkül","masik_szoveg":"egy bekezdés, a forrás óvatossága vagy határa, szám nélkül ha a forrásban nincs","nem_allitunk":["","",""],"forras_cim":"a közlemény vagy adatlap címe"}\nA masik_cikk és masik_nezet nem szám. A nem_allitunk mondja ki, hogy ez nem orvosi tanács és nem adag.`,
      },
    ],
  };
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  if (!res.ok) die("A modell nem válaszolt: HTTP " + res.status);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) die("A modell üres választ adott.");
  let json;
  try { json = JSON.parse(content); } catch { die("A modell válasza nem JSON."); }
  return json;
}

function requireStrings(json) {
  const need = ["cim", "dek", "kicker", "masik_cikk", "masik_nezet", "masik_szoveg", "forras_cim"];
  for (const k of need) if (typeof json[k] !== "string" || !json[k].trim()) die("Hiányzik a mező: " + k);
  for (const k of ["mi_a_kerdes", "mit_neztek", "mit_talaltak", "nem_allitunk"]) {
    if (!Array.isArray(json[k]) || json[k].some((x) => typeof x !== "string" || !x.trim())) die("Hiányzik a lista: " + k);
  }
  if (/\d/.test(json.masik_cikk) || /\d/.test(json.masik_nezet)) die("A kétoszlopos ábra nem tartalmazhat számot.");
  if (/\b(Önnek|Önt|Önnel|magának)\b/.test(JSON.stringify(json))) die("A szöveg magáz. Tegezés kell.");
}

function assertNumbers(json, sourceText) {
  const blob = [
    json.dek, json.masik_szoveg,
    ...json.mi_a_kerdes, ...json.mit_neztek, ...json.mit_talaltak, ...json.nem_allitunk,
  ].join("\n");
  const missing = [...new Set(numbersIn(blob))].filter((n) => !sourceHasNumber(sourceText, n));
  if (missing.length) die("Ezek a számok nincsenek a megnyitott forrásban, ezért nem írom ki a cikket: " + missing.join(", "));
}

function articleHtml(d, meta) {
  const nem = d.nem_allitunk.map((p) => `        <p>${esc(p)}</p>`).join("\n");
  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(d.cim)} · DrPlusz</title>
  <meta name="description" content="${esc(d.dek)}">
  <link rel="icon" href="../img/logo.jpg" type="image/jpeg">
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>
  <a class="skip" href="#tartalom">Ugrás a tartalomra</a>
  <div class="disclaimer">
    <p><strong>Ez nem orvosi tanács.</strong> A DrPlusz magazin kutatásokat foglal össze közérthetően. Nem diagnózis, nem kezelési javaslat, és nem helyettesíti az orvost vagy a gyógyszerészt.</p>
  </div>
  <header class="wrap">
    <div class="mast">
      <a class="brand" href="../index.html">
        <img src="../img/logo.jpg" alt="DrPlusz logó: teal pluszjel és arany levél">
        <span>
          <span class="brand-name">DrPlusz</span>
          <small>Termékmagazin</small>
        </span>
      </a>
      <nav aria-label="Főmenü">
        <a href="../index.html">Főoldal</a><a href="../cikkek/index.html" aria-current="page">Cikkek</a><a href="../tesztek/d-vitamin-formak.html">Összehasonlítás</a><a href="../impresszum.html">Impresszum</a><a href="../adatkezeles.html">Adatkezelés</a>
      </nav>
    </div>
  </header>
  <main id="tartalom">
    <article class="wrap section prose">
      <p class="kicker">Cikk · ${esc(d.kicker)}</p>
      <h1>${esc(d.cim)}</h1>
      <p class="dek">${esc(d.dek)}</p>
      <figure>
        <img src="../img/cover/${esc(meta.fotoNev)}" alt="${esc(meta.fotoAlt)}">
        <figcaption>${esc(meta.fotoAlt)} A fénykép a cikk tárgyát mutatja. Kép: <a href="${esc(meta.fotoUrl)}">${esc(meta.fotoCredit)}</a></figcaption>
      </figure>

      <h2>Mi a kérdés?</h2>
${paragraphs(d.mi_a_kerdes)}

      <h2>Mit néztek?</h2>
${paragraphs(d.mit_neztek)}

      <h2>Mit találtak?</h2>
${paragraphs(d.mit_talaltak)}

<aside class="masik-oldal">
      <div class="masik-fej">
        <h2>Másik oldal</h2>
        ${MASIK_IKONOK}
      </div>
      <p class="masik-jel">Ez egy másik vélemény. Nem biztos, hogy ez a helyes.</p>
      <div class="masik-paros">
        <div class="masik-oszlop"><span class="masik-cimke">A cikk</span><span class="masik-sav"></span><span class="masik-szo">${esc(d.masik_cikk)}</span></div>
        <div class="masik-oszlop"><span class="masik-cimke">Másik nézet</span><span class="masik-sav masik-sav-b"></span><span class="masik-szo">${esc(d.masik_nezet)}</span></div>
      </div>
      <p>${esc(d.masik_szoveg)}</p>
      <p class="masik-forras"><a href="${esc(meta.forrasUrl)}">${esc(d.forras_cim)}</a></p>
    </aside>

      <div class="not">
        <h2>Mit nem állítunk</h2>
${nem}
        <p>Ez nem orvosi tanács, és nem mondunk adagot.</p>
      </div>

      <h2>Források</h2>
      <ol class="sources">
        <li>${esc(d.forras_cim)} <a href="${esc(meta.forrasUrl)}">${esc(meta.forrasUrl)}</a></li>
      </ol>
    </article>
  </main>
  <footer>
    <div class="wrap">
      <strong style="color:var(--ink);font-family:var(--serif);font-size:1.25rem">DrPlusz</strong>
      <p>Független egészségügyi termékmagazin. Nem egészségügyi szolgáltató és nem magánrendelő. Nincs kapcsolatban a székesfehérvári Doktor Plusz Magánorvosi Központtal (doktorplusz.com).</p>
      <nav aria-label="Lábléc">
        <a href="../index.html">Főoldal</a><a href="../cikkek/index.html" aria-current="page">Cikkek</a><a href="../tesztek/d-vitamin-formak.html">Összehasonlítás</a><a href="../impresszum.html">Impresszum</a><a href="../adatkezeles.html">Adatkezelés</a>
      </nav>
      <p class="note">${esc(meta.datumSzoveg)} · Az oldalon szereplő amerikai és európai intézeti számok nem magyar kezelési előírások.</p>
    </div>
  </footer>
</body>
</html>
`;
}

function replaceCount(html, db) {
  return html.replace(/(\d+) írás/, db + " írás");
}

function updateHome(html, d, meta, db) {
  if (!html.includes('<ul class="home-list">')) die("A címlapon nem találom a cikklistát.");
  html = html.replace(
    /<p class="issue"><span>Legutóbbi írás: [^<]+<\/span><span>\d+ írás<\/span><\/p>/,
    `<p class="issue"><span>Legutóbbi írás: ${meta.datumSzoveg}</span><span>${db} írás</span></p>`
  );
  const hero = `      <section class="cover" aria-label="Címlap">
        <a class="cover-hero" href="cikkek/${meta.slug}.html">
          <img src="img/cover/${esc(meta.fotoNev)}" alt="${esc(meta.fotoAlt)}">
          <div class="cover-hero-copy">
            <p class="kicker">Legutóbbi írás · ${esc(d.kicker)}</p>
            <p class="meta"><time datetime="${meta.iso}">${esc(meta.datumSzoveg)}</time></p>
            <h1>${esc(d.cim)}</h1>
            <p class="dek">${esc(d.dek)}</p>
            <p class="credit">Fotó: <a href="${esc(meta.fotoUrl)}">${esc(meta.fotoCredit)}</a>. Ugyanaz a kép, mint a cikkben.</p>
          </div>
        </a>
      </section>`;
  if (!/<section class="cover"[\s\S]*?<\/section>/.test(html)) die("A címlap borítóját nem találom.");
  html = html.replace(/<section class="cover"[\s\S]*?<\/section>/, hero);
  const li = `          <li><time datetime="${meta.iso}">${esc(meta.datumSzoveg)}</time> · <a href="cikkek/${meta.slug}.html">${esc(d.cim)}</a></li>\n`;
  html = html.replace("<ul class=\"home-list\">\n", "<ul class=\"home-list\">\n" + li);
  return html;
}

function updateCatalog(html, d, meta, db) {
  html = replaceCount(html, db);
  const row = `        <article class="arow" data-title="${esc(d.kicker + " " + d.cim)}">
      <a class="block" href="${meta.slug}.html">
        <img src="../img/cover/${esc(meta.fotoNev)}" alt="${esc(meta.fotoAlt)}">
        <div class="pad"><p class="kicker">${esc(d.kicker)} · <time datetime="${meta.iso}">${esc(meta.datumSzoveg)}</time></p><h3>${esc(d.cim)}</h3></div>
      </a>
    </article>
`;
  const needle = '<div class="alist" id="lista">\n';
  if (!html.includes(needle)) die("A cikklistában nem találom a beszúrás helyét.");
  return html.replace(needle, needle + row);
}

function updateImpresszum(html, datumSzoveg) {
  if (!html.includes("A legutóbbi dátuma")) return html;
  return html.replace(/A legutóbbi dátuma [^<]+/, "A legutóbbi dátuma " + datumSzoveg);
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.help || Object.keys(a).length === 0) {
    usage();
    process.exit(a.help ? 0 : 1);
  }
  const kerdes = (a.kerdes || "").trim();
  if (kerdes.length < 8) die("A kérdés túl rövid.");
  if (/^(teszt|test|placeholder|fake|todo|asdf|xxx)\b/i.test(kerdes)) die("Helykitöltő kérdésre nem készül cikk.");
  for (const k of ["forras", "foto", "foto-alt", "foto-url", "foto-credit"]) {
    if (!a[k] || !String(a[k]).trim()) die("Hiányzik: --" + k);
  }
  const foto = resolve(a.foto);
  if (!existsSync(foto)) die("A fénykép nem található: " + foto);
  const ext = extname(foto).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) die("A fénykép jpg, png vagy webp legyen.");
  let fotoUrl;
  try { fotoUrl = new URL(a["foto-url"]); } catch { die("A fénykép forrás-URL-je nem érvényes."); }
  if (fotoUrl.protocol !== "https:") die("A fénykép forrása csak https lehet.");

  const source = await fetchSource(a.forras.trim());
  const draft = await draftWithModel(kerdes, (a.cim || "").trim(), source);
  requireStrings(draft);
  assertNumbers(draft, source.text);

  const when = todayBudapest();
  const slug = slugify(a.cim || draft.cim);
  if (!slug) die("A címből nem lett fájlnév.");
  const fotoNev = slug + (ext === ".jpeg" ? ".jpg" : ext);
  const cikkUtvonal = join(ROOT, "cikkek", slug + ".html");
  const fotoCel = join(ROOT, "img", "cover", fotoNev);
  if (existsSync(cikkUtvonal) || existsSync(fotoCel)) die("Már van ilyen cikk vagy borítókép. Régit nem írok felül: " + slug);

  const homePath = join(ROOT, "index.html");
  const catalogPath = join(ROOT, "cikkek", "index.html");
  const impresszumPath = join(ROOT, "impresszum.html");
  const home = readFileSync(homePath, "utf8");
  const current = Number((home.match(/(\d+) írás/) || [])[1]);
  if (!current) die("Nem találom a cikkek számát a címlapon.");
  const db = current + 1;
  const meta = {
    slug, fotoNev, fotoAlt: a["foto-alt"].trim(), fotoUrl: fotoUrl.href,
    fotoCredit: a["foto-credit"].trim(), forrasUrl: source.url,
    iso: when.iso, datumSzoveg: when.szoveg,
  };

  const homeNext = updateHome(home, draft, meta, db);
  const catalogNext = updateCatalog(readFileSync(catalogPath, "utf8"), draft, meta, db);
  const impresszumNext = updateImpresszum(readFileSync(impresszumPath, "utf8"), when.szoveg);
  const cikk = articleHtml(draft, meta);

  mkdirSync(join(ROOT, "admin", "kerdesek"), { recursive: true });
  const kerdesFajl = join(ROOT, "admin", "kerdesek", when.iso + "-" + slug + ".json");
  copyFileSync(foto, fotoCel);
  writeFileSync(cikkUtvonal, cikk);
  writeFileSync(homePath, homeNext);
  writeFileSync(catalogPath, catalogNext);
  writeFileSync(impresszumPath, impresszumNext);
  writeFileSync(kerdesFajl, JSON.stringify({ kerdes, cim: draft.cim, forras: source.url, ido: new Date().toISOString() }, null, 2) + "\n");
  console.log("Kész: cikkek/" + slug + ".html");
  console.log("Borító: img/cover/" + fotoNev);
  console.log("Cikkek száma: " + db);
}

main().catch((err) => die(err && err.message ? err.message : String(err)));
