/* Unit tests for the pure logic. Run: node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../js/core.js");

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sample-syllabus.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

function mini() {
  return {
    meta: { syllabus_version: "t1" },
    programmes: [{ programme_id: "a", programme_name: "A" }, { programme_id: "b", programme_name: "B" }],
    subjects: [{ subject_id: "s1", subject_name: "S1", subject_order: 1, programme_ids: ["a", "b"] }],
    chapters: [{ chapter_id: "c1", subject_id: "s1", chapter_name: "C1", chapter_order: 1 }, { chapter_id: "c2", subject_id: "s1", chapter_name: "C2", chapter_order: 2 }],
    topics: [
      { topic_id: "t1", chapter_id: "c1", topic_name: "T1", topic_order: 1 },
      { topic_id: "t2", chapter_id: "c1", topic_name: "T2", topic_order: 2 },
      { topic_id: "t3", chapter_id: "c1", topic_name: "T3", topic_order: 3 },
      { topic_id: "t4", chapter_id: "c2", topic_name: "T4", topic_order: 1 }
    ]
  };
}
const errText = (r) => r.errors.map((e) => e.where + ": " + e.msg).join("\n");

test("sample syllabus validates and builds per-programme views", () => {
  const r = C.normalise(sample);
  assert.equal(r.ok, true, errText(r));
  assert.deepEqual(r.counts, { programmes: 3, subjects: 5, chapters: 14, topics: 52 });
  const ix = C.buildIndex(r.data);
  const eng = ix.view("engineering"), med = ix.view("medical-dental"), var_ = ix.view("varsity-science");
  assert.ok(eng.subjects.some((s) => s.subject.subject_id === "sample-math"));
  assert.ok(!med.subjects.some((s) => s.subject.subject_id === "sample-math"), "maths is not in medical");
  // the engineering-only extension topic is excluded for the other programmes
  assert.ok(eng.topicInfo["sample-phy-c1-t5"]);
  assert.equal(var_.topicInfo["sample-phy-c1-t5"], undefined);
  assert.equal(med.topicInfo["sample-phy-c1-t5"], undefined);
  assert.equal(eng.topicInfo["sample-phy-c1-t5"].layer, "Admission extension");
  assert.equal(var_.topicInfo["sample-phy-c2-t4"].applicability, "conditional");
  assert.equal(eng.mainLayer, "HSC foundation");
});

test("normalise is idempotent", () => {
  const a = C.normalise(sample);
  const b = C.normalise(a.data);
  assert.equal(b.ok, true, errText(b));
  assert.deepEqual(b.data, a.data);
});

test("errors: duplicates, missing parents, bad values", () => {
  const d = mini();
  d.topics.push({ topic_id: "t1", chapter_id: "c1", topic_name: "dup id", topic_order: 9 });
  d.topics.push({ topic_id: "t9", chapter_id: "nope", topic_name: "orphan", topic_order: 9 });
  d.topics.push({ topic_id: "t10", chapter_id: "c1", topic_name: "", topic_order: "abc" });
  d.topics.push({ topic_id: "t11", chapter_id: "c1", topic_name: "bad app", applicability: "maybe" });
  d.chapters.push({ chapter_id: "c3", subject_id: "ghost", chapter_name: "x" });
  d.subjects.push({ subject_id: "s2", subject_name: "S2", programme_ids: ["zzz"] });
  const r = C.normalise(d);
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  const t = errText(r);
  assert.match(t, /Duplicate topic_id "t1"/);
  assert.match(t, /Unknown chapter_id "nope"/);
  assert.match(t, /Missing topic_name/);
  assert.match(t, /topic_order must be a number/);
  assert.match(t, /Unknown applicability "maybe"/);
  assert.match(t, /Unknown subject_id "ghost"/);
  assert.match(t, /Unknown programme "zzz"/);
});

test("file-level problems give a clear error", () => {
  assert.equal(C.normalise(null).ok, false);
  const r = C.normalise({ programmes: [] });
  assert.equal(r.ok, false);
  assert.match(errText(r), /Missing "subjects" list/);
});

test("duplicate-looking names are warnings and nothing is deleted", () => {
  const d = mini();
  d.topics.push({ topic_id: "t5", chapter_id: "c1", topic_name: "  t1 ", topic_order: 5 });
  const r = C.normalise(d);
  assert.equal(r.ok, true);
  assert.equal(r.data.topics.length, 5);
  assert.ok(r.warnings.some((w) => /Duplicate-looking topic names/.test(w.msg)));
});

test("order is preserved from the file, falling back to file position", () => {
  const d = mini();
  d.topics = [
    { topic_id: "x3", chapter_id: "c1", topic_name: "third", topic_order: 3 },
    { topic_id: "x1", chapter_id: "c1", topic_name: "first", topic_order: 1 },
    { topic_id: "x2", chapter_id: "c1", topic_name: "second", topic_order: 2 }
  ];
  const ix = C.buildIndex(C.normalise(d).data);
  assert.deepEqual(ix.topicsByChapter.c1.map((t) => t.topic_id), ["x1", "x2", "x3"]);
  d.topics.forEach((t) => delete t.topic_order);
  const r2 = C.normalise(d);
  assert.ok(r2.warnings.some((w) => /no topic_order/.test(w.msg)));
  assert.deepEqual(C.buildIndex(r2.data).topicsByChapter.c1.map((t) => t.topic_id), ["x3", "x1", "x2"]);
});

test("applicability: excluded topics leave the view; missing becomes unverified only if the file uses the field", () => {
  const d = mini();
  assert.equal(C.normalise(d).data.topics[0].programmes.a.applicability, "", "no applicability anywhere = no tag");
  d.topics[1].programmes = { a: { applicability: "excluded" }, b: { applicability: "conditional" } };
  const r = C.normalise(d);
  assert.equal(r.ok, true, errText(r));
  assert.ok(r.warnings.some((w) => /Unverified/.test(w.msg)));
  const ix = C.buildIndex(r.data);
  assert.equal(ix.view("a").topicInfo.t2, undefined);
  assert.equal(ix.view("b").topicInfo.t2.applicability, "conditional");
  assert.equal(ix.view("a").topicInfo.t1.applicability, "unverified");
  assert.equal(ix.view("a").total, 3);
  assert.equal(ix.view("b").total, 4);
});

test("chapters with no applicable topics are hidden from that programme", () => {
  const d = mini();
  d.topics[3].programme_ids = ["b"];
  const ix = C.buildIndex(C.normalise(d).data);
  assert.deepEqual(ix.view("a").subjects[0].chapters.map((c) => c.chapter.chapter_id), ["c1"]);
  assert.deepEqual(ix.view("b").subjects[0].chapters.map((c) => c.chapter.chapter_id), ["c1", "c2"]);
});

test("stats use topic counts, not averaged percentages; needs revision is not studied", () => {
  const ix = C.buildIndex(C.normalise(mini()).data);
  const v = ix.view("a");
  const prog = { t1: { s: "studied" }, t2: { s: "needs_revision" }, t3: { s: "in_progress" }, t4: { s: "studied" } };
  const s = C.computeStats(v, prog);
  assert.equal(s.all.total, 4);
  assert.equal(s.all.studied, 2);
  assert.equal(s.all.needs_revision, 1);
  assert.equal(s.all.in_progress, 1);
  assert.equal(s.all.not_started, 0);
  assert.equal(s.all.remaining, 2);
  assert.equal(s.all.pct, 50);
  // c1 = 1/3 studied, c2 = 1/1: weighted subject figure is 2/4 = 50%, not the 66.7% average
  assert.equal(s.byChapter.c1.studied, 1);
  assert.equal(s.byChapter.c1.total, 3);
  assert.equal(s.byChapter.c2.pct, 100);
  assert.equal(s.bySubject.s1.pct, 50);
});

test("new topics default to not started; unknown statuses are ignored", () => {
  const ix = C.buildIndex(C.normalise(mini()).data);
  const s = C.computeStats(ix.view("a"), { t1: { s: "weird" } });
  assert.equal(s.all.not_started, 4);
  assert.equal(s.all.studied, 0);
});

test("zero-topic programme does not divide by zero", () => {
  const d = mini();
  d.programmes.push({ programme_id: "c", programme_name: "C" });
  const ix = C.buildIndex(C.normalise(d).data);
  const s = C.computeStats(ix.view("c"), {});
  assert.equal(s.all.total, 0);
  assert.equal(s.all.pct, 0);
  assert.equal(s.all.label, 0);
});

test("pctLabel never rounds up to 100 or down to 0 falsely", () => {
  assert.equal(C.pctLabel(0, 250), 0);
  assert.equal(C.pctLabel(1, 250), 1);
  assert.equal(C.pctLabel(249, 250), 99);
  assert.equal(C.pctLabel(250, 250), 100);
  assert.equal(C.pctLabel(0, 0), 0);
});

test("search finds subject, chapter and topic names within the programme only", () => {
  const ix = C.buildIndex(C.normalise(sample).data);
  const med = ix.view("medical-dental");
  const r = C.search(med, "sample physics");
  assert.equal(r.subjects.length, 1);
  assert.equal(C.search(med, "mechanics").chapters.length, 1);
  assert.ok(C.search(med, "doppler").topics.length === 1);
  assert.equal(C.search(med, "calculus").chapters.length, 0, "calculus is not in medical");
  assert.equal(C.search(med, "").topics.length, 0);
  assert.equal(C.search(med, "tenses sample").topics.length, 1, "all words must match");
  assert.equal(C.search(med, "নমুনা").topics.length, 1, "Bengali text is searchable");
});

test("filterTopics by status, coverage layer and conditional", () => {
  const ix = C.buildIndex(C.normalise(sample).data);
  const v = ix.view("engineering");
  const prog = { "sample-phy-c1-t1": { s: "studied" }, "sample-phy-c1-t2": { s: "needs_revision" } };
  assert.equal(C.filterTopics(v, prog, { status: "studied" }).length, 1);
  assert.equal(C.filterTopics(v, prog, { status: "needs_revision" }).length, 1);
  assert.equal(C.filterTopics(v, prog, { status: "not_started" }).length, v.total - 2);
  assert.ok(C.filterTopics(v, prog, { layer: "Admission extension" }).length >= 3);
  assert.equal(C.filterTopics(ix.view("varsity-science"), {}, { cond: true }).length >= 2, true);
});

test("unmatched progress is flagged, not dropped", () => {
  const ix = C.buildIndex(C.normalise(mini()).data);
  const un = C.findUnmatched(ix, { a: { t1: { s: "studied" }, gone: { s: "studied" } }, old: { t1: { s: "in_progress" } }, b: { t2: { s: "not_started" } } });
  assert.deepEqual(un.map((u) => u.reason).sort(), ["programme_missing", "topic_missing"]);
});

test("weekly counts use real first-studied dates only", () => {
  const ix = C.buildIndex(C.normalise(mini()).data);
  const now = new Date(2026, 10, 5, 12).getTime();
  const day = 864e5;
  const prog = { t1: { s: "studied", f: now - 1 * day }, t2: { s: "studied", f: now - 9 * day }, t3: { s: "in_progress" } };
  const w = C.weeklyStudied(ix.view("a"), prog, 4, now);
  assert.equal(w.any, true);
  assert.equal(w.weeks.length, 4);
  assert.equal(w.weeks.reduce((n, x) => n + x.count, 0), 2);
  assert.equal(C.weeklyStudied(ix.view("a"), { t3: { s: "in_progress" } }, 4, now).any, false);
});

/* ---------- CSV ---------- */

