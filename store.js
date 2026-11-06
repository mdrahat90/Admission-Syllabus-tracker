/* PORIDHI local storage. Syllabus content is never stored here (except an admin preview
   import); this holds only the student's profile and per-programme topic statuses. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PoridhiStore = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var KEYS = { profile: "poridhi.v1.profile", progress: "poridhi.v1.progress", override: "poridhi.v1.syllabusOverride" };
  var SAVED = { in_progress: 1, studied: 1, needs_revision: 1 };

  var ls = null, persistent = false, failed = false, mem = {};
  try {
    ls = root.localStorage;
    ls.setItem("poridhi.v1.probe", "1");
    ls.removeItem("poridhi.v1.probe");
    persistent = true;
  } catch (e) { persistent = false; }

  function rawGet(key) {
    try { if (persistent) return ls.getItem(key); } catch (e) { /* fall through */ }
    return key in mem ? mem[key] : null;
  }
  function rawSet(key, text) {
    mem[key] = text;
    if (!persistent) return false;
    try { ls.setItem(key, text); return true; } catch (e) { failed = true; return false; }
  }
  function readJson(key, fallback) {
    var t = rawGet(key);
    if (t === null) return fallback;
    try { var v = JSON.parse(t); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; }
  }

  var profile = readJson(KEYS.profile, {});
  profile = { name: String(profile.name || ""), programmeId: String(profile.programmeId || ""), lastChapter: profile.lastChapter && typeof profile.lastChapter === "object" ? profile.lastChapter : {} };
  var progress = readJson(KEYS.progress, {});

  function saveProfile() { return rawSet(KEYS.profile, JSON.stringify(profile)); }
  function saveProgress() { return rawSet(KEYS.progress, JSON.stringify(progress)); }

  function countRecords(pid) {
    var n = 0, p = progress[pid] || {};
    Object.keys(p).forEach(function (t) { if (p[t] && SAVED[p[t].s]) n++; });
    return n;
  }

  return {
    isPersistent: function () { return persistent && !failed; },

    getProfile: function () { return profile; },
    updateProfile: function (patch) {
      Object.keys(patch).forEach(function (k) { profile[k] = patch[k]; });
      return saveProfile();
    },
    setLastChapter: function (pid, cid) {
      if (profile.lastChapter[pid] === cid) return;
      profile.lastChapter[pid] = cid;
      saveProfile();
    },

    allProgress: function () { return progress; },
    getProgress: function (pid) { return progress[pid] || {}; },
    getRecord: function (pid, tid) { var p = progress[pid]; return p && p[tid] ? JSON.parse(JSON.stringify(p[tid])) : null; },
    countRecords: countRecords,
    totalRecords: function () { return Object.keys(progress).reduce(function (n, pid) { return n + countRecords(pid); }, 0); },

    /* Status "not_started" removes the record: that is the default. */
    setStatus: function (pid, tid, status) {
      var now = Date.now();
      var p = progress[pid] = progress[pid] || {};
      var prev = p[tid];
      if (status === "not_started") {
        if (prev && prev.f) p[tid] = { s: "not_started", u: now, f: prev.f };
        else delete p[tid];
      } else {
        var rec = { s: status, u: now };
        var first = prev && prev.f ? prev.f : (status === "studied" ? now : 0);
        if (first) rec.f = first;
        p[tid] = rec;
      }
      return saveProgress();
    },
    restoreRecord: function (pid, tid, rec) {
      var p = progress[pid] = progress[pid] || {};
      if (rec) p[tid] = rec; else delete p[tid];
      return saveProgress();
    },
    clearProgramme: function (pid) { delete progress[pid]; return saveProgress(); },
    clearAll: function () {
      progress = {};
      profile = { name: "", programmeId: "", lastChapter: {} };
      saveProgress(); saveProfile();
    },

    /* ---- backup ---- */
    exportBackup: function () {
      return { app: "poridhi", version: 1, exported_at: new Date().toISOString(), profile: { name: profile.name, programmeId: profile.programmeId, lastChapter: profile.lastChapter }, progress: progress };
    },
    parseBackup: function (text) {
      var b;
      try { b = JSON.parse(text); } catch (e) { return { ok: false, error: "This file is not valid JSON." }; }
      if (!b || b.app !== "poridhi" || typeof b.progress !== "object" || !b.progress) return { ok: false, error: "This is not a PORIDHI backup file." };
      var records = 0, programmes = 0;
      var clean = {};
      var bad = false;
      Object.keys(b.progress).forEach(function (pid) {
        var p = b.progress[pid];
        if (!p || typeof p !== "object") { bad = true; return; }
        var out = {}, n = 0;
        Object.keys(p).forEach(function (tid) {
          var r = p[tid];
          if (!r || typeof r !== "object" || !(r.s === "not_started" || SAVED[r.s])) { bad = true; return; }
          out[tid] = { s: r.s, u: Number(r.u) || 0 };
          if (Number(r.f)) out[tid].f = Number(r.f);
          if (SAVED[r.s]) n++;
        });
        clean[pid] = out;
        if (n) { programmes++; records += n; }
      });
      if (bad) return { ok: false, error: "The backup contains records that could not be read." };
      var pr = b.profile && typeof b.profile === "object" ? b.profile : {};
      return {
        ok: true, exportedAt: String(b.exported_at || ""), records: records, programmes: programmes,
        data: { name: String(pr.name || ""), programmeId: String(pr.programmeId || ""), lastChapter: pr.lastChapter && typeof pr.lastChapter === "object" ? pr.lastChapter : {}, progress: clean }
      };
    },
    applyBackup: function (parsed) {
      progress = parsed.data.progress;
      profile = { name: parsed.data.name || profile.name, programmeId: parsed.data.programmeId, lastChapter: parsed.data.lastChapter };
      var a = saveProgress(), b = saveProfile();
      return a && b;
    },

    /* ---- admin preview of an imported syllabus (this device only) ---- */
    getOverride: function () { return readJson(KEYS.override, null); },
    setOverride: function (data, filename) { return rawSet(KEYS.override, JSON.stringify({ importedAt: new Date().toISOString(), filename: filename || "", data: data })); },
    clearOverride: function () {
      delete mem[KEYS.override];
      try { if (persistent) ls.removeItem(KEYS.override); } catch (e) { /* ignore */ }
    }
  };
});
