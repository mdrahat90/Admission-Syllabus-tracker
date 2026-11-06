/* PORIDHI app: screens and interaction. Content comes from PORIDHI_SYLLABUS (or an admin preview import);
   nothing about the syllabus is hardcoded here. */
(function () {
  "use strict";

  var C = window.PoridhiCore, S = window.PoridhiStore;
  var LABEL = C.STATUS_LABEL;
  var main = document.getElementById("main"), tabs = document.getElementById("tabs"), shell = document.getElementById("shell");
  var layer = document.getElementById("layer"), toastEl = document.getElementById("toast");

  var ctx = { mode: "loading", ix: null, report: null, source: "bundled", override: null, step: "name", pending: "", view: null, prog: {}, stats: null, f: { q: "", status: "all", layer: "", cond: false }, limit: 150, undo: null };
  var depth = 0, openerEl = null, dialogConfirm = null, toastTimer = 0;

  /* ---------- helpers ---------- */

  function esc(v) {
    return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function enc(v) { return encodeURIComponent(v); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function mono(name) { var ch = Array.from(String(name).replace(/^[^\p{L}\p{N}]+/u, ""))[0] || "?"; return ch.toUpperCase(); }
  function ic(path, cls) {
    return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + "</svg>";
  }
  var I = {
    home: ic('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/>'),
    book: ic('<path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
    bars: ic('<path d="M5 20v-8"/><path d="M12 20V5"/><path d="M19 20v-5"/>'),
    user: ic('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
    right: ic('<path d="m9 6 6 6-6 6"/>'),
    left: ic('<path d="m15 6-6 6 6 6"/>'),
    down: ic('<path d="m6 9 6 6 6-6"/>'),
    search: ic('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
    close: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    download: ic('<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>'),
    upload: ic('<path d="M12 15V4"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M5 20h14"/>'),
    swap: ic('<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>')
  };

  function marker(st) {
    var inner = {
      not_started: "",
      in_progress: '<path d="M12 6.8a5.2 5.2 0 0 1 0 10.4z" fill="currentColor" stroke="none"/>',
      studied: '<path d="m8 12.4 2.6 2.6L16 9.6"/>',
      needs_revision: '<path d="M15.7 9.3A4.6 4.6 0 1 0 16.5 13"/><path d="M16.2 6.6v3h-3"/>'
    }[st];
    return '<span class="mk mk-' + st + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"' +
      (st === "not_started" ? ' stroke-dasharray="2.6 2.6"' : "") + "/>" + inner + "</svg></span>";
  }
  function pill(st) { return '<span class="pill pill-' + st + '">' + LABEL[st] + "</span>"; }
  function bar(b, label) {
    return '<span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + b.label + '" aria-label="' + esc(label) + '"><span style="width:' + b.pct.toFixed(1) + '%"></span></span>';
  }
  function statusOf(tid) { return C.statusOf(ctx.prog, tid); }
  /* The supplied programme names can carry the covered institutions in brackets, e.g.
     "Engineering (BUET / CKRUET / ...)". The data keeps the full name untouched; screens show the short
     name and put the bracketed part on a sub line. */
  function pname(p) { var short = String(p.programme_name).replace(/\s*\([^)]*\)\s*$/, ""); return short || p.programme_name; }
  function progLine(p) {
    var bits = [];
    if (p.admission_track && p.admission_track !== p.programme_name && p.admission_track !== pname(p)) bits.push(p.admission_track);
    if (p.institution_or_unit) bits.push(p.institution_or_unit);
    if (!bits.length) { var m = /\(([^)]*)\)\s*$/.exec(p.programme_name); if (m) bits.push(m[1]); }
    return bits.join(" · ");
  }
  function srcLabel(ref) {
    var src = ctx.srcById && ctx.srcById[ref];
    return src ? src.title + " (" + ref + ")" : ref;
  }
  function aboutProgramme(p) {
    var rows = [];
    if (p.description) rows.push("<p>" + esc(p.description) + "</p>");
    if (p.subjects_summary) rows.push("<p><b>Usually covers:</b> " + esc(p.subjects_summary) + "</p>");
    if (p.distinction) rows.push("<p><b>What sets it apart:</b> " + esc(p.distinction) + "</p>");
    if (p.caveat) rows.push("<p><b>Please note:</b> " + esc(p.caveat) + "</p>");
    if (p.source_notes) rows.push('<p class="src"><b>Basis:</b> ' + esc(p.source_notes) + "</p>");
    return rows.length ? '<details class="about"><summary>About this programme</summary>' + rows.join("") + "</details>" : "";
  }
  function goodToKnow(p) {
    var notes = [];
    if (p.caveat) notes.push(p.caveat);
    (ctx.ix.data.meta.editorial_notes || []).slice(0, 2).forEach(function (n) { notes.push(n); });
    if (!notes.length) return "";
    return '<section class="card"><h2 class="h2">Good to know</h2><ul class="bullets">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></section>";
  }

  /* ---------- loading the syllabus ---------- */

  function loadSyllabus() {
    ctx.override = S.getOverride();
    var raw = null;
    if (ctx.override && ctx.override.data) { raw = ctx.override.data; ctx.source = "imported"; }
    else { raw = window.PORIDHI_SYLLABUS || null; ctx.source = "bundled"; }
    ctx.ix = null; ctx.report = null;
    if (!raw) { ctx.mode = "empty"; return; }
    var res = C.normaliseAny(raw);
    ctx.report = res;
    if (!res.ok) { ctx.mode = "invalid"; return; }
    ctx.ix = C.buildIndex(res.data);
    ctx.srcById = {};
    res.data.meta.sources.forEach(function (src) { ctx.srcById[src.id] = src; });
    ctx.mode = "ready";
  }

  /* ---------- routing ---------- */

  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?");
    var path = qi < 0 ? h : h.slice(0, qi);
    var q = new URLSearchParams(qi < 0 ? "" : h.slice(qi + 1));
    var parts = path.split("/").filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { parts: parts, q: q };
  }
  function go(hash) {
    if (location.hash === hash) { route(true); return; }
    depth++;
    history.pushState({ d: depth }, "", hash);
    route(true);
  }
  function goReplace(hash) { history.replaceState({ d: depth }, "", hash); route(true); }
  function goBack(fallback) { if (depth > 0) history.back(); else goReplace(fallback); }
  function refresh() { route(false); }

  function route(resetScroll) {
    closeLayer(true);
    var y = window.scrollY;
    var prof = S.getProfile();
    var html, section = null, after = null;

    if (!prof.name || ctx.step === "name") {
      paint(viewWelcome("name"), null);
    } else if (ctx.mode !== "ready") {
      paint(viewBlocked(), null);
    } else if (!ctx.ix.programmeById[prof.programmeId]) {
      paint(viewWelcome(ctx.step === "confirm" && ctx.pending && ctx.ix.programmeById[ctx.pending] ? "confirm" : "programme"), null);
    } else {
      ctx.view = ctx.ix.view(prof.programmeId);
      ctx.prog = S.getProgress(prof.programmeId);
      ctx.stats = C.computeStats(ctx.view, ctx.prog);
      var r = parseHash(), p = r.parts, top = p[0] || "home";
      if (top === "syllabus" && p[1] === "s") { html = viewSubject(p[2]); section = "syllabus"; }
      else if (top === "syllabus" && p[1] === "c") { html = viewChapter(p[2], r.q.get("t")); section = "syllabus"; }
      else if (top === "syllabus") { html = viewSyllabus(); section = "syllabus"; }
      else if (top === "stats") { html = viewStats(r.q.get("s")); section = "stats"; }
      else if (top === "topics") { html = viewTopics(r.q); section = "syllabus"; }
      else if (top === "profile") { html = viewProfile(); section = "profile"; }
      else { html = viewHome(); section = "home"; }
      paint(html, section);
      if (top === "syllabus" && p[1] === "c" && ctx.view.chapterInfo[p[2]]) S.setLastChapter(prof.programmeId, p[2]);
      var hl = top === "syllabus" && p[1] === "c" ? r.q.get("t") : "", fs = top === "topics" && resetScroll !== false;
      after = function () { afterPaint(hl, fs); };
    }
    if (resetScroll !== false) { window.scrollTo(0, 0); try { main.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    else window.scrollTo(0, y);
    if (after) after();
  }

  function paint(html, section) {
    shell.classList.toggle("no-tabs", !section);
    main.innerHTML = (section ? banners(section) : "") + html;
    if (section) renderTabs(section); else tabs.innerHTML = "";
  }

  function afterPaint(highlightTid, focusSearch) {
    if (highlightTid) {
      var el = findTopicEl(highlightTid);
      if (el) {
        el.classList.add("flash");
        el.scrollIntoView({ block: "center" });
        setTimeout(function () { el.classList.remove("flash"); }, 2200);
      }
    }
    if (focusSearch) {
      var q = document.getElementById("q");
      if (q && !q.value && ctx.f.status === "all" && !ctx.f.layer && !ctx.f.cond) q.focus();
    }
  }
  function findTopicEl(tid) {
    var els = main.querySelectorAll(".topic");
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute("data-tid") === tid) return els[i];
    return null;
  }

  function renderTabs(active) {
    var items = [
      ["home", "Home", I.home, "#/home"], ["syllabus", "Syllabus", I.book, "#/syllabus"],
      ["stats", "Statistics", I.bars, "#/stats"], ["profile", "Profile", I.user, "#/profile"]
    ];
    tabs.innerHTML = items.map(function (t) {
      return '<a class="tab" href="' + t[3] + '"' + (t[0] === active ? ' aria-current="page"' : "") + ">" + t[2] + "<span>" + t[1] + "</span></a>";
    }).join("");
  }

  function banners(section) {
    var out = "";
    var meta = ctx.ix.data.meta;
    if (meta.dev_sample) out += '<div class="banner banner-sample" role="note"><b>Sample data.</b> Placeholder content for development, not a real syllabus.</div>';
    if (!S.isPersistent()) out += '<div class="banner banner-warn" role="alert"><b>Progress is not being saved.</b> This browser is blocking storage (private mode?). Your changes will be lost when you close the page.</div>';
    if (section === "home") {
      var un = C.findUnmatched(ctx.ix, S.allProgress()).length;
      if (un) out += '<a class="banner banner-info" href="#/profile">' + plural(un, "saved status") + " no longer match the syllabus. Review in Profile.</a>";
    }
    return out;
  }

  /* ---------- shared pieces ---------- */

  function head(o) {
    var name = ctx.view ? pname(ctx.view.programme) : "";
    var left = o.back
      ? '<button type="button" class="back" data-act="back" data-fallback="' + esc(o.back) + '">' + I.left + "<span>Back</span></button>"
      : '<span class="eyebrow">PORIDHI</span>';
    var right = o.prog
      ? '<button type="button" class="progchip" data-act="switch-prog" aria-label="Active programme: ' + esc(name) + '. Switch programme"><span>' + esc(name) + "</span>" + I.down + "</button>"
      : "";
    var crumbs = o.crumbs
      ? '<nav class="crumbs" aria-label="Breadcrumb">' + o.crumbs.map(function (c) {
          return c.href ? '<a href="' + esc(c.href) + '">' + esc(c.label) + "</a>" : '<span aria-current="page">' + esc(c.label) + "</span>";
        }).join('<span class="sep" aria-hidden="true">›</span>') + "</nav>"
      : "";
    return '<header class="head"><div class="head-top">' + left + right + "</div>" + crumbs + '<h1 class="display">' + esc(o.title) + "</h1>" + (o.sub ? '<p class="sub">' + esc(o.sub) + "</p>" : "") + "</header>";
  }

  function empty(title, text, action) {
    return '<div class="empty"><p class="empty-title">' + esc(title) + "</p>" + (text ? "<p>" + esc(text) + "</p>" : "") + (action || "") + "</div>";
  }
  function notFound(text, href) {
    return head({ title: "Not found", back: href }) + empty("Nothing here", text, '<a class="btn btn-secondary" href="' + esc(href) + '">Go to Syllabus</a>');
  }

  function counts(b) {
    return '<ul class="counts">' + ["studied", "in_progress", "needs_revision", "not_started"].map(function (k) {
      return "<li>" + marker(k) + "<b>" + b[k] + "</b><span>" + LABEL[k] + "</span></li>";
    }).join("") + "</ul>";
  }

  function subjectRow(se, compact) {
    var b = ctx.stats.bySubject[se.subject.subject_id], sid = se.subject.subject_id;
    var meta = compact
      ? b.studied + " of " + b.total + " studied"
      : plural(se.chapters.length, "chapter") + " · " + plural(b.total, "topic") + " · " + b.studied + " studied";
    return '<li><a class="row" href="#/syllabus/s/' + enc(sid) + '"><span class="mono" aria-hidden="true">' + esc(mono(se.subject.subject_name)) + "</span>" +
      '<span class="row-body"><span class="row-title">' + esc(se.subject.subject_name) + '</span><span class="row-meta">' + meta + "</span>" + bar(b, se.subject.subject_name + " progress") + "</span>" +
      '<span class="row-end"><b>' + b.label + "%</b>" + I.right + "</span></a></li>";
  }

  function tagsFor(te) {
    var out = [];
    if (te.applicability === "conditional") out.push("Conditional");
    else if (te.applicability === "optional") out.push("Optional");
    else if (te.applicability === "unverified") out.push("Unverified");
    if (te.layer && ctx.view.layers.length > 1 && te.layer !== ctx.view.mainLayer) out.push(te.layer);
    return out.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
  }

  function topicRow(te, mode) {
    var t = te.topic, tid = t.topic_id, st = statusOf(tid), tags = tagsFor(te);
    var aria = "Change status of " + t.topic_name + ". Currently " + LABEL[st] + ".";
    var hasMore = !!t.description;
    var detail = hasMore
      ? '<div class="topic-detail" hidden>' + (t.description ? "<p>" + esc(t.description) + "</p>" : "") + (t.source_reference ? '<p class="src">Source: ' + esc(srcLabel(t.source_reference)) + "</p>" : "") + "</div>"
      : "";
    var more = hasMore ? '<button type="button" class="more" data-act="more" aria-expanded="false" aria-label="Show details for ' + esc(t.topic_name) + '">' + I.down + "</button>" : "";
    if (mode === "list") {
      return '<li class="topic" data-tid="' + esc(tid) + '"><div class="topic-row">' +
        '<button type="button" class="mk-btn" data-act="status" data-tid="' + esc(tid) + '" aria-label="' + esc(aria) + '">' + marker(st) + "</button>" +
        '<a class="topic-body" href="#/syllabus/c/' + enc(te.chapter.chapter_id) + "?t=" + enc(tid) + '"><span class="topic-name">' + esc(t.topic_name) + "</span>" +
        '<span class="path">' + esc(te.subject.subject_name) + " › " + esc(te.chapter.chapter_name) + '</span><span class="topic-meta">' + pill(st) + tags + "</span></a>" + more + "</div>" + detail + "</li>";
    }
    return '<li class="topic" data-tid="' + esc(tid) + '"><div class="topic-row">' +
      '<button type="button" class="topic-main" data-act="status" data-tid="' + esc(tid) + '" aria-label="' + esc(aria) + '">' + marker(st) +
      '<span class="topic-body"><span class="topic-name">' + esc(t.topic_name) + '</span><span class="topic-meta">' + pill(st) + tags + "</span></span></button>" + more + "</div>" + detail + "</li>";
  }

  /* ---------- welcome / onboarding ---------- */

  function viewWelcome(step) {
    var prof = S.getProfile();
    if (ctx.mode !== "ready" && step !== "name") return viewBlocked();
    if (step === "name") {
      return '<div class="welcome"><div class="brand">PORIDHI</div><p class="step">Step 1 of 3</p>' +
        '<form id="name-form" novalidate><label class="display" for="name-input">What should we call you?</label>' +
        '<input id="name-input" class="field" type="text" maxlength="40" autocomplete="given-name" enterkeyhint="next" value="' + esc(prof.name) + '" placeholder="Your name">' +
        '<p class="field-error" id="name-error" role="alert" hidden>Please enter a name to continue.</p>' +
        '<p class="hint">Saved on this device only. You can change it later in Profile.</p>' +
        '<button type="submit" class="btn">Continue</button></form></div>';
    }
    var ix = ctx.ix;
    if (step === "programme") {
      var items = ix.data.programmes.map(function (p) {
        var v = ix.view(p.programme_id), sub = progLine(p);
        return '<li><button type="button" class="choice" data-act="wel-pick" data-pid="' + esc(p.programme_id) + '"><span class="choice-body"><span class="choice-title">' + esc(pname(p)) + "</span>" +
          (sub ? '<span class="choice-sub">' + esc(sub) + "</span>" : "") + '<span class="choice-sub">' + plural(v.subjects.length, "subject") + " · " + plural(v.total, "topic") + "</span></span>" + I.right + "</button></li>";
      }).join("");
      return '<div class="welcome"><div class="brand">PORIDHI</div><p class="step">Step 2 of 3</p>' +
        '<h1 class="display">Hi ' + esc(prof.name) + ". Which programme are you preparing for?</h1>" +
        '<p class="lead">Your choice decides which subjects, chapters and topics you see. You can switch later without losing progress.</p>' +
        '<ul class="choices">' + items + '</ul><button type="button" class="btn btn-ghost" data-act="wel-back-name">Change name</button></div>';
    }
    var p2 = ix.programmeById[ctx.pending], v2 = ix.view(ctx.pending);
    var rows = v2.subjects.map(function (se) {
      var n = se.chapters.reduce(function (a, ce) { return a + ce.topics.length; }, 0);
      return '<li><span class="mono" aria-hidden="true">' + esc(mono(se.subject.subject_name)) + '</span><span class="row-body"><span class="row-title">' + esc(se.subject.subject_name) + '</span><span class="row-meta">' + plural(se.chapters.length, "chapter") + " · " + plural(n, "topic") + "</span></span></li>";
    }).join("");
    return '<div class="welcome"><div class="brand">PORIDHI</div><p class="step">Step 3 of 3</p>' +
      '<h1 class="display">You are preparing for ' + esc(pname(p2)) + "</h1>" + (progLine(p2) ? '<p class="sub">' + esc(progLine(p2)) + "</p>" : "") + (p2.description ? '<p class="lead">' + esc(p2.description) + "</p>" : "") +
      '<section class="card"><h2 class="h2">Subjects in this programme</h2>' + (rows ? '<ul class="list plain">' + rows + "</ul>" : "<p>No subjects yet.</p>") + "</section>" + goodToKnow(p2) +
      '<button type="button" class="btn" data-act="wel-confirm">Confirm and open my syllabus</button>' +
      '<button type="button" class="btn btn-ghost" data-act="wel-back-programme">Choose a different programme</button></div>';
  }

  function viewBlocked() {
    var prof = S.getProfile();
    var extra = ctx.source === "imported" ? '<button type="button" class="btn btn-secondary" data-act="revert-override">Remove the imported syllabus from this device</button>' : "";
    if (ctx.mode === "empty") {
      return '<div class="welcome"><div class="brand">PORIDHI</div><h1 class="display">No syllabus installed yet</h1>' +
        '<p class="lead">Hi ' + esc(prof.name) + ". This copy of PORIDHI has no syllabus data, so there is nothing to track yet.</p>" +
        '<p class="hint">If you are setting this up, add the syllabus file with the <a href="admin.html">import and validation tool</a>.</p></div>';
    }
    var errs = ctx.report.errors.slice(0, 8).map(function (e) { return "<li><b>" + esc(e.where) + ":</b> " + esc(e.msg) + "</li>"; }).join("");
    return '<div class="welcome"><div class="brand">PORIDHI</div><h1 class="display">The syllabus data has problems</h1>' +
      '<p class="lead">It was not loaded, so no progress can be shown. Your saved progress is untouched.</p>' +
      '<section class="card"><ul class="issues">' + errs + "</ul>" + (ctx.report.errors.length > 8 ? "<p>…and " + (ctx.report.errors.length - 8) + " more.</p>" : "") + "</section>" +
      '<p class="hint">Check the file in the <a href="admin.html">import and validation tool</a>.</p>' + extra + "</div>";
  }

  /* ---------- Home ---------- */

  function viewHome() {
    var prof = S.getProfile(), v = ctx.view, a = ctx.stats.all, pid = v.programme.programme_id;
    var hr = new Date().getHours();
    var greet = hr >= 5 && hr < 12 ? "Good morning" : hr >= 12 && hr < 17 ? "Good afternoon" : hr >= 17 && hr < 22 ? "Good evening" : "Hello";
    var html = head({ title: greet + ", " + prof.name, prog: true, sub: progLine(v.programme) });
    if (!a.total) return html + empty("No topics in this programme yet", "The syllabus has no topics for " + pname(v.programme) + ".");

    html += '<section class="card hero" aria-label="Overall progress"><div class="hero-top"><div><p class="label">Overall progress</p><p class="bignum"><span>' + a.label + "</span><small>%</small></p></div>" +
      '<p class="hero-sub"><b>' + a.studied + "</b> of <b>" + a.total + "</b> topics studied<br>" + plural(a.remaining, "topic") + " remaining</p></div>" + bar(a, "Overall progress") + "</section>";

    html += '<ul class="tiles">' + ["studied", "in_progress", "not_started", "needs_revision"].map(function (k) {
      return '<li><a class="tile" href="#/topics?status=' + k + '">' + marker(k) + "<b>" + a[k] + "</b><span>" + LABEL[k] + "</span></a></li>";
    }).join("") + "</ul>";

    var cont = continueItems();
    if (cont) html += '<section class="card"><div class="sect"><h2 class="h2">Continue preparation</h2></div><ul class="list plain">' + cont + "</ul></section>";

    if (a.needs_revision) {
      html += '<a class="card revise" href="#/topics?status=needs_revision">' + marker("needs_revision") + '<span class="row-body"><span class="row-title">' + plural(a.needs_revision, "topic") + ' to revise</span><span class="row-meta">Open your revision list</span></span>' + I.right + "</a>";
    }

    html += '<section class="card"><div class="sect"><h2 class="h2">Subjects</h2><a class="link" href="#/syllabus">Open syllabus</a></div><ul class="list">' +
      v.subjects.map(function (se) { return subjectRow(se, true); }).join("") + "</ul></section>";
    return html;
  }

  function continueItems() {
    var prof = S.getProfile(), pid = ctx.view.programme.programme_id, out = "";
    var lastCid = prof.lastChapter && prof.lastChapter[pid], ce = lastCid && ctx.view.chapterInfo[lastCid];
    if (ce) {
      var b = ctx.stats.byChapter[lastCid];
      out += '<li><a class="row" href="#/syllabus/c/' + enc(lastCid) + '"><span class="row-body"><span class="row-kicker">Last opened</span><span class="row-title">' + esc(ce.chapter.chapter_name) + '</span><span class="row-meta">' +
        esc(ce.subject.subject_name) + " · " + b.studied + " of " + b.total + " studied</span></span>" + I.right + "</a></li>";
    }
    var best = null;
    Object.keys(ctx.prog).forEach(function (tid) {
      var r = ctx.prog[tid];
      if (r && r.s === "in_progress" && ctx.view.topicInfo[tid] && (!best || r.u > best.u)) best = { tid: tid, u: r.u };
    });
    if (best) {
      var te = ctx.view.topicInfo[best.tid];
      out += '<li><a class="row" href="#/syllabus/c/' + enc(te.chapter.chapter_id) + "?t=" + enc(best.tid) + '"><span class="row-body"><span class="row-kicker">In progress</span><span class="row-title">' + esc(te.topic.topic_name) + '</span><span class="row-meta">' +
        esc(te.subject.subject_name) + " › " + esc(te.chapter.chapter_name) + "</span></span>" + I.right + "</a></li>";
    }
    return out;
  }

  /* ---------- Syllabus: programme > subjects > chapters > topics ---------- */

  function viewSyllabus() {
    var v = ctx.view, a = ctx.stats.all;
    var html = head({ title: "Syllabus", prog: true });
    html += '<section class="card"><p class="label">Active programme</p><h2 class="prog-name">' + esc(pname(v.programme)) + "</h2>" + (progLine(v.programme) ? '<p class="sub">' + esc(progLine(v.programme)) + "</p>" : "") +
      '<p class="summary-line"><b>' + a.studied + "</b> of <b>" + a.total + "</b> topics studied · " + a.label + "%</p>" + bar(a, "Programme progress") + aboutProgramme(v.programme) + "</section>";
    html += '<a class="searchfield as-link" href="#/topics">' + I.search + "<span>Search subjects, chapters, topics</span></a>";
    if (!v.subjects.length) return html + empty("No subjects yet", "The syllabus has no subjects for this programme.");
    html += '<ul class="list card">' + v.subjects.map(function (se) { return subjectRow(se, false); }).join("") + "</ul>";
    return html;
  }

  function viewSubject(sid) {
    var se = ctx.view.subjectInfo[sid];
    if (!se) return notFound("That subject is not part of your programme.", "#/syllabus");
    var b = ctx.stats.bySubject[sid];
    var html = head({ title: se.subject.subject_name, back: "#/syllabus", crumbs: [{ label: "Syllabus", href: "#/syllabus" }, { label: se.subject.subject_name }] });
    html += '<section class="card"><p class="summary-line"><b>' + b.studied + "</b> of <b>" + b.total + "</b> topics studied · " + b.label + "%</p>" + bar(b, se.subject.subject_name + " progress") + counts(b) + "</section>";
    if (!se.chapters.length) return html + empty("No chapters yet", "This subject has no chapters in your programme.");
    var secs = {}; se.chapters.forEach(function (ce) { secs[ce.chapter.chapter_section || ""] = 1; });
    var grouped = Object.keys(secs).length >= 2, lastSec = null;
    html += '<ul class="list card">' + se.chapters.map(function (ce) {
      var head_ = "", sec = ce.chapter.chapter_section || "";
      if (grouped && sec !== lastSec) { head_ = '<li class="group-head" role="presentation">' + esc(sec || "Other") + "</li>"; lastSec = sec; }
      var cb = ctx.stats.byChapter[ce.chapter.chapter_id], num = ce.chapter.chapter_number || String(ce.n);
      var meta = plural(cb.total, "topic") + " · " + cb.studied + " studied" + (cb.in_progress ? " · " + cb.in_progress + " in progress" : "") + (cb.needs_revision ? " · " + cb.needs_revision + " to revise" : "");
      return head_ + '<li><a class="row" href="#/syllabus/c/' + enc(ce.chapter.chapter_id) + '"><span class="num" aria-hidden="true">' + esc(num) + '</span><span class="row-body"><span class="row-title">' + esc(ce.chapter.chapter_name) + '</span><span class="row-meta">' + meta + "</span>" +
        bar(cb, ce.chapter.chapter_name + " progress") + '</span><span class="row-end"><b>' + cb.label + "%</b>" + I.right + "</span></a></li>";
    }).join("") + "</ul>";
    return html;
  }

  function viewChapter(cid, hl) {
    var ce = ctx.view.chapterInfo[cid];
    if (!ce) return notFound("That chapter is not part of your programme.", "#/syllabus");
    var sid = ce.subject.subject_id, b = ctx.stats.byChapter[cid];
    var html = head({ title: ce.chapter.chapter_name, sub: ce.chapter.chapter_section || "", back: "#/syllabus/s/" + enc(sid), crumbs: [{ label: "Syllabus", href: "#/syllabus" }, { label: ce.subject.subject_name, href: "#/syllabus/s/" + enc(sid) }, { label: ce.chapter.chapter_name }] });
    html += '<section class="card"><p class="summary-line"><b>' + b.studied + "</b> of <b>" + b.total + "</b> topics studied · " + b.label + "%</p>" + bar(b, ce.chapter.chapter_name + " progress") + counts(b) + "</section>";
    html += '<p class="hint tap-hint">Tap a topic to set its status.</p><ul class="topics card">' + ce.topics.map(function (te) { return topicRow(te, "chapter"); }).join("") + "</ul>";
    return html;
  }

  /* ---------- status sheet ---------- */

  var OPTIONS = [
    ["not_started", "Not started", "Not begun, or not recorded yet."],
    ["in_progress", "In progress", "You are studying it now."],
    ["studied", "Studied", "Covered. Counts toward your completion."],
    ["needs_revision", "Needs revision", "Studied before, needs another look. Not counted as studied."]
  ];

  function openStatusSheet(tid) {
    var te = ctx.view.topicInfo[tid];
    if (!te) return;
    var cur = statusOf(tid);
    var html = '<div class="sheet-head"><div><p class="eyebrow">Update status</p><h2 id="sheet-title" class="sheet-title">' + esc(te.topic.topic_name) + '</h2><p class="path">' + esc(te.subject.subject_name) + " › " + esc(te.chapter.chapter_name) + "</p></div>" +
      '<button type="button" class="icon-btn" data-act="close-layer" aria-label="Close">' + I.close + "</button></div><ul class=\"options\">" +
      OPTIONS.map(function (o) {
        var on = o[0] === cur;
        return '<li><button type="button" class="option' + (on ? " is-current" : "") + '" data-act="set-status" data-tid="' + esc(tid) + '" data-st="' + o[0] + '"' + (on ? ' aria-current="true" data-autofocus' : "") + ">" + marker(o[0]) +
          '<span class="option-body"><span class="option-title">' + o[1] + (on ? " <em>current</em>" : "") + '</span><span class="option-sub">' + o[2] + "</span></span>" + (on ? I.check : "") + "</button></li>";
      }).join("") + "</ul>";
    openLayer(html, "");
  }

  function setStatus(tid, st) {
    var pid = S.getProfile().programmeId, te = ctx.view.topicInfo[tid];
    var prevSt = statusOf(tid), prevRec = S.getRecord(pid, tid);
    closeLayer(true);
    if (!te || prevSt === st) return;
    var saved = S.setStatus(pid, tid, st);
    refresh();
    var el = findTopicEl(tid);
    if (el) {
      el.classList.add("pulse");
      var b = el.querySelector("[data-act=status]");
      if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    toast(saved ? "Marked as " + LABEL[st] : "Marked as " + LABEL[st] + ", but this browser could not save it.", function () {
      S.restoreRecord(pid, tid, prevRec);
      refresh();
    });
  }

  /* ---------- Statistics ---------- */

  function ring(b) {
    var r = 52, c = 2 * Math.PI * r, frac = b.total ? b.studied / b.total : 0;
    return '<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="' + b.label + ' percent of topics studied"><circle class="ring-track" cx="60" cy="60" r="52"/>' +
      '<circle class="ring-fill" cx="60" cy="60" r="52" stroke-dasharray="' + (c * frac).toFixed(2) + " " + c.toFixed(2) + '" transform="rotate(-90 60 60)"/>' +
      '<text x="60" y="69" text-anchor="middle" class="ring-text">' + b.label + "%</text></svg>";
  }

  function statRow(href, title, b, mono_, extra) {
    return '<li><a class="row" href="' + href + '">' + (mono_ ? '<span class="mono" aria-hidden="true">' + esc(mono_) + "</span>" : "") + '<span class="row-body"><span class="row-title">' + esc(title) + '</span><span class="row-meta">' + (extra ? esc(extra) + " · " : "") + b.studied + " of " + b.total + " studied" +
      (b.needs_revision ? " · " + b.needs_revision + " to revise" : "") + "</span>" + bar(b, title + " progress") + '</span><span class="row-end"><b>' + b.label + "%</b>" + I.right + "</span></a></li>";
  }

  function viewStats(sidParam) {
    var v = ctx.view, a = ctx.stats.all;
    var html = head({ title: "Statistics", prog: true });
    if (!a.total) return html + empty("No topics to report on", "The syllabus has no topics for this programme yet.");

    html += '<section class="card"><div class="summary"><div class="ring-wrap">' + ring(a) + '</div><dl class="kv"><div><dt>Studied</dt><dd>' + a.studied + " / " + a.total + "</dd></div><div><dt>Remaining</dt><dd>" + a.remaining + "</dd></div>" +
      '<div><dt>Needs revision</dt><dd>' + a.needs_revision + "</dd></div></dl></div></section>";

    var order = ["studied", "needs_revision", "in_progress", "not_started"];
    var aria = order.map(function (k) { return LABEL[k] + " " + a[k]; }).join(", ");
    html += '<section class="card"><h2 class="h2">Status</h2><div class="dist" role="img" aria-label="' + esc(aria) + '">' +
      order.map(function (k) { return a[k] ? '<span class="seg seg-' + k + '" style="flex:' + a[k] + '"></span>' : ""; }).join("") + '</div><ul class="dist-list">' +
      ["studied", "in_progress", "not_started", "needs_revision"].map(function (k) {
        return '<li><a href="#/topics?status=' + k + '">' + marker(k) + '<span class="dl-name">' + LABEL[k] + '</span><span class="dl-n">' + a[k] + '</span><span class="dl-p">' + Math.round(a[k] / a.total * 100) + "%</span>" + I.right + "</a></li>";
      }).join("") + "</ul></section>";

    html += '<section class="card"><h2 class="h2">By subject</h2><ul class="list">' + v.subjects.map(function (se) {
      return statRow("#/syllabus/s/" + enc(se.subject.subject_id), se.subject.subject_name, ctx.stats.bySubject[se.subject.subject_id], mono(se.subject.subject_name));
    }).join("") + "</ul></section>";

    var withCh = v.subjects.filter(function (se) { return se.chapters.length; });
    if (withCh.length) {
      var sel = sidParam && v.subjectInfo[sidParam] && v.subjectInfo[sidParam].chapters.length ? sidParam : withCh[0].subject.subject_id;
      html += '<section class="card"><h2 class="h2">By chapter</h2><label class="sr-only" for="stat-subject">Subject</label><select id="stat-subject" class="select">' +
        withCh.map(function (se) { return '<option value="' + esc(se.subject.subject_id) + '"' + (se.subject.subject_id === sel ? " selected" : "") + ">" + esc(se.subject.subject_name) + "</option>"; }).join("") + '</select><ul class="list">' +
        v.subjectInfo[sel].chapters.map(function (ce) { return statRow("#/syllabus/c/" + enc(ce.chapter.chapter_id), ce.chapter.chapter_name, ctx.stats.byChapter[ce.chapter.chapter_id], ce.chapter.chapter_number || String(ce.n), ce.chapter.chapter_section); }).join("") + "</ul></section>";
    }

    var w = C.weeklyStudied(v, ctx.prog, 8);
    if (w.any) {
      var max = Math.max.apply(null, w.weeks.map(function (c) { return c.count; })) || 1;
      html += '<section class="card"><h2 class="h2">Marked as studied, by week</h2><ul class="weeks">' + w.weeks.map(function (c) {
        var lab = new Date(c.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return '<li><div class="wk-col"><span class="wk-bar" style="height:' + Math.round(c.count / max * 100) + '%"></span></div><span class="wk-n">' + c.count + '</span><span class="wk-l">' + lab + "</span></li>";
      }).join("") + '</ul><p class="hint">Based on the date each topic was first marked Studied on this device. Weeks start on Monday.</p></section>';
    }
    return html;
  }

  /* ---------- search + filters ---------- */

  function readFilter(q) {
    var st = q.get("status");
    return { q: q.get("q") || "", status: C.STATUSES.indexOf(st) >= 0 ? st : "all", layer: q.get("layer") || "", cond: q.get("cond") === "1" };
  }
  function filterHash() {
    var f = ctx.f, p = [];
    if (f.q) p.push("q=" + enc(f.q));
    if (f.status !== "all") p.push("status=" + f.status);
    if (f.layer) p.push("layer=" + enc(f.layer));
    if (f.cond) p.push("cond=1");
    return "#/topics" + (p.length ? "?" + p.join("&") : "");
  }
  function hasFilter() { return ctx.f.status !== "all" || !!ctx.f.layer || ctx.f.cond; }

  function chipsHtml() {
    var f = ctx.f, v = ctx.view;
    var st = [["all", "All"], ["studied", "Studied"], ["in_progress", "In progress"], ["not_started", "Not started"], ["needs_revision", "Needs revision"]];
    var html = '<div class="chips" role="group" aria-label="Filter by status">' + st.map(function (s) {
      return '<button type="button" class="chip" data-act="chip" data-key="status" data-val="' + s[0] + '" aria-pressed="' + (f.status === s[0]) + '">' + s[1] + "</button>";
    }).join("") + "</div>";
    var extra = [];
    if (v.layers.length > 1) v.layers.forEach(function (l) { extra.push('<button type="button" class="chip" data-act="chip" data-key="layer" data-val="' + esc(l) + '" aria-pressed="' + (f.layer === l) + '">' + esc(l) + "</button>"); });
    if (v.hasConditional) extra.push('<button type="button" class="chip" data-act="chip" data-key="cond" data-val="1" aria-pressed="' + f.cond + '">Conditional</button>');
    if (extra.length) html += '<div class="chips" role="group" aria-label="Filter by coverage">' + extra.join("") + "</div>";
    return html;
  }

  function viewTopics(q) {
    ctx.f = readFilter(q);
    ctx.limit = 150;
    var title = ctx.f.q ? "Search" : ctx.f.status !== "all" ? LABEL[ctx.f.status] : ctx.f.layer ? ctx.f.layer : ctx.f.cond ? "Conditional topics" : "Search";
    return head({ title: title, back: "#/syllabus", sub: pname(ctx.view.programme) }) +
      '<div class="searchfield">' + I.search + '<input id="q" type="search" placeholder="Search subjects, chapters, topics" value="' + esc(ctx.f.q) + '" autocomplete="off" enterkeyhint="search" aria-label="Search the syllabus"></div>' +
      '<div id="chips">' + chipsHtml() + '</div><p class="count" id="count" aria-live="polite"></p><div id="results">' + resultsHtml() + "</div>";
  }

  function resultsHtml() {
    var f = ctx.f, v = ctx.view, html = "", count = "";
    if (!f.q && !hasFilter()) {
      setCount("");
      return empty("Search or filter", "Type a subject, chapter or topic name, or choose a filter above.");
    }
    if (f.q && !hasFilter()) {
      var r = C.search(v, f.q);
      var total = r.subjects.length + r.chapters.length + r.topics.length;
      if (!total) { setCount(""); return empty("No matches", "Nothing in " + pname(v.programme) + ' matches "' + f.q + '".'); }
      if (r.subjects.length) html += '<h2 class="h2 group">Subjects</h2><ul class="list card">' + r.subjects.map(function (se) { return '<li><a class="row" href="#/syllabus/s/' + enc(se.subject.subject_id) + '"><span class="row-body"><span class="row-title">' + esc(se.subject.subject_name) + '</span></span>' + I.right + "</a></li>"; }).join("") + "</ul>";
      if (r.chapters.length) html += '<h2 class="h2 group">Chapters</h2><ul class="list card">' + r.chapters.map(function (ce) { return '<li><a class="row" href="#/syllabus/c/' + enc(ce.chapter.chapter_id) + '"><span class="row-body"><span class="row-title">' + esc(ce.chapter.chapter_name) + '</span><span class="path">' + esc(ce.subject.subject_name) + " › " + esc(ce.chapter.chapter_name) + "</span></span>" + I.right + "</a></li>"; }).join("") + "</ul>";
      if (r.topics.length) html += '<h2 class="h2 group">Topics</h2>' + topicList(r.topics);
      setCount(plural(r.subjects.length, "subject") + " · " + plural(r.chapters.length, "chapter") + " · " + plural(r.topics.length, "topic"));
      return html;
    }
    var list = C.filterTopics(v, ctx.prog, f);
    setCount(plural(list.length, "topic"));
    if (!list.length) return empty("No topics here", "No topics match these filters.");
    return topicList(list);
  }

  function topicList(list) {
    var shown = list.slice(0, ctx.limit);
    return '<ul class="topics card">' + shown.map(function (te) { return topicRow(te, "list"); }).join("") + "</ul>" +
      (list.length > shown.length ? '<button type="button" class="btn btn-secondary" data-act="more-results">Show more (' + (list.length - shown.length) + " left)</button>" : "");
  }
  function setCount(t) { var el = document.getElementById("count"); if (el) el.textContent = t; }

  function updateTopicsBody() {
    history.replaceState({ d: depth }, "", filterHash());
    var chips = document.getElementById("chips"), res = document.getElementById("results");
    if (chips) chips.innerHTML = chipsHtml();
    if (res) res.innerHTML = resultsHtml();
    var title = main.querySelector("h1");
    if (title) title.textContent = ctx.f.q ? "Search" : ctx.f.status !== "all" ? LABEL[ctx.f.status] : ctx.f.layer ? ctx.f.layer : ctx.f.cond ? "Conditional topics" : "Search";
  }

  /* ---------- Profile ---------- */

  function viewProfile() {
    var prof = S.getProfile(), v = ctx.view, a = ctx.stats.all, meta = ctx.ix.data.meta, p = v.programme;
    var un = C.findUnmatched(ctx.ix, S.allProgress());
    var html = head({ title: "Profile" });

    html += '<section class="card"><h2 class="h2">Your name</h2><form id="profile-name-form" class="inline-form" novalidate><label class="sr-only" for="profile-name">Name</label>' +
      '<input id="profile-name" class="field" type="text" maxlength="40" value="' + esc(prof.name) + '" autocomplete="given-name"><button type="submit" class="btn btn-secondary">Save</button></form>' +
      '<p class="field-error" id="profile-name-error" role="alert" hidden>Please enter a name.</p><p class="hint">Changing your name never affects your progress.</p></section>';

    html += '<section class="card"><h2 class="h2">Programme</h2><p class="prog-name">' + esc(pname(p)) + "</p>" + (progLine(p) ? '<p class="sub">' + esc(progLine(p)) + "</p>" : "") +
      '<p class="sub">' + a.studied + " of " + a.total + " topics studied</p>" +
      '<button type="button" class="btn btn-secondary" data-act="switch-prog">' + I.swap + "Change programme</button>" +
      '<p class="hint">Each programme keeps its own progress. Switching never erases another programme.</p></section>';

    var kv = [];
    if (meta.title) kv.push(["Syllabus", meta.title]);
    kv.push(["Version", meta.syllabus_version || "Not stated"]);
    if (p.syllabus_version && p.syllabus_version !== meta.syllabus_version) kv.push(["Programme version", p.syllabus_version]);
    kv.push(["Source", ctx.source === "imported" ? "Imported on this device" + (ctx.override.filename ? " (" + ctx.override.filename + ")" : "") : "Installed with the app"]);
    if (meta.scope) kv.push(["Scope", meta.scope]);
    var notes = (meta.editorial_notes || []), srcs = (meta.sources || []);
    html += '<section class="card"><h2 class="h2">Syllabus information</h2><dl class="kv-list">' + kv.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (meta.source_notes ? '<p class="note">' + esc(meta.source_notes) + "</p>" : "") + (p.source_notes ? '<p class="note">' + esc(p.source_notes) + "</p>" : "") +
      (notes.length ? '<h3 class="h3">Please note</h3><ul class="bullets">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
      (srcs.length ? '<details class="about"><summary>Sources (' + srcs.length + ")</summary><ul class=\"srclist\">" + srcs.map(function (x) {
        return "<li><b>" + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || x.id) + "</a>" : esc(x.title || x.id)) + "</b> <span class=\"sid\">" + esc(x.id) + "</span>" +
          (x.usedFor ? "<span>Used for: " + esc(x.usedFor) + "</span>" : "") + (x.caution ? "<span>Caution: " + esc(x.caution) + "</span>" : "") + "</li>";
      }).join("") + "</ul></details>" : "") +
      (ctx.source === "imported" ? '<button type="button" class="btn btn-secondary" data-act="revert-override">Remove imported syllabus</button>' : "") + "</section>";

    if (un.length) {
      var reasons = { programme_missing: "Programme no longer in the syllabus", topic_missing: "Topic ID not found", not_applicable: "Topic no longer applies to this programme" };
      html += '<section class="card" id="unmatched"><h2 class="h2">Saved statuses to review</h2><p>' + plural(un.length, "saved status", "saved statuses") + " no longer match the current syllabus. They are kept safe and are not counted.</p>" +
        '<details><summary>Show details</summary><ul class="issues">' + un.slice(0, 60).map(function (u) { return "<li><b>" + esc(u.topicId) + "</b> · " + esc(u.programmeId) + " · " + LABEL[u.status] + "<br><span>" + reasons[u.reason] + "</span></li>"; }).join("") + "</ul>" +
        (un.length > 60 ? "<p>…and " + (un.length - 60) + " more.</p>" : "") + "</details></section>";
    }

    html += '<section class="card"><h2 class="h2">Backup</h2><p>Save your progress to a file, or restore it on another device.</p><div class="btn-row">' +
      '<button type="button" class="btn btn-secondary" data-act="export-backup">' + I.download + 'Export backup</button><button type="button" class="btn btn-secondary" data-act="restore-pick">' + I.upload + "Restore backup</button></div>" +
      '<input id="restore-file" type="file" accept="application/json,.json" hidden></section>';

    html += '<section class="card"><h2 class="h2">Reset</h2><p>Reset is permanent, so you will be asked to confirm.</p><div class="btn-row">' +
      '<button type="button" class="btn btn-danger" data-act="reset-prog">Reset this programme</button><button type="button" class="btn btn-danger" data-act="reset-all">Reset everything</button></div></section>';

    html += '<p class="foot">PORIDHI · Syllabus &amp; Admission Preparation Tracker</p>';
    return html;
  }

  /* ---------- sheets, dialogs, toast ---------- */

  function openLayer(html, cls) {
    openerEl = document.activeElement;
    layer.innerHTML = '<div class="scrim" data-act="close-layer"></div><div class="sheet ' + cls + '" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">' + html + "</div>";
    document.body.classList.add("noscroll");
    var sh = layer.querySelector(".sheet");
    var first = sh.querySelector("[data-autofocus]") || sh.querySelector("button, input, select, a[href]");
    try { (first || sh).focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function closeLayer(silent) {
    if (!layer.firstChild) return;
    layer.innerHTML = "";
    document.body.classList.remove("noscroll");
    dialogConfirm = null;
    if (!silent && openerEl && document.contains(openerEl)) { try { openerEl.focus(); } catch (e) { /* ignore */ } }
    openerEl = null;
  }

  function openDialog(o) {
    dialogConfirm = o.onConfirm;
    openLayer('<h2 id="sheet-title" class="sheet-title">' + esc(o.title) + '</h2><div class="dialog-body">' + o.body + '</div><div class="btn-row dialog-actions"><button type="button" class="btn btn-secondary" data-act="close-layer" data-autofocus>Cancel</button>' +
      '<button type="button" class="btn ' + (o.danger ? "btn-danger" : "") + '" data-act="dialog-confirm">' + esc(o.confirm) + "</button></div>", "dialog");
  }

  function openProgrammeSheet() {
    var ix = ctx.ix, cur = S.getProfile().programmeId;
    var html = '<div class="sheet-head"><div><p class="eyebrow">Programme</p><h2 id="sheet-title" class="sheet-title">Choose your programme</h2></div><button type="button" class="icon-btn" data-act="close-layer" aria-label="Close">' + I.close + '</button></div><ul class="options">' +
      ix.data.programmes.map(function (p) {
        var s = C.computeStats(ix.view(p.programme_id), S.getProgress(p.programme_id)).all, on = p.programme_id === cur;
        return '<li><button type="button" class="option' + (on ? " is-current" : "") + '" data-act="pick-prog" data-pid="' + esc(p.programme_id) + '"' + (on ? ' aria-current="true" data-autofocus' : "") + '><span class="option-body"><span class="option-title">' + esc(pname(p)) + (on ? " <em>current</em>" : "") + "</span>" +
          (progLine(p) ? '<span class="option-sub">' + esc(progLine(p)) + "</span>" : "") + '<span class="option-sub">' + s.studied + " of " + s.total + " topics studied</span></span>" + (on ? I.check : "") + "</button></li>";
      }).join("") + "</ul>";
    openLayer(html, "");
  }

  function toast(msg, undo) {
    clearTimeout(toastTimer);
    ctx.undo = undo || null;
    toastEl.innerHTML = "<span>" + esc(msg) + "</span>" + (undo ? '<button type="button" data-act="undo">Undo</button>' : "");
    toastEl.classList.add("show");
    toastTimer = setTimeout(hideToast, undo ? 6000 : 3200);
  }
  function hideToast() { toastEl.classList.remove("show"); ctx.undo = null; }

  /* ---------- actions ---------- */

  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function act(name, el) {
    var prof = S.getProfile();
    switch (name) {
      case "status": openStatusSheet(el.getAttribute("data-tid")); break;
      case "set-status": setStatus(el.getAttribute("data-tid"), el.getAttribute("data-st")); break;
      case "more":
        var li = el.closest(".topic"), d = li.querySelector(".topic-detail"), open = d.hasAttribute("hidden");
        if (open) d.removeAttribute("hidden"); else d.setAttribute("hidden", "");
        el.setAttribute("aria-expanded", String(open)); li.classList.toggle("open", open);
        break;
      case "back": goBack(el.getAttribute("data-fallback") || "#/home"); break;
      case "close-layer": closeLayer(); break;
      case "switch-prog": openProgrammeSheet(); break;
      case "pick-prog":
        closeLayer(true);
        if (el.getAttribute("data-pid") !== prof.programmeId) { S.updateProfile({ programmeId: el.getAttribute("data-pid") }); go("#/home"); toast("Switched to " + pname(ctx.ix.programmeById[el.getAttribute("data-pid")])); }
        break;
      case "undo": var u = ctx.undo; hideToast(); if (u) u(); break;
      case "chip":
        var key = el.getAttribute("data-key"), val = el.getAttribute("data-val");
        if (key === "status") ctx.f.status = val;
        else if (key === "layer") ctx.f.layer = ctx.f.layer === val ? "" : val;
        else if (key === "cond") ctx.f.cond = !ctx.f.cond;
        ctx.limit = 150; updateTopicsBody(); break;
      case "more-results": ctx.limit += 150; document.getElementById("results").innerHTML = resultsHtml(); break;
      case "wel-pick": ctx.pending = el.getAttribute("data-pid"); ctx.step = "confirm"; route(true); break;
      case "wel-back-name": ctx.step = "name"; route(true); break;
      case "wel-back-programme": ctx.step = "programme"; ctx.pending = ""; route(true); break;
      case "wel-confirm":
        S.updateProfile({ programmeId: ctx.pending }); ctx.pending = ""; ctx.step = "done";
        goReplace("#/home"); break;
      case "export-backup":
        download("poridhi-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(S.exportBackup(), null, 1), "application/json");
        toast("Backup saved to your downloads"); break;
      case "restore-pick": document.getElementById("restore-file").click(); break;
      case "dialog-confirm": var fn = dialogConfirm; closeLayer(true); if (fn) fn(); break;
      case "reset-prog":
        var pid = prof.programmeId, n = S.countRecords(pid), pn = pname(ctx.view.programme);
        openDialog({
          title: "Reset " + pn + "?", danger: true, confirm: "Yes, reset " + pn,
          body: "<p>This clears <b>" + plural(n, "saved topic status", "saved topic statuses") + "</b> for " + esc(pn) + ". Every topic goes back to Not started.</p><p>Your name, your other programmes’ progress and the syllabus are not touched.</p>",
          onConfirm: function () { S.clearProgramme(pid); refresh(); toast("Progress reset for " + pn); }
        }); break;
      case "reset-all":
        var all = S.totalRecords(), progs = Object.keys(S.allProgress()).filter(function (k) { return S.countRecords(k) > 0; }).length;
        openDialog({
          title: "Reset everything?", danger: true, confirm: "Yes, reset everything",
          body: "<p>This clears your name, your programme choice and <b>" + plural(all, "saved topic status", "saved topic statuses") + "</b> across " + plural(progs, "programme") + ". The app returns to the first screen.</p><p>The syllabus itself is not touched. Export a backup first if you might want this back.</p>",
          onConfirm: function () { S.clearAll(); ctx.step = "name"; ctx.pending = ""; goReplace("#/"); }
        }); break;
      case "revert-override":
        openDialog({
          title: "Remove the imported syllabus?", confirm: "Remove",
          body: "<p>This device goes back to the syllabus installed with the app" + (window.PORIDHI_SYLLABUS ? "" : " (none yet)") + ". Your saved statuses are kept.</p>",
          onConfirm: function () { S.clearOverride(); loadSyllabus(); goReplace("#/home"); }
        }); break;
    }
  }

  /* ---------- events ---------- */

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href^='#/']");
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.getAttribute("target") !== "_blank") {
      e.preventDefault(); closeLayer(true); go(a.getAttribute("href")); return;
    }
    var el = e.target.closest("[data-act]");
    if (el) act(el.getAttribute("data-act"), el);
  });

  document.addEventListener("submit", function (e) {
    var id = e.target.id;
    if (id === "name-form") {
      e.preventDefault();
      var v = document.getElementById("name-input").value.trim();
      if (!v) { document.getElementById("name-error").hidden = false; document.getElementById("name-input").focus(); return; }
      S.updateProfile({ name: v });
      ctx.step = ctx.mode === "ready" && ctx.ix.programmeById[S.getProfile().programmeId] ? "done" : "programme";
      route(true);
    } else if (id === "profile-name-form") {
      e.preventDefault();
      var n = document.getElementById("profile-name").value.trim();
      if (!n) { document.getElementById("profile-name-error").hidden = false; return; }
      S.updateProfile({ name: n });
      document.getElementById("profile-name-error").hidden = true;
      toast("Name updated");
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "q") {
      ctx.f.q = e.target.value.trim(); ctx.limit = 150;
      clearTimeout(act.t);
      act.t = setTimeout(updateTopicsBody, 120);
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "stat-subject") {
      history.replaceState({ d: depth }, "", "#/stats?s=" + enc(e.target.value));
      route(false);
      var sel = document.getElementById("stat-subject"); if (sel) sel.focus();
    } else if (e.target.id === "restore-file" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0], fr = new FileReader();
      fr.onload = function () {
        var res = S.parseBackup(String(fr.result));
        e.target.value = "";
        if (!res.ok) { toast(res.error); return; }
        var when = res.exportedAt ? new Date(res.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "unknown date";
        openDialog({
          title: "Restore this backup?", danger: true, confirm: "Replace my progress",
          body: "<p>Backup from <b>" + esc(when) + "</b> with <b>" + plural(res.records, "saved topic status", "saved topic statuses") + "</b> across " + plural(res.programmes, "programme") + ".</p><p>This <b>replaces</b> the progress currently on this device.</p>",
          onConfirm: function () { S.applyBackup(res); ctx.step = S.getProfile().name ? "done" : "name"; goReplace("#/home"); toast("Backup restored"); }
        });
      };
      fr.readAsText(file);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (!layer.firstChild) return;
    if (e.key === "Escape") { e.preventDefault(); closeLayer(); return; }
    if (e.key === "Tab") {
      var f = layer.querySelectorAll("button, a[href], input, select"), list = Array.prototype.filter.call(f, function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener("popstate", function (e) { depth = (e.state && e.state.d) || 0; route(true); });

  /* ---------- start ---------- */

  loadSyllabus();
  var p0 = S.getProfile();
  ctx.step = p0.name ? "done" : "name";
  history.replaceState({ d: 0 }, "", location.href);
  route(true);

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* offline support is optional */ }); });
  }
})();
