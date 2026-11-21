/* Inköpslista – läser list.json, bockar sparas i localStorage på telefonen. */
(function () {
  "use strict";

  var ORDER = ["Frukt och grönt", "Bröd", "Kött", "Mejeri", "Frys", "Skafferi"];
  var PREFIX = "inkopslista:";
  var main = document.getElementById("main");
  var titleEl = document.getElementById("title");
  var countEl = document.getElementById("count");
  var barEl = document.getElementById("bar-fill");
  var resetBtn = document.getElementById("reset");

  var storageKey = null;
  var checked = {};
  var total = 0;
  var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV_SVG = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function norm(s) { return String(s == null ? "" : s).trim(); }
  function lower(s) { return norm(s).toLocaleLowerCase("sv"); }

  // Stabil signatur (FNV-1a) av listans innehåll: varor + middagens dag och namn.
  // Recept ingår medvetet inte, så tillagda recept inte nollställer bockarna.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  function weekLabel(week) {
    var m = /^(\d{4})-W(\d{1,2})$/.exec(norm(week));
    return m ? "Vecka " + parseInt(m[2], 10) : norm(week);
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(checked)); } catch (e) {}
  }
  function cleanupOld() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0 && k !== storageKey) localStorage.removeItem(k);
      }
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function textList(v) {
    if (!Array.isArray(v)) return [];
    return v.map(norm).filter(Boolean);
  }

  // Valfritt recept: minst ett av time, servings, ingredients eller steps
  // måste ge visningsbart innehåll. All text normaliseras (trim) och
  // tomma rader hoppas över. Returnerar null om receptet saknas eller är oanvändbart.
  function parseRecipe(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    var time = norm(r.time);
    var servings = formatServings(r.servings);
    var ingredients = textList(r.ingredients);
    var steps = textList(r.steps);
    if (!time && !servings && !ingredients.length && !steps.length) return null;
    return { time: time, servings: servings, ingredients: ingredients, steps: steps };
  }

  function formatServings(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number") {
      return isFinite(v) ? String(v) + " portioner" : "";
    }
    var s = norm(v);
    if (!s) return "";
    if (/^\d+([.,]\d+)?$/.test(s)) return s + " portioner";
    return s;
  }

  function orderSections(sections) {
    var known = [], unknown = [];
    sections.forEach(function (s) {
      var idx = ORDER.findIndex(function (n) { return lower(n) === lower(s.name); });
      if (idx >= 0) known.push({ s: s, i: idx }); else unknown.push(s);
    });
    known.sort(function (a, b) { return a.i - b.i; });
    return known.map(function (k) { return k.s; }).concat(unknown);
  }

  function updateProgress() {
    var n = 0;
    Object.keys(checked).forEach(function (k) { if (checked[k]) n++; });
    countEl.textContent = n + " av " + total + " klara";
    barEl.style.width = total ? (100 * n / total) + "%" : "0";
    var done = document.getElementById("all-done");
    if (done) done.hidden = !(total && n >= total);
  }

  // Avbockade längst ner i sin egen avdelning, annars ursprunglig ordning.
  function sortSection(ul) {
    var lis = Array.prototype.slice.call(ul.children);
    lis.sort(function (a, b) {
      var ca = checked[a.dataset.id] ? 1 : 0, cb = checked[b.dataset.id] ? 1 : 0;
      return ca - cb || a.dataset.pos - b.dataset.pos;
    });
    lis.forEach(function (li) { ul.appendChild(li); });
  }

  function updateSectionCount(sec) {
    var lis = sec.querySelectorAll(".items > li");
    var n = 0;
    lis.forEach(function (li) { if (checked[li.dataset.id]) n++; });
    sec.querySelector("h2 small").textContent = n + "/" + lis.length;
  }

  function closeRecipes(ul, except) {
    ul.querySelectorAll(".meal-toggle[aria-expanded='true']").forEach(function (t) {
      if (t === except) return;
      t.setAttribute("aria-expanded", "false");
      var id = t.getAttribute("aria-controls");
      var body = id && document.getElementById(id);
      if (body) body.hidden = true;
    });
  }

  function renderRecipe(recipe) {
    var body = el("div", "recipe");
    if (recipe.time || recipe.servings) {
      var meta = el("p", "recipe-meta");
      if (recipe.time) {
        var t = el("span", "recipe-time");
        t.appendChild(el("span", "recipe-label", "Tid"));
        t.appendChild(document.createTextNode(" " + recipe.time));
        meta.appendChild(t);
      }
      if (recipe.servings) meta.appendChild(el("span", "recipe-servings", recipe.servings));
      body.appendChild(meta);
    }
    if (recipe.ingredients.length) {
      body.appendChild(el("h3", null, "Ingredienser"));
      var ings = el("ul", "recipe-ings");
      recipe.ingredients.forEach(function (line) { ings.appendChild(el("li", null, line)); });
      body.appendChild(ings);
    }
    if (recipe.steps.length) {
      body.appendChild(el("h3", null, "Gör så här"));
      var steps = el("ol", "recipe-steps");
      recipe.steps.forEach(function (line) { steps.appendChild(el("li", null, line)); });
      body.appendChild(steps);
    }
    return body;
  }

  function renderMeals(meals) {
    var wrap = el("section", "meals");
    var btn = el("button", "meals-toggle");
    btn.type = "button";
    btn.id = "meals-toggle";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "meals-list");
    btn.appendChild(el("span", null, "Veckans middagar"));
    btn.insertAdjacentHTML("beforeend", CHEV_SVG);
    var ul = el("ul", "meals-list");
    ul.id = "meals-list";
    ul.hidden = true;
    meals.forEach(function (m, i) {
      var li = el("li");
      var recipe = parseRecipe(m.recipe);
      if (!recipe) {
        if (norm(m.day)) li.appendChild(el("span", "day", norm(m.day)));
        li.appendChild(el("span", "meal", norm(m.name)));
        ul.appendChild(li);
        return;
      }
      li.className = "has-recipe";
      var toggle = el("button", "meal-toggle");
      toggle.type = "button";
      var recId = "recipe-" + i;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", recId);
      if (norm(m.day)) toggle.appendChild(el("span", "day", norm(m.day)));
      toggle.appendChild(el("span", "meal", norm(m.name)));
      toggle.insertAdjacentHTML("beforeend", CHEV_SVG);
      var body = renderRecipe(recipe);
      body.id = recId;
      body.hidden = true;
      toggle.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var open = toggle.getAttribute("aria-expanded") === "true";
        closeRecipes(ul, toggle);
        toggle.setAttribute("aria-expanded", String(!open));
        body.hidden = open;
      });
      li.appendChild(toggle);
      li.appendChild(body);
      ul.appendChild(li);
    });
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      ul.hidden = open;
    });
    wrap.appendChild(btn);
    wrap.appendChild(ul);
    return wrap;
  }

  function render(data) {
    var sections = (Array.isArray(data.sections) ? data.sections : [])
      .filter(function (s) { return s && norm(s.name) && Array.isArray(s.items); })
      .map(function (s) {
        return { name: norm(s.name), items: s.items.filter(function (it) { return it && norm(it.name); }) };
      })
      .filter(function (s) { return s.items.length; });
    var meals = (Array.isArray(data.meals) ? data.meals : []).filter(function (m) { return m && norm(m.name); });

    var sig = hash(JSON.stringify({
      s: sections.map(function (s) { return [s.name, s.items.map(function (i) { return [norm(i.name), norm(i.qty)]; })]; }),
      m: meals.map(function (m) { return [norm(m.day), norm(m.name)]; })
    }));
    storageKey = PREFIX + norm(data.week) + ":" + sig;
    cleanupOld();
    checked = load();

    var label = weekLabel(data.week);
    titleEl.textContent = "Inköpslista" + (label ? " · " + label : "");
    document.title = titleEl.textContent;

    main.innerHTML = "";
    if (meals.length) main.appendChild(renderMeals(meals));

    total = 0;
    var valid = {};
    orderSections(sections).forEach(function (s, si) {
      var sec = el("section", "section");
      sec.dataset.name = s.name;
      var h = el("h2");
      h.id = "sec-" + si;
      h.appendChild(el("span", null, s.name));
      h.appendChild(el("small"));
      var ul = el("ul", "items");
      ul.setAttribute("aria-labelledby", h.id);
      s.items.forEach(function (it, ii) {
        var id = s.name + "|" + ii + "|" + norm(it.name);
        valid[id] = true;
        total++;
        var li = el("li");
        li.dataset.id = id;
        li.dataset.pos = ii;
        var b = el("button", "item");
        b.type = "button";
        b.setAttribute("role", "checkbox");
        b.setAttribute("aria-checked", checked[id] ? "true" : "false");
        var box = el("span", "box");
        box.innerHTML = CHECK_SVG;
        b.appendChild(box);
        b.appendChild(el("span", "name", norm(it.name)));
        if (norm(it.qty)) b.appendChild(el("span", "qty", norm(it.qty)));
        b.addEventListener("click", function () {
          if (checked[id]) delete checked[id]; else checked[id] = true;
          b.setAttribute("aria-checked", checked[id] ? "true" : "false");
          save();
          sortSection(ul);
          b.focus({ preventScroll: true });
          updateSectionCount(sec);
          updateProgress();
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
      sec.appendChild(h);
      sec.appendChild(ul);
      main.appendChild(sec);
      sortSection(ul);
      updateSectionCount(sec);
    });
    Object.keys(checked).forEach(function (k) { if (!valid[k]) delete checked[k]; });

    if (!total) {
      main.appendChild(el("p", "status", "Listan är tom."));
    } else {
      var done = el("p", "all-done", "Allt är klart! 🎉");
      done.id = "all-done";
      done.hidden = true;
      main.appendChild(done);
    }
    updateProgress();
  }

  resetBtn.addEventListener("click", function () {
    checked = {};
    try { localStorage.removeItem(storageKey); } catch (e) {}
    document.querySelectorAll(".item").forEach(function (b) { b.setAttribute("aria-checked", "false"); });
    document.querySelectorAll(".section").forEach(function (sec) {
      sortSection(sec.querySelector(".items"));
      updateSectionCount(sec);
    });
    updateProgress();
  });

  function setHeaderHeight() {
    var h = document.querySelector(".top").offsetHeight;
    document.documentElement.style.setProperty("--header-h", h + "px");
  }
  window.addEventListener("resize", setHeaderHeight);
  setHeaderHeight();

  // list.json hämtas alltid färskt: no-store + unik query så att varken
  // webbläsar- eller CDN-cache kan ge en gammal lista. Ingen service worker.
  fetch("list.json?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) { render(data); setHeaderHeight(); })
    .catch(function (err) {
      main.innerHTML = "";
      var p = el("p", "status error", "Kunde inte läsa listan (" + err.message + "). Kontrollera nätet och ladda om sidan.");
      main.appendChild(p);
      countEl.textContent = "";
    });
})();