const CSV_HEAD = "programme_id,programme_name,subject_id,subject_name,chapter_id,chapter_name,topic_id,topic_name,topic_order,applicability,coverage_layer\n";

test("CSV: flat rows build the same hierarchy; shared topics merge across programmes", () => {
  const csv = CSV_HEAD +
    'a,A,s1,S1,c1,C1,t1,"Topic, with comma",1,required,HSC foundation\n' +
    'b,B,s1,S1,c1,C1,t1,"Topic, with comma",1,conditional,HSC foundation\n' +
    "a,A,s1,S1,c1,C1,t2,Second,2,required,Admission extension\n";
  const r = C.importText(csv, "x.csv");
  assert.equal(r.ok, true, errText(r));
  assert.equal(r.format, "csv");
  assert.deepEqual(r.counts, { programmes: 2, subjects: 1, chapters: 1, topics: 2 });
  const ix = C.buildIndex(r.data);
  assert.equal(ix.topicById.t1.topic_name, "Topic, with comma");
  assert.equal(ix.view("b").topicInfo.t1.applicability, "conditional");
  assert.equal(ix.view("b").topicInfo.t2, undefined, "t2 has no row for programme b");
  assert.deepEqual(ix.data.subjects[0].programme_ids.sort(), ["a", "b"]);
});

