/* PORIDHI core
   Syllabus import/validation and progress maths. No DOM and no storage in here,
   so the same file runs in the browser and in the Node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PoridhiCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STATUSES = ["not_started", "in_progress", "studied", "needs_revision"];
  var STATUS_LABEL = { not_started: "Not started", in_progress: "In progress", studied: "Studied", needs_revision: "Needs revision" };
  var STATUS_SET = { not_started: 1, in_progress: 1, studied: 1, needs_revision: 1 };
  var APPLICABILITY = ["required", "conditional", "optional", "excluded", "unverified"];
  var LIST_CAP = 20;

  /* ---------- small helpers ---------- */

  function str(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function norm(v) { return str(v).toLowerCase().replace(/\s+/g, " "); }
  function uniq(a) {
    var seen = {}, out = [];
    a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function idList(v) {
    if (Array.isArray(v)) return v.map(str).filter(Boolean);
    var t = str(v);
    return t ? t.split(/[;|,]/).map(str).filter(Boolean) : [];
  }
  function num(v) {
    if (v === null || v === undefined || str(v) === "") return { state: "none" };
    var n = Number(str(v));
    return isFinite(n) ? { state: "ok", n: n } : { state: "bad" };
  }
  function sample(list) {
    return list.slice(0, LIST_CAP).join("; ") + (list.length > LIST_CAP ? " … and " + (list.length - LIST_CAP) + " more" : "");
  }
  function sortByOrder(list, key) {
    return list
      .map(function (x, i) { return { x: x, i: i }; })
      .sort(function (a, b) { return (a.x[key] - b.x[key]) || (a.i - b.i); })
      .map(function (o) { return o.x; });
  }

  /* ---------- normalise + validate ----------
     Input: relational object { meta, programmes[], subjects[], chapters[], topics[] }.
     Output: { ok, data, errors[], warnings[], counts }. data is null when there are errors. */

  function normalise(raw) {
    var errors = [], warnings = [];
    function err(where, msg) { errors.push({ where: where, msg: msg }); }
    function warn(where, msg) { warnings.push({ where: where, msg: msg }); }
    function label(kind, i, item, idKey) {
      if (item && item._src) return item._src;
      var id = item && item[idKey] ? ' "' + str(item[idKey]) + '"' : "";
      return kind + "[" + i + "]" + id;
    }
    function finish(built) {
      var counts = built ? { programmes: built.programmes.length, subjects: built.subjects.length, chapters: built.chapters.length, topics: built.topics.length } : null;
      return { ok: errors.length === 0, data: errors.length ? null : built, errors: errors, warnings: warnings, counts: counts };
    }

    if (!isObj(raw)) {
      err("file", "The syllabus must be an object with programmes, subjects, chapters and topics lists.");
      return finish(null);
    }
    ["programmes", "subjects", "chapters", "topics"].forEach(function (k) {
      if (!Array.isArray(raw[k])) err("file", 'Missing "' + k + '" list.');
    });
    if (errors.length) return finish(null);

    var noOrder = { subjects: 0, chapters: 0, topics: 0 };

    /* programmes */
    var programmes = [], pById = {};
    raw.programmes.forEach(function (x, i) {
      var w = label("programmes", i, x, "programme_id");
      if (!isObj(x)) { err(w, "Not an object."); return; }
      var id = str(x.programme_id);
      if (!id) { err(w, "Missing programme_id."); return; }
      if (pById[id]) { err(w, 'Duplicate programme_id "' + id + '".'); return; }
      if (!str(x.programme_name)) err(w, "Missing programme_name.");
      var o = {
        programme_id: id, programme_name: str(x.programme_name), admission_track: str(x.admission_track),
        institution_or_unit: str(x.institution_or_unit), syllabus_version: str(x.syllabus_version), source_notes: str(x.source_notes),
        description: str(x.description), subjects_summary: str(x.subjects_summary), distinction: str(x.distinction), caveat: str(x.caveat)
      };
      pById[id] = o; programmes.push(o);
    });

    /* subjects */
    var subjects = [], sById = {};
    raw.subjects.forEach(function (x, i) {
      var w = label("subjects", i, x, "subject_id");
      if (!isObj(x)) { err(w, "Not an object."); return; }
      var id = str(x.subject_id);
      if (!id) { err(w, "Missing subject_id."); return; }
      if (sById[id]) { err(w, 'Duplicate subject_id "' + id + '".'); return; }
      if (!str(x.subject_name)) err(w, "Missing subject_name.");
      var ord = num(x.subject_order);
      if (ord.state === "bad") err(w, "subject_order must be a number.");
      if (ord.state === "none") noOrder.subjects++;
      var pids = uniq(idList(x.programme_ids !== undefined ? x.programme_ids : x.programme_id));
      if (!pids.length) err(w, "No programmes listed (programme_ids). A subject must belong to at least one programme.");
      pids.forEach(function (pid) { if (!pById[pid]) err(w, 'Unknown programme "' + pid + '" in programme_ids.'); });
      var o = { subject_id: id, subject_name: str(x.subject_name), subject_order: ord.state === "ok" ? ord.n : i + 1, icon_key: str(x.icon_key), programme_ids: pids };
      sById[id] = o; subjects.push(o);
    });

    /* chapters */
    var chapters = [], cById = {};
    raw.chapters.forEach(function (x, i) {
      var w = label("chapters", i, x, "chapter_id");
      if (!isObj(x)) { err(w, "Not an object."); return; }
      var id = str(x.chapter_id), sid = str(x.subject_id);
      if (!id) { err(w, "Missing chapter_id."); return; }
      if (cById[id]) { err(w, 'Duplicate chapter_id "' + id + '".'); return; }
      if (!str(x.chapter_name)) err(w, "Missing chapter_name.");
      if (!sid) err(w, "Missing subject_id.");
      else if (!sById[sid]) err(w, 'Unknown subject_id "' + sid + '".');
      var ord = num(x.chapter_order);
      if (ord.state === "bad") err(w, "chapter_order must be a number.");
      if (ord.state === "none") noOrder.chapters++;
      var o = { chapter_id: id, subject_id: sid, chapter_name: str(x.chapter_name), chapter_number: str(x.chapter_number), chapter_section: str(x.chapter_section), chapter_order: ord.state === "ok" ? ord.n : i + 1 };
      cById[id] = o; chapters.push(o);
    });

    /* topics */
    var topics = [], tById = {};
    var ignored = [], orphanTopics = [];
    raw.topics.forEach(function (x, i) {
      var w = label("topics", i, x, "topic_id");
      if (!isObj(x)) { err(w, "Not an object."); return; }
      var id = str(x.topic_id), cid = str(x.chapter_id);
      if (!id) { err(w, "Missing topic_id."); return; }
      if (tById[id]) { err(w, 'Duplicate topic_id "' + id + '".'); return; }
      if (!str(x.topic_name)) err(w, "Missing topic_name.");
      var ch = cById[cid];
      if (!cid) err(w, "Missing chapter_id.");
      else if (!ch) err(w, 'Unknown chapter_id "' + cid + '".');
      var ord = num(x.topic_order);
      if (ord.state === "bad") err(w, "topic_order must be a number.");
      if (ord.state === "none") noOrder.topics++;

      var defApp = str(x.applicability).toLowerCase(), defLayer = str(x.coverage_layer);
      if (defApp && APPLICABILITY.indexOf(defApp) < 0) {
        err(w, 'Unknown applicability "' + str(x.applicability) + '". Use required, conditional, optional or excluded.');
        defApp = "";
      }
      var map = {};
      function put(pid, a, l) {
        if (!pById[pid]) { err(w, 'Unknown programme "' + pid + '".'); return; }
        var app = str(a).toLowerCase() || defApp;
        if (app && APPLICABILITY.indexOf(app) < 0) {
          err(w, 'Unknown applicability "' + str(a) + '" for programme "' + pid + '".');
          app = "";
        }
        map[pid] = { applicability: app, coverage_layer: str(l) || defLayer };
      }
      if (isObj(x.programmes)) {
        Object.keys(x.programmes).forEach(function (pid) {
          var e = x.programmes[pid];
          if (isObj(e)) put(pid, e.applicability, e.coverage_layer);
          else if (typeof e === "string") put(pid, e, "");
          else put(pid, "", "");
        });
      } else {
        var ids = uniq(idList(x.programme_ids !== undefined ? x.programme_ids : x.programme_id));
        if (!ids.length && ch && sById[ch.subject_id]) ids = sById[ch.subject_id].programme_ids.slice();
        ids.forEach(function (pid) { put(pid, "", ""); });
      }
      if (ch && sById[ch.subject_id]) {
        var allowed = sById[ch.subject_id].programme_ids;
        Object.keys(map).forEach(function (pid) {
          if (allowed.indexOf(pid) < 0) { ignored.push(id + " → " + pid); delete map[pid]; }
        });
        if (!Object.keys(map).length) orphanTopics.push(id);
      }
      var o = {
        topic_id: id, chapter_id: cid, topic_name: str(x.topic_name), topic_order: ord.state === "ok" ? ord.n : i + 1,
        description: str(x.description), source_reference: str(x.source_reference), programmes: map
      };
      tById[id] = o; topics.push(o);
    });

    /* applicability: if the file uses it anywhere, topics without a value are "unverified" */
    var usesApplicability = false, unverified = 0;
    topics.forEach(function (t) {
      Object.keys(t.programmes).forEach(function (pid) { if (t.programmes[pid].applicability) usesApplicability = true; });
    });
    if (usesApplicability) {
      topics.forEach(function (t) {
        Object.keys(t.programmes).forEach(function (pid) {
          if (!t.programmes[pid].applicability) { t.programmes[pid].applicability = "unverified"; unverified++; }
        });
      });
    }

    /* warnings (non-blocking) */
    ["subjects", "chapters", "topics"].forEach(function (k) {
      if (noOrder[k]) warn(k, noOrder[k] + " " + k + " have no " + k.slice(0, -1) + "_order, so file order is used for them.");
    });
    if (ignored.length) warn("topics", "Topics mapped to a programme that does not include their subject are ignored: " + sample(ignored) + ".");
    if (orphanTopics.length) warn("topics", "Topics that apply to no programme: " + sample(orphanTopics) + ".");
    if (unverified) warn("topics", unverified + " topic placements have no applicability while others do. They are marked Unverified and still counted.");

    var chapterTopicCount = {}, subjectChapterCount = {};
    topics.forEach(function (t) { chapterTopicCount[t.chapter_id] = (chapterTopicCount[t.chapter_id] || 0) + 1; });
    chapters.forEach(function (c) { subjectChapterCount[c.subject_id] = (subjectChapterCount[c.subject_id] || 0) + 1; });
    var emptyCh = chapters.filter(function (c) { return !chapterTopicCount[c.chapter_id]; }).map(function (c) { return c.chapter_id; });
    var emptySub = subjects.filter(function (s) { return !subjectChapterCount[s.subject_id]; }).map(function (s) { return s.subject_id; });
    var emptyProg = programmes.filter(function (p) { return !subjects.some(function (s) { return s.programme_ids.indexOf(p.programme_id) >= 0; }); }).map(function (p) { return p.programme_id; });
    if (emptyCh.length) warn("chapters", "Chapters with no topics: " + sample(emptyCh) + ".");
    if (emptySub.length) warn("subjects", "Subjects with no chapters: " + sample(emptySub) + ".");
    if (emptyProg.length) warn("programmes", "Programmes with no subjects: " + sample(emptyProg) + ".");

    function dupNames(items, parentOf, nameOf, idOf, where, kind) {
      var g = {}, out = [];
      items.forEach(function (it) {
        var n = norm(nameOf(it));
        if (!n) return;
        var k = parentOf(it) + "\u0001" + n;
        (g[k] = g[k] || []).push(idOf(it));
      });
      Object.keys(g).forEach(function (k) { if (g[k].length > 1) out.push(g[k].join(" / ")); });
      if (out.length) warn(where, "Duplicate-looking " + kind + " names (kept as they are, please review): " + sample(out) + ".");
    }
    dupNames(subjects, function (s) { return s.programme_ids.join(","); }, function (s) { return s.subject_name; }, function (s) { return s.subject_id; }, "subjects", "subject");
    dupNames(chapters, function (c) { return c.subject_id; }, function (c) { return c.chapter_name; }, function (c) { return c.chapter_id; }, "chapters", "chapter");
    dupNames(topics, function (t) { return t.chapter_id; }, function (t) { return t.topic_name; }, function (t) { return t.topic_id; }, "topics", "topic");

    function dupOrders(items, parentOf, orderOf, idOf, where, kind) {
      var g = {}, out = [];
      items.forEach(function (it) { var k = parentOf(it) + "\u0001" + orderOf(it); (g[k] = g[k] || []).push(idOf(it)); });
      Object.keys(g).forEach(function (k) { if (g[k].length > 1) out.push(g[k].join(" / ")); });
      if (out.length) warn(where, "Several " + kind + "s share the same order number (file order is kept): " + sample(out) + ".");
    }
    dupOrders(subjects, function (s) { return s.programme_ids.join(","); }, function (s) { return s.subject_order; }, function (s) { return s.subject_id; }, "subjects", "subject");
    dupOrders(chapters, function (c) { return c.subject_id; }, function (c) { return c.chapter_order; }, function (c) { return c.chapter_id; }, "chapters", "chapter");
    dupOrders(topics, function (t) { return t.chapter_id; }, function (t) { return t.topic_order; }, function (t) { return t.topic_id; }, "topics", "topic");

    var m = isObj(raw.meta) ? raw.meta : {};
    var metaSources = (Array.isArray(m.sources) ? m.sources : []).filter(isObj).map(function (s) {
      return { id: str(s.id), title: str(s.title), url: str(s.url), usedFor: str(s.usedFor), caution: str(s.caution) };
    }).filter(function (s) { return s.id; });
    var metaOut = {
      title: str(m.title), syllabus_version: str(m.syllabus_version), source_notes: str(m.source_notes), scope: str(m.scope),
      editorial_notes: (Array.isArray(m.editorial_notes) ? m.editorial_notes : []).map(str).filter(Boolean),
      sources: metaSources, dev_sample: m.dev_sample === true
    };
    if (metaSources.length) {
      var known = {}, unknownRefs = [];
      metaSources.forEach(function (s) { known[s.id] = 1; });
      topics.forEach(function (t) { if (t.source_reference && !known[t.source_reference]) unknownRefs.push(t.topic_id + " → " + t.source_reference); });
      if (unknownRefs.length) warn("topics", "Topics cite a source that is not in the sources list: " + sample(unknownRefs) + ".");
    }
    var built = {
      meta: metaOut,
      programmes: programmes,
      subjects: sortByOrder(subjects, "subject_order"),
      chapters: sortByOrder(chapters, "chapter_order"),
      topics: sortByOrder(topics, "topic_order")
    };
    return finish(built);
  }

  /* ---------- CSV (flat sheet: one row per topic per programme) ---------- */

  function parseCsv(text, delim) {
    var rows = [], row = [], f = "", q = false, i, c;
    text = String(text).replace(/^﻿/, "");
    if (!delim) {
      var first = text.split(/\r?\n/, 1)[0] || "";
      var counts = { ",": 0, ";": 0, "\t": 0 };
      for (i = 0; i < first.length; i++) if (counts[first[i]] !== undefined) counts[first[i]]++;
      delim = ",";
      if (counts[";"] > counts[delim]) delim = ";";
      if (counts["\t"] > counts[delim]) delim = "\t";
    }
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; rows.push(row); row = [];
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  function csvToRaw(text) {
    var errors = [];
    var rows = parseCsv(text);
    if (!rows.length || (rows.length === 1 && !rows[0].some(function (c) { return str(c); }))) {
      return { raw: null, errors: [{ where: "file", msg: "The file is empty." }] };
    }
    var header = rows[0].map(function (h) { return str(h).toLowerCase().replace(/[\s\-]+/g, "_"); });
    var needed = ["programme_id", "programme_name", "subject_id", "subject_name", "chapter_id", "chapter_name", "topic_id", "topic_name"];
    var missing = needed.filter(function (h) { return header.indexOf(h) < 0; });
    if (missing.length) return { raw: null, errors: [{ where: "header row", msg: "Missing column(s): " + missing.join(", ") + "." }] };

    var out = { programmes: [], subjects: [], chapters: [], topics: [] };
    var maps = { p: {}, s: {}, c: {}, t: {} };

    function merge(map, list, key, rec, fields, kind, src) {
      var cur = map[key];
      if (!cur) { rec._src = src; map[key] = rec; list.push(rec); return rec; }
      fields.forEach(function (f) {
        var a = str(cur[f]), b = str(rec[f]);
        if (a && b && a !== b) errors.push({ where: src, msg: "Conflicting " + f + " for " + kind + ' "' + key + '" ("' + b + '" here, "' + a + '" in ' + cur._src + ")." });
        else if (!a && b) cur[f] = rec[f];
      });
      return cur;
    }

    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (cells.every(function (c) { return !str(c); })) continue;
      var o = {};
      header.forEach(function (h, k) { if (h) o[h] = cells[k] === undefined ? "" : cells[k]; });
      var src = "row " + (r + 1);
      var pid = str(o.programme_id), sid = str(o.subject_id), cid = str(o.chapter_id), tid = str(o.topic_id);
      var absent = [];
      if (!pid) absent.push("programme_id");
      if (!sid) absent.push("subject_id");
      if (!cid) absent.push("chapter_id");
      if (!tid) absent.push("topic_id");
      if (absent.length) { errors.push({ where: src, msg: "Missing " + absent.join(", ") + ". Every row needs stable IDs." }); continue; }

      merge(maps.p, out.programmes, pid, { programme_id: pid, programme_name: o.programme_name, admission_track: o.admission_track, institution_or_unit: o.institution_or_unit, syllabus_version: o.syllabus_version, source_notes: o.source_notes },
        ["programme_name", "admission_track", "institution_or_unit", "syllabus_version", "source_notes"], "programme", src);
      var sub = merge(maps.s, out.subjects, sid, { subject_id: sid, subject_name: o.subject_name, subject_order: o.subject_order, icon_key: o.icon_key, programme_ids: [] },
        ["subject_name", "subject_order", "icon_key"], "subject", src);
      if (sub.programme_ids.indexOf(pid) < 0) sub.programme_ids.push(pid);
      merge(maps.c, out.chapters, cid, { chapter_id: cid, subject_id: sid, chapter_name: o.chapter_name, chapter_number: o.chapter_number, chapter_order: o.chapter_order },
        ["subject_id", "chapter_name", "chapter_number", "chapter_order"], "chapter", src);
      var top = merge(maps.t, out.topics, tid, { topic_id: tid, chapter_id: cid, topic_name: o.topic_name, topic_order: o.topic_order, description: o.description, source_reference: o.source_reference, programmes: {} },
        ["chapter_id", "topic_name", "topic_order", "description", "source_reference"], "topic", src);
      if (top.programmes[pid]) errors.push({ where: src, msg: 'Duplicate row for topic "' + tid + '" in programme "' + pid + '" (first in ' + top.programmes[pid]._src + ")." });
      else top.programmes[pid] = { applicability: o.applicability, coverage_layer: o.coverage_layer, _src: src };
    }
    return { raw: out, errors: errors };
  }

  /* ---------- nested format (programme > subject > chapter > topic) ----------
     Only topics carry IDs in this format. Subject and chapter IDs are derived from the supplied
     programme id, subject name, paper/section and chapter number (never from position), so they
     stay the same when the file is re-imported. Progress is saved by the supplied topic ids. */

  function slug(v) {
    var t = str(v).toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
    return t || "x";
  }

  function isNested(raw) {
    return isObj(raw) && Array.isArray(raw.programmes) && !Array.isArray(raw.subjects) &&
      raw.programmes.some(function (p) { return isObj(p) && Array.isArray(p.subjects); });
  }

  function nestedToRaw(j) {
    var errors = [], warnings = [];
    var out = { programmes: [], subjects: [], chapters: [], topics: [] };
    function err(where, msg) { errors.push({ where: where, msg: msg }); }
    out.meta = {
      syllabus_version: str(j.catalogueVersion), scope: str(j.scope),
      editorial_notes: Array.isArray(j.editorialNotes) ? j.editorialNotes : [], sources: Array.isArray(j.sources) ? j.sources : []
    };
    if (Array.isArray(j.statuses)) {
      var got = j.statuses.map(norm).join("|");
      if (got !== "not started|in progress|studied|needs revision") {
        warnings.push({ where: "statuses", msg: "The file lists statuses (" + j.statuses.join(", ") + ") that differ from PORIDHI's four: Not started, In progress, Studied, Needs revision. PORIDHI always uses its own four." });
      }
    }
    var nonDefault = [];
    j.programmes.forEach(function (p, pi) {
      var pw = "programmes[" + pi + "]" + (p && p.id ? ' "' + str(p.id) + '"' : "");
      if (!isObj(p)) { err(pw, "Not an object."); return; }
      var pid = str(p.id);
      out.programmes.push({
        programme_id: pid, programme_name: p.name, admission_track: p.admission_track, institution_or_unit: p.institution_or_unit,
        source_notes: p.research_basis, description: p.description, subjects_summary: p.subjects_summary, distinction: p.distinction, caveat: p.caveat, _src: pw
      });
      if (!Array.isArray(p.subjects)) { err(pw, 'Missing "subjects" list.'); return; }
      p.subjects.forEach(function (s, si) {
        var sw = pw + " › subjects[" + si + "]" + (s && s.name ? ' "' + str(s.name) + '"' : "");
        if (!isObj(s)) { err(sw, "Not an object."); return; }
        if (!str(s.name)) { err(sw, "Missing subject name."); return; }
        var sid = pid + "/" + slug(s.name);
        out.subjects.push({ subject_id: sid, subject_name: s.name, subject_order: si + 1, programme_ids: [pid], _src: sw });
        if (!Array.isArray(s.chapters)) { err(sw, 'Missing "chapters" list.'); return; }
        s.chapters.forEach(function (c, ci) {
          var cw = sw + " › chapters[" + ci + "]" + (c && c.title ? ' "' + str(c.title) + '"' : "");
          if (!isObj(c)) { err(cw, "Not an object."); return; }
          if (!str(c.chapterNo)) { err(cw, "Missing chapterNo (needed to build a stable chapter ID)."); return; }
          var cid = sid + "/" + (str(c.paperOrSection) ? slug(c.paperOrSection) + "-" : "") + slug(c.chapterNo);
          out.chapters.push({ chapter_id: cid, subject_id: sid, chapter_name: c.title, chapter_number: c.chapterNo, chapter_section: c.paperOrSection, chapter_order: ci + 1, _src: cw });
          if (!Array.isArray(c.topics)) { err(cw, 'Missing "topics" list.'); return; }
          c.topics.forEach(function (t, ti) {
            var tw = cw + " › topics[" + ti + "]" + (t && t.id ? ' "' + str(t.id) + '"' : "");
            if (!isObj(t)) { err(tw, "Not an object."); return; }
            if (t.defaultStatus && norm(t.defaultStatus) !== "not started") nonDefault.push(str(t.id));
            out.topics.push({
              topic_id: t.id, chapter_id: cid, topic_name: t.title, topic_order: ti + 1, coverage_layer: t.coverageLayer,
              description: t.notes, source_reference: t.sourceId, programme_ids: [pid], _src: tw
            });
          });
        });
      });
    });
    if (nonDefault.length) warnings.push({ where: "topics", msg: nonDefault.length + " topics have a defaultStatus other than Not Started. PORIDHI starts every topic as Not started: " + sample(nonDefault) + "." });
    return { raw: out, errors: errors, warnings: warnings };
  }

  /* Accepts either the relational object or the nested one. */
  function normaliseAny(raw) {
    if (!isNested(raw)) return normalise(raw);
    var n = nestedToRaw(raw);
    var res = normalise(n.raw);
    if (n.errors.length) { res.errors = n.errors.concat(res.errors); res.ok = false; res.data = null; }
    res.warnings = n.warnings.concat(res.warnings);
    res.format = "nested";
    return res;
  }

  /* Read a JSON or CSV file's text into a validated result. */
  function importText(text, filename) {
    var name = str(filename).toLowerCase();
    var t = String(text).replace(/^﻿/, "");
    var asJson = /\.json$/.test(name) || (!/\.(csv|tsv|txt)$/.test(name) && /^\s*[{\[]/.test(t));
    var raw, pre = [], format = asJson ? "json" : "csv";
    if (asJson) {
      try { raw = JSON.parse(t); }
      catch (e) { return { ok: false, data: null, errors: [{ where: "file", msg: "This is not valid JSON: " + e.message }], warnings: [], counts: null, format: format }; }
    } else {
      var c = csvToRaw(t);
      if (!c.raw) return { ok: false, data: null, errors: c.errors, warnings: [], counts: null, format: format };
      raw = c.raw; pre = c.errors;
    }
    var res = normaliseAny(raw);
    if (pre.length) { res.errors = pre.concat(res.errors); res.ok = false; res.data = null; }
    res.format = res.format === "nested" ? "nested json" : format;
    return res;
  }

  /* ---------- index + per-programme view ---------- */

  function buildIndex(data) {
    var ix = { data: data, programmeById: {}, subjectById: {}, chapterById: {}, topicById: {}, chaptersBySubject: {}, topicsByChapter: {}, _views: {} };
    data.programmes.forEach(function (p) { ix.programmeById[p.programme_id] = p; });
    data.subjects.forEach(function (s) { ix.subjectById[s.subject_id] = s; });
    data.chapters.forEach(function (c) {
      ix.chapterById[c.chapter_id] = c;
      (ix.chaptersBySubject[c.subject_id] = ix.chaptersBySubject[c.subject_id] || []).push(c);
    });
    data.topics.forEach(function (t) {
      ix.topicById[t.topic_id] = t;
      (ix.topicsByChapter[t.chapter_id] = ix.topicsByChapter[t.chapter_id] || []).push(t);
    });
    ix.view = function (pid) {
      if (!ix._views[pid]) ix._views[pid] = makeView(ix, pid);
      return ix._views[pid];
    };
    return ix;
  }

  function makeView(ix, pid) {
    var programme = ix.programmeById[pid];
    if (!programme) return null;
    var v = { programme: programme, subjects: [], topicInfo: {}, chapterInfo: {}, subjectInfo: {}, total: 0, layers: [], mainLayer: "", hasConditional: false };
    var layerCount = {};
    ix.data.subjects.forEach(function (sub) {
      if (sub.programme_ids.indexOf(pid) < 0) return;
      var se = { subject: sub, chapters: [] };
      (ix.chaptersBySubject[sub.subject_id] || []).forEach(function (ch) {
        var ce = { chapter: ch, subject: sub, topics: [], n: 0 };
        (ix.topicsByChapter[ch.chapter_id] || []).forEach(function (t) {
          var e = t.programmes[pid];
          if (!e || e.applicability === "excluded") return;
          var te = { topic: t, chapter: ch, subject: sub, applicability: e.applicability, layer: e.coverage_layer };
          ce.topics.push(te);
          v.topicInfo[t.topic_id] = te;
          v.total++;
          if (e.coverage_layer) layerCount[e.coverage_layer] = (layerCount[e.coverage_layer] || 0) + 1;
          if (e.applicability === "conditional") v.hasConditional = true;
        });
        if (ce.topics.length) {
          ce.n = se.chapters.length + 1;
          se.chapters.push(ce);
          v.chapterInfo[ch.chapter_id] = ce;
        }
      });
      v.subjects.push(se);
      v.subjectInfo[sub.subject_id] = se;
    });
    v.layers = Object.keys(layerCount).sort(function (a, b) { return (layerCount[b] - layerCount[a]) || (a < b ? -1 : 1); });
    v.mainLayer = v.layers[0] || "";
    return v;
  }

  /* ---------- progress maths ---------- */

  function statusOf(prog, tid) {
    var r = prog && prog[tid];
    return r && STATUS_SET[r.s] && r.s !== "not_started" ? r.s : "not_started";
  }

  function pctLabel(studied, total) {
    if (!total || !studied) return 0;
    if (studied >= total) return 100;
    return Math.min(99, Math.max(1, Math.round(studied * 100 / total)));
  }

  /* Every figure comes from topic counts, never from averaging percentages. */
  function computeStats(view, prog) {
    function blank() { return { total: 0, studied: 0, in_progress: 0, needs_revision: 0, not_started: 0, remaining: 0, pct: 0, label: 0 }; }
    var all = blank(), bySubject = {}, byChapter = {};
    view.subjects.forEach(function (se) {
      var sb = blank(); bySubject[se.subject.subject_id] = sb;
      se.chapters.forEach(function (ce) {
        var cb = blank(); byChapter[ce.chapter.chapter_id] = cb;
        ce.topics.forEach(function (te) {
          var st = statusOf(prog, te.topic.topic_id);
          cb.total++; sb.total++; all.total++;
          cb[st]++; sb[st]++; all[st]++;
        });
      });
    });
    function fin(b) {
      b.remaining = b.total - b.studied;
      b.pct = b.total ? b.studied / b.total * 100 : 0;
      b.label = pctLabel(b.studied, b.total);
    }
    fin(all);
    Object.keys(bySubject).forEach(function (k) { fin(bySubject[k]); });
    Object.keys(byChapter).forEach(function (k) { fin(byChapter[k]); });
    return { all: all, bySubject: bySubject, byChapter: byChapter };
  }

  /* ---------- search + filters ---------- */

  function tokens(q) { return norm(q).split(" ").filter(Boolean); }
  function matcher(q) {
    var toks = tokens(q);
    return function (text) {
      var t = norm(text);
      return toks.every(function (k) { return t.indexOf(k) >= 0; });
    };
  }

  function search(view, q) {
    var out = { subjects: [], chapters: [], topics: [] };
    if (!tokens(q).length) return out;
    var hit = matcher(q);
    view.subjects.forEach(function (se) {
      if (hit(se.subject.subject_name)) out.subjects.push(se);
      se.chapters.forEach(function (ce) {
        if (hit(ce.chapter.chapter_name)) out.chapters.push(ce);
        ce.topics.forEach(function (te) { if (hit(te.topic.topic_name)) out.topics.push(te); });
      });
    });
    return out;
  }

  function filterTopics(view, prog, f) {
    var hit = f.q && tokens(f.q).length ? matcher(f.q) : null;
    var out = [];
    view.subjects.forEach(function (se) {
      se.chapters.forEach(function (ce) {
        ce.topics.forEach(function (te) {
          if (f.status && f.status !== "all" && statusOf(prog, te.topic.topic_id) !== f.status) return;
          if (f.layer && te.layer !== f.layer) return;
          if (f.cond && te.applicability !== "conditional") return;
          if (hit && !hit(te.topic.topic_name)) return;
          out.push(te);
        });
      });
    });
    return out;
  }

  /* ---------- records that no longer match the syllabus ---------- */

  function findUnmatched(ix, allProgress) {
    var out = [];
    Object.keys(allProgress || {}).forEach(function (pid) {
      var recs = allProgress[pid] || {};
      var view = ix.programmeById[pid] ? ix.view(pid) : null;
      Object.keys(recs).forEach(function (tid) {
        var st = statusOf(recs, tid);
        if (st === "not_started") return;
        if (!view) out.push({ programmeId: pid, topicId: tid, status: st, reason: "programme_missing" });
        else if (!ix.topicById[tid]) out.push({ programmeId: pid, topicId: tid, status: st, reason: "topic_missing" });
        else if (!view.topicInfo[tid]) out.push({ programmeId: pid, topicId: tid, status: st, reason: "not_applicable" });
      });
    });
    return out;
  }

  /* ---------- weekly "first marked studied" counts (real dates only) ---------- */

  function weekStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function weeklyStudied(view, prog, weeks, now) {
    var starts = [], cur = new Date(weekStart(now || Date.now()));
    for (var i = 0; i < weeks; i++) { starts.unshift(cur.getTime()); cur.setDate(cur.getDate() - 7); }
    var counts = starts.map(function (s) { return { start: s, count: 0 }; });
    var any = false;
    Object.keys(prog || {}).forEach(function (tid) {
      var r = prog[tid];
      if (!r || !r.f || !view.topicInfo[tid]) return;
      any = true;
      var ws = weekStart(r.f);
      for (var k = counts.length - 1; k >= 0; k--) { if (counts[k].start === ws) { counts[k].count++; break; } }
    });
    return { weeks: counts, any: any };
  }

  return {
    STATUSES: STATUSES, STATUS_LABEL: STATUS_LABEL, APPLICABILITY: APPLICABILITY,
    normalise: normalise, normaliseAny: normaliseAny, importText: importText, parseCsv: parseCsv, csvToRaw: csvToRaw,
    buildIndex: buildIndex, statusOf: statusOf, pctLabel: pctLabel, computeStats: computeStats,
    search: search, filterTopics: filterTopics, findUnmatched: findUnmatched, weeklyStudied: weeklyStudied, weekStart: weekStart
  };
});
