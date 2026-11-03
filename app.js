(function () {
  var KEY = "admissionTracker.v1";
  var app = document.getElementById("app");
  var range = 30; // 7, 30, or 0 = all time
  var openSubjects = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = load();
  if (!state.done) state.done = {};

  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function shortDate(d) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function currentProgramme() {
    return PROGRAMMES.filter(function (p) { return p.id === state.prog; })[0];
  }
  function getSubjects() {
    return currentProgramme().subjects.map(function (id) {
      return { id: id, name: SUBJECTS[id].name, chapters: SUBJECTS[id].chapters };
    });
  }
  function isDone(sid, i) { return !!state.done[sid + "." + i]; }

  /* ---------- screens ---------- */

  function render() {
    if (!state.name) return nameScreen();
    if (!currentProgramme()) return progScreen();
    dashboard();
  }

  function nameScreen() {
    app.innerHTML =
      '<section class="card center"><h1>Welcome 👋</h1>' +
      "<p>First, what's your name?</p>" +
      '<form id="nameForm"><input id="n" type="text" maxlength="40" placeholder="Your name" autocomplete="given-name" required>' +
      '<button class="btn" type="submit">Continue</button></form></section>';
    var input = document.getElementById("n");
    input.focus();
    document.getElementById("nameForm").onsubmit = function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      state.name = v;
      save();
      render();
    };
  }

  function progScreen() {
    var cards = PROGRAMMES.map(function (p) {
      return '<button class="prog" data-prog="' + p.id + '"><b>' + esc(p.name) + "</b><span>" + esc(p.desc) + "</span></button>";
    }).join("");
    app.innerHTML =
      '<section class="card center"><h1>Nice to meet you, ' + esc(state.name) + "</h1>" +
      "<p>Which programme are you preparing for?</p>" +
      '<div class="progs">' + cards + "</div></section>";
  }

  function dashboard() {
    var p = currentProgramme();
    app.innerHTML =
      '<div class="top"><div><h1>Hi, ' + esc(state.name) + "</h1><p>" + esc(p.name) + "</p></div>" +
      '<div class="acts"><button class="btn ghost" data-act="change">Change programme</button>' +
      '<button class="btn ghost" data-act="reset">Reset all</button></div></div>' +
      '<div id="stats"></div><section class="card" id="syllabus"></section>';
    renderStats();
    renderSyllabus();
  }

  /* ---------- stats ---------- */

  function renderStats() {
    var subs = getSubjects();
    var total = 0, done = 0, today = 0, todayKey = dayKey(Date.now());
    subs.forEach(function (s) {
      s.chapters.forEach(function (c, i) {
        total++;
        var t = state.done[s.id + "." + i];
        if (t) { done++; if (dayKey(t) === todayKey) today++; }
      });
    });
    var pct = total ? Math.round((done / total) * 100) : 0;
    var C = 2 * Math.PI * 54;

    var bars = subs.map(function (s) {
      var d = s.chapters.filter(function (c, i) { return isDone(s.id, i); }).length;
      var sp = s.chapters.length ? Math.round((d / s.chapters.length) * 100) : 0;
      return '<button class="bar' + (d === s.chapters.length ? " full" : "") + '" data-s="' + s.id + '" title="' + sp + '% done. Click to open">' +
        '<span class="bl">' + esc(s.name) + '</span><span class="track"><span class="fill" style="width:' + sp + '%"></span></span>' +
        '<span class="bv">' + d + "/" + s.chapters.length + "</span></button>";
    }).join("");

    document.getElementById("stats").innerHTML =
      '<section class="card"><div class="summary">' +
      '<svg class="donut" viewBox="0 0 130 130" role="img" aria-label="' + pct + ' percent complete">' +
      '<circle cx="65" cy="65" r="54" fill="none" stroke="var(--accent-soft)" stroke-width="14"/>' +
      '<circle cx="65" cy="65" r="54" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" ' +
      'stroke-dasharray="' + (C * pct / 100) + " " + C + '" transform="rotate(-90 65 65)"/>' +
      '<text x="65" y="72" text-anchor="middle" font-size="26">' + pct + "%</text></svg>" +
      '<div class="nums"><div class="num"><b>' + done + "</b><span>Chapters done</span></div>" +
      '<div class="num"><b>' + (total - done) + "</b><span>Remaining</span></div>" +
      '<div class="num"><b>' + today + "</b><span>Done today</span></div></div></div></section>" +
      '<section class="card"><h2>By subject</h2>' + bars + "</section>" +
      '<section class="card"><div class="chart-head"><h2>Progress over time</h2><div class="seg">' +
      seg(7, "7 days") + seg(30, "30 days") + seg(0, "All time") + "</div></div>" +
      '<div class="readout" id="readout"></div><div id="tl"></div></section>';

    drawTimeline(subs, total);
  }

  function seg(v, label) {
    return '<button data-range="' + v + '" class="' + (range === v ? "on" : "") + '">' + label + "</button>";
  }

  function drawTimeline(subs, total) {
    var stamps = [];
    subs.forEach(function (s) {
      s.chapters.forEach(function (c, i) {
        var t = state.done[s.id + "." + i];
        if (t) stamps.push(t);
      });
    });

    var todayD = new Date(); todayD.setHours(0, 0, 0, 0);
    var n = range;
    if (range === 0) {
      var min = stamps.length ? Math.min.apply(null, stamps) : todayD.getTime();
      var first = new Date(min); first.setHours(0, 0, 0, 0);
      n = Math.max(7, Math.round((todayD - first) / 864e5) + 1);
    }

    var days = [];
    for (var k = n - 1; k >= 0; k--) {
      var d = new Date(todayD); d.setDate(d.getDate() - k);
      days.push(d);
    }
    var startMs = days[0].getTime();
    var cum = stamps.filter(function (t) { return t < startMs; }).length;
    var perDay = {};
    stamps.forEach(function (t) {
      if (t >= startMs) { var key = dayKey(t); perDay[key] = (perDay[key] || 0) + 1; }
    });
    var pts = days.map(function (d) {
      cum += perDay[dayKey(d)] || 0;
      return { d: d, v: cum };
    });

    var W = 600, H = 210, L = 34, R = 12, T = 12, B = 26;
    var iw = W - L - R, ih = H - T - B, max = Math.max(total, 1);
    function x(i) { return L + (n === 1 ? 0 : (i * iw) / (n - 1)); }
    function y(v) { return T + ih * (1 - v / max); }

    var line = pts.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.v).toFixed(1); }).join(" ");
    var area = L + "," + (T + ih) + " " + line + " " + x(n - 1).toFixed(1) + "," + (T + ih);

    var grid = [0, 0.5, 1].map(function (f) {
      var gy = T + ih * (1 - f);
      return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + Math.round(max * f) + "</text>";
    }).join("");

    var labels = [0, Math.floor((n - 1) / 2), n - 1].map(function (i, idx) {
      var anchor = idx === 0 ? "start" : idx === 2 ? "end" : "middle";
      return '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + shortDate(days[i]) + "</text>";
    }).join("");

    var colW = iw / Math.max(n - 1, 1);
    var hits = pts.map(function (p, i) {
      return '<rect class="hit" data-i="' + i + '" x="' + (x(i) - colW / 2) + '" y="' + T + '" width="' + colW + '" height="' + ih + '"/>' +
        '<circle class="hv" cx="' + x(i) + '" cy="' + y(p.v) + '" r="4.5"/>';
    }).join("");

    document.getElementById("tl").innerHTML =
      '<svg class="tl" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Chapters completed over time">' +
      grid + '<polygon class="area" points="' + area + '"/><polyline class="line" points="' + line + '"/>' + labels + hits + "</svg>";

    var readout = document.getElementById("readout");
    function show(i) {
      var p = pts[i];
      readout.textContent = shortDate(p.d) + ": " + p.v + " of " + total + " chapters done";
    }
    show(n - 1);
    var svg = document.querySelector("svg.tl");
    svg.addEventListener("mouseover", function (e) {
      if (e.target.classList && e.target.classList.contains("hit")) show(+e.target.getAttribute("data-i"));
    });
    svg.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("hit")) show(+e.target.getAttribute("data-i"));
    });
    svg.addEventListener("mouseleave", function () { show(n - 1); });
  }

  /* ---------- syllabus checklist ---------- */

  function renderSyllabus() {
    var html = '<h2>Syllabus checklist</h2>' + getSubjects().map(function (s) {
      var d = s.chapters.filter(function (c, i) { return isDone(s.id, i); }).length;
      var items = s.chapters.map(function (c, i) {
        var on = isDone(s.id, i);
        return '<li class="' + (on ? "done" : "") + '"><label><input type="checkbox" data-k="' + s.id + "." + i + '"' + (on ? " checked" : "") + "><span>" + esc(c) + "</span></label></li>";
      }).join("");
      return '<details id="sub-' + s.id + '" data-s="' + s.id + '"' + (openSubjects[s.id] ? " open" : "") + "><summary><span>" + esc(s.name) +
        '</span><span class="cnt" id="cnt-' + s.id + '">' + d + "/" + s.chapters.length + '</span></summary><ul class="chs">' + items + "</ul></details>";
    }).join("");
    var box = document.getElementById("syllabus");
    box.innerHTML = html;

    box.addEventListener("toggle", function (e) {
      var id = e.target.getAttribute && e.target.getAttribute("data-s");
      if (id) openSubjects[id] = e.target.open;
    }, true);

    box.addEventListener("change", function (e) {
      var k = e.target.getAttribute("data-k");
      if (!k) return;
      if (e.target.checked) state.done[k] = Date.now(); else delete state.done[k];
      e.target.closest("li").classList.toggle("done", e.target.checked);
      save();
      var sid = k.split(".")[0];
      var sub = getSubjects().filter(function (s) { return s.id === sid; })[0];
      var d = sub.chapters.filter(function (c, i) { return isDone(sid, i); }).length;
      document.getElementById("cnt-" + sid).textContent = d + "/" + sub.chapters.length;
      renderStats();
    });
  }

  /* ---------- clicks ---------- */

  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-prog],[data-act],[data-range],[data-s].bar");
    if (!el) return;

    if (el.hasAttribute("data-prog")) {
      state.prog = el.getAttribute("data-prog");
      save(); render();
    } else if (el.getAttribute("data-act") === "change") {
      state.prog = null;
      save(); render();
    } else if (el.getAttribute("data-act") === "reset") {
      if (confirm("Reset everything, including your name and all progress?")) {
        state = { done: {} };
        openSubjects = {};
        save(); render();
      }
    } else if (el.hasAttribute("data-range")) {
      range = +el.getAttribute("data-range");
      renderStats();
    } else if (el.classList.contains("bar")) {
      var id = el.getAttribute("data-s");
      openSubjects[id] = true;
      var d = document.getElementById("sub-" + id);
      d.open = true;
      d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  render();
})();