test("CSV: BOM, CRLF, semicolons and quoted quotes", () => {
  const csv = "﻿" + CSV_HEAD.replace(/,/g, ";").replace("\n", "\r\n") + 'a;A;s1;S1;c1;C1;t1;"He said ""hi""";1;;\r\n';
  const r = C.importText(csv, "x.csv");
  assert.equal(r.ok, true, errText(r));
  assert.equal(r.data.topics[0].topic_name, 'He said "hi"');
});

test("CSV: conflicts, duplicate rows, missing IDs and missing columns are reported with row numbers", () => {
  const csv = CSV_HEAD +
    "a,A,s1,S1,c1,C1,t1,One,1,,\n" +
    "a,A,s1,S1,c1,C1,t1,One,1,,\n" +
    "b,B,s1,S1,c1,C1,t1,Different name,1,,\n" +
    "a,A,s1,S1,c1,C1,,No id,2,,\n";
  const r = C.importText(csv, "x.csv");
  assert.equal(r.ok, false);
  const t = errText(r);
  assert.match(t, /row 3: Duplicate row for topic "t1" in programme "a"/);
  assert.match(t, /row 4: Conflicting topic_name/);
  assert.match(t, /row 5: Missing topic_id/);
  const bad = C.importText("programme_id,topic_name\na,b\n", "x.csv");
  assert.equal(bad.ok, false);
  assert.match(errText(bad), /Missing column\(s\): programme_name/);
});

