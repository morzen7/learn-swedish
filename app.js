(() => {
  "use strict";

  const STORE_KEY = "svensk-ragozas-v1";
  const MAX_LEVEL = 6;
  const HIDE_BASE_LEVEL = 3;              // ettől a szinttől csak a magyar jelentés látszik
  const WEIGHTS = [12, 7, 4, 2.2, 1.2, 0.6, 0.3]; // húzási súly szintenként
  const NEW_WEIGHT = 6;                   // még nem látott szó súlya
  const RELEARN_GAP = 3;                  // hibás szó ennyi kártya múlva újra jön
  const NONE = "—";

  const VERB_FIELDS = [
    { key: "inf", label: "Infinitiv", base: true },
    { key: "imp", label: "Imperativ" },
    { key: "pres", label: "Presens" },
    { key: "pret", label: "Preteritum" },
    { key: "sup", label: "Supinum" },
  ];
  const ADJ_FIELDS = [
    { key: "en", label: "En-ord (positiv)", base: true },
    { key: "ett", label: "Ett-ord" },
    { key: "pl", label: "Plural" },
    { key: "komp", label: "Komparativ" },
    { key: "sup", label: "Superlativ" },
    { key: "supb", label: "Superlativ (best.)" },
  ];
  const GROUP_LABEL = { stark: "Stark verb", oregelbunden: "Oregelbundet verb", övrig: "Verb" };

  // ---------- állapot ----------
  const defaultState = () => ({
    progress: {},   // id -> {level, seen, correct, wrong, last}
    custom: [],     // importált szavak
    settings: { stark: true, oregel: true, ovrig: true, adj: true },
    stats: { answered: 0, perfect: 0 },
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* üres vagy hibás tár */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {
      console.warn("Nem sikerült menteni", e);
    }
  }

  // ---------- szavak ----------
  function verbFromRow(r, source) {
    return {
      id: "v:" + r[0].toLowerCase(), type: "verb", source,
      group: r[6] || "övrig", hu: r[5],
      forms: { inf: r[0], imp: r[1], pres: r[2], pret: r[3], sup: r[4] },
    };
  }
  function adjFromRow(r, source) {
    return {
      id: "a:" + r[0].toLowerCase(), type: "adj", source, hu: r[6],
      forms: { en: r[0], ett: r[1], pl: r[2], komp: r[3], sup: r[4], supb: r[5] },
    };
  }

  let WORDS = [];
  function buildWords() {
    const map = new Map();
    (window.BUILTIN_VERBS || []).forEach(r => { const w = verbFromRow(r, "builtin"); map.set(w.id, w); });
    (window.BUILTIN_ADJECTIVES || []).forEach(r => { const w = adjFromRow(r, "builtin"); map.set(w.id, w); });
    state.custom.forEach(c => {
      const w = c.type === "verb" ? verbFromRow(c.row, "custom") : adjFromRow(c.row, "custom");
      map.set(w.id, w);
    });
    WORDS = [...map.values()];
  }
  const fieldsOf = w => (w.type === "verb" ? VERB_FIELDS : ADJ_FIELDS);
  const baseOf = w => (w.type === "verb" ? w.forms.inf : w.forms.en);
  const prog = id => state.progress[id] || { level: 0, seen: 0, correct: 0, wrong: 0, last: 0 };

  // ---------- válasz ellenőrzés ----------
  const norm = s => (s || "").toLowerCase().normalize("NFC")
    .replace(/[!.,]/g, "").replace(/\s+/g, " ").trim();
  const isNone = s => /^(—|–|-|)$/.test((s || "").trim());
  const stripDia = s => s.replace(/[åä]/g, "a").replace(/ö/g, "o");

  function alternatives(expected) {
    const alts = expected.split("/").map(norm).filter(Boolean);
    alts.push(norm(expected));
    return alts;
  }
  function check(field, given, expected) {
    let g = norm(given);
    if (field === "inf") g = g.replace(/^att /, "");
    const alts = alternatives(expected);
    if (alts.includes(g)) return { ok: true };
    const diacritic = g && alts.some(a => stripDia(a) === stripDia(g));
    return { ok: false, diacritic };
  }

  // ---------- húzás ----------
  let current = null, answered = false, history = [], relearn = [], session = { n: 0, ok: 0 };

  function activeWords() {
    const s = state.settings;
    return WORDS.filter(w => w.type === "adj" ? s.adj
      : w.group === "stark" ? s.stark
      : w.group === "oregelbunden" ? s.oregel : s.ovrig);
  }
  function pick() {
    const pool = activeWords();
    if (!pool.length) return null;
    // hibás szavak visszahozása
    for (const r of relearn) r.wait--;
    const dueIdx = relearn.findIndex(r => r.wait <= 0 && pool.some(w => w.id === r.id));
    if (dueIdx >= 0) {
      const id = relearn.splice(dueIdx, 1)[0].id;
      return pool.find(w => w.id === id);
    }
    const recent = new Set(history.slice(-Math.min(4, pool.length - 1)));
    const cands = pool.filter(w => !recent.has(w.id));
    const weights = cands.map(w => {
      const p = state.progress[w.id];
      return p ? WEIGHTS[p.level] : NEW_WEIGHT;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }

  // ---------- kártya ----------
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(k => n.append(k));
    return n;
  };

  function next() {
    current = pick();
    answered = false;
    $("#c-feedback").hidden = true;
    const fieldsBox = $("#c-fields");
    fieldsBox.innerHTML = "";
    if (!current) {
      $("#c-kind").textContent = "";
      $("#c-level").textContent = "";
      $("#c-meaning").textContent = "Nincs kiválasztott szócsoport.";
      $("#c-prompt").textContent = "Pipálj be legalább egyet fent.";
      $("#c-submit").disabled = true;
      return;
    }
    $("#c-submit").disabled = false;
    $("#c-submit").innerHTML = "Ellenőrzés <kbd>Enter</kbd>";
    history.push(current.id);
    const p = prog(current.id);
    const hideBase = p.level >= HIDE_BASE_LEVEL;
    $("#c-kind").textContent = current.type === "verb" ? GROUP_LABEL[current.group] || "Verb" : "Adjektiv";
    $("#c-level").innerHTML = "";
    $("#c-level").append(levelDots(state.progress[current.id] ? p.level : -1));
    $("#c-meaning").textContent = current.hu;
    $("#c-prompt").textContent = hideBase ? "?" : (current.type === "verb" ? "att " : "") + baseOf(current);
    $("#c-prompt").classList.toggle("hidden-base", hideBase);

    fieldsOf(current).forEach(f => {
      if (f.base && !hideBase) return;
      const exp = current.forms[f.key];
      const na = isNone(exp);
      const id = "fld-" + f.key;
      const input = el("input", {
        id, "data-key": f.key, type: "text", autocapitalize: "off", autocorrect: "off",
        disabled: na, placeholder: na ? "nincs ilyen alak" : (f.base && current.type === "verb" ? "att …" : ""),
      });
      fieldsBox.append(el("div", { class: "field" + (na ? " na" : "") + (f.base ? " base" : "") },
        el("label", { for: id, text: f.label }), input, el("div", { class: "correct" })));
    });
    const first = fieldsBox.querySelector("input:not([disabled])");
    if (first) first.focus();
    renderSession();
  }

  function levelDots(level) {
    const box = el("span", { class: "dots", title: level < 0 ? "új szó" : `szint: ${level}/${MAX_LEVEL}` });
    if (level < 0) { box.append(el("span", { class: "new", text: "új" })); return box; }
    for (let i = 1; i <= MAX_LEVEL; i++) box.append(el("i", { class: i <= level ? "on" : "" }));
    return box;
  }

  function submit() {
    if (!current) return;
    if (answered) { next(); return; }
    answered = true;
    let wrong = 0, total = 0;
    document.querySelectorAll("#c-fields .field").forEach(div => {
      const input = div.querySelector("input");
      const key = input.dataset.key;
      const exp = current.forms[key];
      if (isNone(exp)) return;
      total++;
      const res = check(key, input.value, exp);
      input.readOnly = true;
      div.classList.add(res.ok ? "ok" : "bad");
      if (!res.ok) {
        wrong++;
        const c = div.querySelector(".correct");
        c.textContent = (key === "inf" ? "att " : "") + exp.replace(/\//g, " / ");
        if (res.diacritic) c.append(el("span", { class: "note", text: " (ékezet!)" }));
      }
    });

    const p = Object.assign({}, prog(current.id));
    const before = state.progress[current.id] ? p.level : null;
    p.seen++; p.last = Date.now();
    if (wrong === 0) { p.correct++; p.level = Math.min(MAX_LEVEL, p.level + 1); }
    else {
      p.wrong++;
      p.level = wrong >= 2 ? 0 : Math.max(0, p.level - 2);
      relearn = relearn.filter(r => r.id !== current.id);
      relearn.push({ id: current.id, wait: RELEARN_GAP });
    }
    state.progress[current.id] = p;
    state.stats.answered++; if (!wrong) state.stats.perfect++;
    session.n++; if (!wrong) session.ok++;
    save();

    const fb = $("#c-feedback");
    fb.hidden = false;
    fb.className = "feedback " + (wrong ? "bad" : "ok");
    let msg = wrong ? `${wrong} / ${total} hibás – hamarosan újra előjön.` : "Minden alak helyes!";
    if (before !== null && p.level !== before) msg += ` Szint: ${before} → ${p.level}.`;
    else if (before === null) msg += ` Szint: ${p.level}.`;
    if (wrong === 0 && p.level === HIDE_BASE_LEVEL && (before ?? 0) < HIDE_BASE_LEVEL)
      msg += " Mostantól csak a magyar jelentést látod.";
    $("#c-prompt").textContent = (current.type === "verb" ? "att " : "") + baseOf(current);
    $("#c-prompt").classList.remove("hidden-base");
    $("#c-level").innerHTML = "";
    $("#c-level").append(levelDots(p.level));
    fb.textContent = msg;
    $("#c-submit").innerHTML = "Következő <kbd>Enter</kbd>";
    $("#c-submit").focus();
    renderSession();
  }

  function renderSession() {
    $("#session").textContent = session.n
      ? `Ebben a körben: ${session.ok} / ${session.n} hibátlan`
      : `${activeWords().length} szó a gyakorlásban`;
  }

  // ---------- svéd betűk ----------
  let lastInput = null;
  document.addEventListener("focusin", e => {
    if (e.target.matches("#c-fields input")) lastInput = e.target;
  });
  document.querySelectorAll(".letter").forEach(b => b.addEventListener("mousedown", e => {
    e.preventDefault();
    const inp = document.activeElement?.matches?.("#c-fields input") ? document.activeElement : lastInput;
    if (!inp || inp.readOnly || inp.disabled) return;
    const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
    inp.value = inp.value.slice(0, s) + b.dataset.l + inp.value.slice(en);
    inp.setSelectionRange(s + 1, s + 1);
    inp.focus();
  }));
  $("#c-fields").addEventListener("input", e => {
    const inp = e.target;
    const before = inp.value;
    const after = before.replace(/a:/g, "ä").replace(/o:/g, "ö").replace(/aa/g, "å")
      .replace(/A:/g, "Ä").replace(/O:/g, "Ö");
    if (after !== before) {
      const pos = inp.selectionStart - (before.length - after.length);
      inp.value = after; inp.setSelectionRange(pos, pos);
    }
  });

  $("#c-form").addEventListener("submit", e => { e.preventDefault(); submit(); });
  $("#c-fields").addEventListener("keydown", e => {
    // Enter a köztes mezőkben a következő mezőre ugrik, az utolsóban ellenőriz
    if (e.key !== "Enter" || answered) return;
    const inputs = [...document.querySelectorAll("#c-fields input:not([disabled])")];
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); }
  });
  $("#c-skip").addEventListener("click", () => next());

  // ---------- szűrők ----------
  const FILTERS = { "#f-stark": "stark", "#f-oregel": "oregel", "#f-ovrig": "ovrig", "#f-adj": "adj" };
  for (const [sel, key] of Object.entries(FILTERS)) {
    const box = $(sel);
    box.checked = state.settings[key] !== false;
    box.addEventListener("change", () => { state.settings[key] = box.checked; save(); relearn = []; next(); });
  }

  // ---------- fülek ----------
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + t.dataset.tab));
    if (t.dataset.tab === "words") renderWords();
    if (t.dataset.tab === "stats") renderStats();
    if (t.dataset.tab === "practice") { const f = document.querySelector("#c-fields input:not([disabled]):not([readonly])"); if (f) f.focus(); }
  }));

  // ---------- szólista ----------
  function renderWords() {
    const q = norm($("#w-search").value), filt = $("#w-filter").value;
    const rows = WORDS.filter(w =>
      (filt === "all" || (filt === "custom" ? w.source === "custom" : w.type === filt)) &&
      (!q || norm(Object.values(w.forms).join(" ") + " " + w.hu).includes(q)))
      .sort((a, b) => a.type.localeCompare(b.type) || baseOf(a).localeCompare(baseOf(b), "sv"));
    const t = $("#w-table");
    t.innerHTML = "";
    const verbs = rows.filter(w => w.type === "verb"), adjs = rows.filter(w => w.type === "adj");
    const section = (title, list, fields) => {
      if (!list.length) return;
      t.append(el("tr", { class: "sect" }, el("th", { colspan: fields.length + 3, text: `${title} (${list.length})` })));
      t.append(el("tr", {}, fields.map(f => el("th", { text: f.label })), el("th", { text: "Magyar" }), el("th", { text: "Szint" }), el("th")));
      list.forEach(w => {
        const p = state.progress[w.id];
        const del = w.source === "custom" ? el("button", { class: "link", text: "törlés", title: "Saját szó törlése" }) : "";
        if (del) del.addEventListener("click", () => {
          if (!confirm(`Törlöd: ${baseOf(w)}?`)) return;
          state.custom = state.custom.filter(c => (c.type === "verb" ? "v:" : "a:") + c.row[0].toLowerCase() !== w.id);
          save(); buildWords(); renderWords();
        });
        t.append(el("tr", {},
          fields.map(f => el("td", { text: w.forms[f.key] })),
          el("td", { text: w.hu }),
          el("td", {}, levelDots(p ? p.level : -1)),
          el("td", {}, w.type === "verb" ? el("span", { class: "tag", text: w.source === "custom" ? "saját" : w.group }) : (w.source === "custom" ? el("span", { class: "tag", text: "saját" }) : ""), del)));
      });
    };
    section("Igék", verbs, VERB_FIELDS);
    section("Melléknevek", adjs, ADJ_FIELDS);
    if (!rows.length) t.append(el("tr", {}, el("td", { text: "Nincs találat." })));
  }
  $("#w-search").addEventListener("input", renderWords);
  $("#w-filter").addEventListener("change", renderWords);

  // ---------- import ----------
  function parseImport(text) {
    const ok = [], errors = [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim() || line.trim().startsWith("#")) return;
      const parts = line.split(/\t|;/).map(s => s.trim());
      const kind = norm(parts.shift());
      const fix = s => isNone(s) ? NONE : s;
      if (["ige", "verb", "v"].includes(kind)) {
        if (parts.length < 6) return errors.push(`${i + 1}. sor: igénél 6 mező kell (infinitiv … magyar), ${parts.length} van.`);
        const inf = parts[0].replace(/^att\s+/i, "");
        const group = norm(parts[6] || "övrig");
        const g = group.startsWith("stark") ? "stark" : group.startsWith("oregel") ? "oregelbunden" : "övrig";
        ok.push({ type: "verb", row: [inf, fix(parts[1]), fix(parts[2]), fix(parts[3]), fix(parts[4]), parts[5], g] });
      } else if (["mn", "adj", "a", "melléknév"].includes(kind)) {
        if (parts.length < 7) return errors.push(`${i + 1}. sor: melléknévnél 7 mező kell (en … magyar), ${parts.length} van.`);
        ok.push({ type: "adj", row: [parts[0], ...parts.slice(1, 6).map(fix), parts[6]] });
      } else {
        errors.push(`${i + 1}. sor: az első mező "ige" vagy "mn" legyen.`);
      }
    });
    return { ok, errors };
  }
  let pending = null;
  $("#i-preview").addEventListener("click", () => {
    const { ok, errors } = parseImport($("#i-text").value);
    pending = ok;
    const box = $("#i-result");
    box.innerHTML = "";
    if (errors.length) box.append(el("div", { class: "errors" }, errors.map(e => el("div", { text: e }))));
    if (ok.length) {
      const existing = new Set(WORDS.map(w => w.id));
      const tbl = el("table", { class: "preview" });
      ok.forEach(c => {
        const id = (c.type === "verb" ? "v:" : "a:") + c.row[0].toLowerCase();
        tbl.append(el("tr", {}, el("td", { text: c.type === "verb" ? "ige" : "mn" }),
          c.row.map(v => el("td", { text: v })),
          el("td", {}, existing.has(id) ? el("span", { class: "tag", text: "felülír" }) : el("span", { class: "tag new", text: "új" }))));
      });
      const btn = el("button", { class: "primary", text: `${ok.length} szó mentése` });
      btn.addEventListener("click", () => {
        pending.forEach(c => {
          const id = (c.type === "verb" ? "v:" : "a:") + c.row[0].toLowerCase();
          state.custom = state.custom.filter(x => (x.type === "verb" ? "v:" : "a:") + x.row[0].toLowerCase() !== id);
          state.custom.push(c);
        });
        save(); buildWords();
        box.innerHTML = "";
        box.append(el("div", { class: "feedback ok", text: `${pending.length} szó elmentve. A Szavak fülön látod őket.` }));
        $("#i-text").value = ""; pending = null;
      });
      box.append(el("div", { class: "tablewrap" }, tbl), el("div", { class: "actions left" }, btn));
    }
  });
  $("#i-example").addEventListener("click", () => {
    $("#i-text").value = "ige; tala; tala; talar; talade; talat; beszél\n" +
      "ige; att springa; spring; springer; sprang; sprungit; fut; stark\n" +
      "mn; varm; varmt; varma; varmare; varmast; varmaste; meleg";
  });

  // ---------- haladás ----------
  function renderStats() {
    const all = WORDS.length;
    const seen = WORDS.filter(w => state.progress[w.id]).length;
    const hidden = WORDS.filter(w => (state.progress[w.id]?.level ?? 0) >= HIDE_BASE_LEVEL).length;
    const acc = state.stats.answered ? Math.round(100 * state.stats.perfect / state.stats.answered) : 0;
    const s = $("#s-summary"); s.innerHTML = "";
    [["Összes szó", all], ["Már gyakorolt", seen], [`Szint ≥ ${HIDE_BASE_LEVEL}`, hidden], ["Hibátlan válaszok", acc + "%"]]
      .forEach(([k, v]) => s.append(el("div", { class: "stat" }, el("b", { text: v }), el("span", { text: k }))));
    const counts = Array(MAX_LEVEL + 2).fill(0);
    WORDS.forEach(w => { const p = state.progress[w.id]; counts[p ? p.level + 1 : 0]++; });
    const lv = $("#s-levels"); lv.innerHTML = "";
    const max = Math.max(...counts, 1);
    counts.forEach((c, i) => lv.append(el("div", { class: "lvl" },
      el("span", { class: "lname", text: i === 0 ? "új" : `${i - 1}.` }),
      el("span", { class: "bar" }, el("i", { style: `width:${(100 * c / max).toFixed(1)}%` })),
      el("span", { class: "lcount", text: c }))));
    const hard = WORDS.filter(w => state.progress[w.id]?.wrong)
      .sort((a, b) => state.progress[b.id].wrong - state.progress[a.id].wrong).slice(0, 12);
    const h = $("#s-hard"); h.innerHTML = "";
    if (!hard.length) h.append(el("p", { class: "muted", text: "Még nincs hibás válasz." }));
    else h.append(el("div", { class: "hardlist" }, hard.map(w =>
      el("span", { class: "hard" }, el("b", { text: baseOf(w) }), ` ${state.progress[w.id].wrong}× · `, w.hu))));
  }

  $("#b-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "svensk-ragozas", version: 1, saved: new Date().toISOString(), state }, null, 1)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `svensk-mentes-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  });
  $("#b-import").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.state || !data.state.progress) throw new Error("ismeretlen formátum");
      if (!confirm("Felülírod a jelenlegi haladást a fájl tartalmával?")) return;
      state = Object.assign(defaultState(), data.state);
      save(); buildWords(); renderStats(); next();
      alert("Visszatöltve.");
    } catch (err) { alert("Nem sikerült beolvasni: " + err.message); }
    e.target.value = "";
  });
  $("#b-reset").addEventListener("click", () => {
    if (!confirm("Biztosan nullázod a haladást? A saját szavak megmaradnak.")) return;
    state.progress = {}; state.stats = { answered: 0, perfect: 0 };
    save(); relearn = []; renderStats(); next();
  });

  buildWords();
  next();
})();