test("importText: JSON parse errors and format detection", () => {
  assert.match(errText(C.importText("{oops", "a.json")), /not valid JSON/);
  assert.equal(C.importText(JSON.stringify(mini()), "a.json").ok, true);
  assert.equal(C.importText(JSON.stringify(mini()), "").ok, true, "JSON detected from content");
});

/* ---------- the shipped (real) syllabus ---------- */

function shipped() {
  const code = fs.readFileSync(path.join(__dirname, "../data/syllabus.js"), "utf8");
  const w = {};
  new Function("window", code)(w);
  return w.PORIDHI_SYLLABUS;
}

test("shipped syllabus: imports with no errors or warnings and the expected totals", () => {
  const raw = shipped();
  const r = C.normaliseAny(raw);
  assert.equal(r.ok, true, errText(r));
  assert.equal(r.format, "nested");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.counts, { programmes: 3, subjects: 20, chapters: 204, topics: 1903 });
  const ix = C.buildIndex(r.data);
  const tot = (pid) => { const v = ix.view(pid); return [v.subjects.length, v.subjects.reduce((n, s) => n + s.chapters.length, 0), v.total]; };
  assert.deepEqual(tot("VARSITY-SCI"), [9, 87, 787]);
  assert.deepEqual(tot("ENGINEERING"), [5, 56, 537]);
  assert.deepEqual(tot("MEDICAL"), [6, 61, 579]);
});

test("shipped syllabus: every supplied topic ID, title, order and layer is preserved exactly", () => {
  const raw = shipped();
  const ix = C.buildIndex(C.normaliseAny(raw).data);
  let n = 0;
  raw.programmes.forEach((p) => {
    const v = ix.view(p.id);
    assert.equal(v.programme.programme_name, p.name, "programme name is kept verbatim");
    p.subjects.forEach((s, si) => {
      const se = v.subjects[si];
      assert.equal(se.subject.subject_name, s.name);
      s.chapters.forEach((c, ci) => {
        const ce = se.chapters[ci];
        assert.equal(ce.chapter.chapter_name, c.title);
        assert.equal(ce.chapter.chapter_number, c.chapterNo);
        assert.equal(ce.chapter.chapter_section, c.paperOrSection);
        assert.deepEqual(ce.topics.map((t) => t.topic.topic_id), c.topics.map((t) => t.id), "topic order matches the file");
        c.topics.forEach((t, ti) => {
          const te = ce.topics[ti];
          assert.equal(te.topic.topic_name, t.title);
          assert.equal(te.layer, t.coverageLayer);
          assert.equal(te.topic.description, t.notes);
          assert.equal(te.topic.source_reference, t.sourceId);
          n++;
        });
      });
    });
  });
  assert.equal(n, 1903);
});

test("shipped syllabus: derived subject and chapter IDs are unique, stable and not position-based", () => {
  const a = C.normaliseAny(shipped()).data, b = C.normaliseAny(shipped()).data;
  assert.deepEqual(a.chapters.map((c) => c.chapter_id), b.chapters.map((c) => c.chapter_id));
  assert.equal(new Set(a.subjects.map((s) => s.subject_id)).size, 20);
  assert.equal(new Set(a.chapters.map((c) => c.chapter_id)).size, 204);
  const phy = a.chapters.filter((c) => c.subject_id === "VARSITY-SCI/physics").map((c) => c.chapter_id);
  assert.ok(phy.includes("VARSITY-SCI/physics/1st-paper-01") && phy.includes("VARSITY-SCI/physics/2nd-paper-01"), "chapter 01 of both papers get different IDs");
  // reordering chapters in the source must not change any ID
  const raw = shipped(); raw.programmes[0].subjects[0].chapters.reverse();
  const c = C.normaliseAny(raw).data;
  assert.ok(c.chapters.some((x) => x.chapter_id === "VARSITY-SCI/physics/1st-paper-01"));
});

test("shipped syllabus: sources, editorial notes and programme caveats come through", () => {
  const d = C.normaliseAny(shipped()).data;
  assert.equal(d.meta.syllabus_version, "2026.11");
  assert.equal(d.meta.sources.length, 10);
  assert.equal(d.meta.editorial_notes.length, 5);
  assert.match(d.meta.editorial_notes[0], /not one government-issued universal admission syllabus/);
  const ids = new Set(d.meta.sources.map((s) => s.id));
  assert.ok(d.topics.every((t) => ids.has(t.source_reference)), "every topic cites a listed source");
  assert.ok(d.programmes.every((p) => p.caveat && p.description));
});

test("shipped syllabus: conditional/engineering/medical layers are filterable per programme", () => {
  const ix = C.buildIndex(C.normaliseAny(shipped()).data);
  const eng = ix.view("ENGINEERING");
  assert.equal(C.filterTopics(eng, {}, { layer: "Conditional – target-specific" }).length, 5);
  assert.equal(C.filterTopics(ix.view("MEDICAL"), {}, { layer: "Medical emphasis" }).length, 29);
  assert.equal(C.filterTopics(ix.view("VARSITY-SCI"), {}, { layer: "Conditional – target-specific" }).length, 0, "layer filters never leak across programmes");
  assert.equal(C.search(ix.view("VARSITY-SCI"), "বাংলা").chapters.length >= 1, true, "Bengali chapter titles are searchable");
});

test("shipped syllabus: progress is per programme even though the content is similar", () => {
  const ix = C.buildIndex(C.normaliseAny(shipped()).data);
  const phyE = ix.view("ENGINEERING").subjects[0].chapters[0].topics[0].topic.topic_id;
  const progE = { [phyE]: { s: "studied" } };
  assert.equal(C.computeStats(ix.view("ENGINEERING"), progE).all.studied, 1);
  assert.equal(C.computeStats(ix.view("MEDICAL"), progE).all.studied, 0, "another programme's totals do not change");
});

/* ---------- nested format problems ---------- */

function nestedMini() {
  return {
    catalogueVersion: "t", statuses: ["Not Started", "In Progress", "Studied", "Needs Revision"], defaultStatus: "Not Started",
    programmes: [{ id: "P1", name: "One (extra)", subjects: [{ name: "Maths", chapters: [{ chapterNo: "01", title: "Algebra", paperOrSection: "1st Paper", topics: [{ id: "X-1", title: "Sets", coverageLayer: "HSC foundation", defaultStatus: "Not Started", sourceId: "S1", notes: "" }] }] }] }],
    sources: [{ id: "S1", title: "Src", url: "https://example.org" }]
  };
}

test("nested: minimal file imports; problems are reported with a readable path", () => {
  assert.equal(C.normaliseAny(nestedMini()).ok, true);
  const a = nestedMini(); delete a.programmes[0].subjects[0].chapters[0].chapterNo;
  const ra = C.normaliseAny(a);
  assert.equal(ra.ok, false);
  assert.match(errText(ra), /programmes\[0\] "P1" › subjects\[0\] "Maths" › chapters\[0\] "Algebra": Missing chapterNo/);
  const b = nestedMini(); b.programmes[0].subjects[0].chapters[0].topics.push({ id: "X-1", title: "Again" });
  assert.match(errText(C.normaliseAny(b)), /Duplicate topic_id "X-1"/);
  const c = nestedMini(); c.programmes[0].subjects[0].chapters[0].topics[0].defaultStatus = "Studied";
  assert.ok(C.normaliseAny(c).warnings.some((w) => /defaultStatus other than Not Started/.test(w.msg)));
  const d = nestedMini(); d.programmes[0].subjects[0].chapters[0].topics[0].sourceId = "NOPE";
  assert.ok(C.normaliseAny(d).warnings.some((w) => /not in the sources list/.test(w.msg)));
  const e = nestedMini(); e.statuses = ["A", "B"];
  assert.ok(C.normaliseAny(e).warnings.some((w) => w.where === "statuses"));
  const f = nestedMini(); delete f.programmes[0].subjects[0].chapters;
  assert.match(errText(C.normaliseAny(f)), /Missing "chapters" list/);
});

test("nested: importText handles the nested file and re-importing normalised output", () => {
  const r = C.importText(JSON.stringify(nestedMini()), "x.json");
  assert.equal(r.ok, true, errText(r));
  assert.equal(r.format, "nested json");
  assert.equal(C.importText(JSON.stringify(r.data), "x.json").ok, true);
});
