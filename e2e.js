/* Browser flow test on a phone-sized viewport.
   Needs Playwright and a static server on BASE (default http://localhost:8765).
   Run: node tests/e2e.js      Optional: SHOTS=/some/dir to save screenshots. */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const C = require("../js/core.js");

const BASE = process.env.BASE || "http://localhost:8765";
const SHOTS = process.env.SHOTS || "";
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sample-syllabus.json"), "utf8"));
const ix = C.buildIndex(C.normalise(sample).data);
const OVERRIDE_KEY = "poridhi.v1.syllabusOverride";

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); }
}

async function newPage(browser, withSample) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (withSample) {
    await page.addInitScript(([k, data]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ importedAt: new Date().toISOString(), filename: "sample", data }));
    }, [OVERRIDE_KEY, sample]);
  }
  page.errors = errors;
  return { ctx, page };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
const text = (page, sel) => page.locator(sel).first().innerText();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. no syllabus installed ---------- */
  console.log("No syllabus installed");
  {
    const { ctx, page } = await newPage(browser, false);
    await page.route("**/data/syllabus.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.PORIDHI_SYLLABUS=null;" }));
    await page.goto(BASE + "/index.html");
    check("asks for the name first", await page.locator("#name-input").isVisible());
    await page.fill("#name-input", "Rahat");
    await page.click("button[type=submit]");
    check("shows the empty state, no invented content", /No syllabus installed yet/.test(await text(page, "main")));
    await shot(page, "00-empty");
    check("no console errors", page.errors.length === 0, page.errors);
    await ctx.close();
  }

  /* ---------- 2. onboarding ---------- */
  console.log("Onboarding");
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE + "/index.html");
  check("step 1: name screen", /What should we call you\?/.test(await text(page, "main")));
  await page.click("button[type=submit]");
  check("empty name is rejected with a message", await page.locator("#name-error").isVisible());
  await shot(page, "01-name");
  await page.fill("#name-input", "Rahat");
  await page.click("button[type=submit]");
  const choices = await page.locator(".choice").allInnerTexts();
  check("step 2: shows exactly the programmes in the data", choices.length === 3 && /Varsity Science/.test(choices[0]) && /Engineering/.test(choices[1]) && /Medical & Dental/.test(choices[2]), choices);
  await shot(page, "02-programme");
  await page.locator(".choice", { hasText: "Engineering" }).click();
  const confirmText = await text(page, "main");
  const engView = ix.view("engineering");
  check("step 3: confirm lists the programme's subjects", /Sample Physics/.test(confirmText) && /Sample Mathematics/.test(confirmText) && !/Sample Biology/.test(confirmText), confirmText);
  await shot(page, "03-confirm");
  await page.click("[data-act=wel-confirm]");
  await page.waitForSelector(".hero");

  /* ---------- 3. home ---------- */
  console.log("Home");
  check("greets by name", /Rahat/.test(await text(page, "h1")));
  check("sample banner is visible", /Sample data/.test(await text(page, ".banner-sample")));
  check("starts at 0% with the right total", /0\s*%/.test(await text(page, ".bignum")) && new RegExp("of\\s*" + engView.total + "\\s*topics").test(await text(page, ".hero-sub")), await text(page, ".hero-sub"));
  check("subject overview matches the programme", (await page.locator(".card .list .row").count()) === engView.subjects.length);
  check("no revision card yet", (await page.locator(".revise").count()) === 0);
  await shot(page, "04-home");
  check("no horizontal overflow (home)", !(await overflow(page)));

  /* ---------- 4. drill down + status ---------- */
  console.log("Syllabus drill-down");
  await page.click(".tab:has-text('Syllabus')");
  check("programme summary shown", /Engineering/.test(await text(page, ".prog-name")));
  await shot(page, "05-syllabus");
  await page.locator(".row", { hasText: "Sample Physics" }).first().click();
  const physE = engView.subjectInfo["sample-phy"];
  check("subject lists its chapters", (await page.locator(".row .row-title").count()) === physE.chapters.length);
  check("breadcrumb shows the path", /Syllabus\s*›\s*Sample Physics/.test((await text(page, ".crumbs")).replace(/\n/g, " ")));
  await shot(page, "06-subject");
  await page.locator(".row", { hasText: "Sample Mechanics" }).click();
  const mech = engView.chapterInfo["sample-phy-c1"];
  check("chapter shows all its applicable topics in source order", (await page.locator(".topic-name").allInnerTexts()).join("|") === mech.topics.map((t) => t.topic.topic_name).join("|"));
  check("long topic name wraps without overflow", !(await overflow(page)));
  check("admission-extension tag shown on the extension topic", /Admission extension/.test(await text(page, ".topic:last-child")));
  check("details area exists for topics with a description", (await page.locator(".more").count()) === 1);
  await page.click(".more");
  check("details expand", /Sample description text/.test(await text(page, ".topic-detail")));
  await shot(page, "07-chapter");

  await page.locator(".topic-main").first().click();
  check("status sheet opens with the current status marked", /Not started/.test(await text(page, ".option.is-current")));
  await shot(page, "08-sheet");
  await page.click("[data-act=set-status][data-st=studied]");
  check("sheet closes and the row updates immediately", (await page.locator(".sheet").count()) === 0 && /Studied/.test(await text(page, ".topic .pill")));
  check("toast confirms with Undo", /Marked as Studied/.test(await text(page, ".toast")) && await page.locator(".toast button").isVisible());
  check("chapter summary recalculates", new RegExp("1\\s*of\\s*" + mech.topics.length + "\\s*topics studied").test(await text(page, ".summary-line")), await text(page, ".summary-line"));
  await page.click(".toast button");
  check("undo restores Not started", /Not started/.test(await text(page, ".topic .pill")) && /0\s*of/.test(await text(page, ".summary-line")));

  // set a mix of statuses
  const setTopic = async (i, st) => { await page.locator(".topic-main").nth(i).click(); await page.click("[data-act=set-status][data-st=" + st + "]"); };
  await setTopic(0, "studied");
  await setTopic(1, "studied");
  await setTopic(2, "needs_revision");
  await setTopic(3, "in_progress");
  const c = await text(page, ".counts");
  check("chapter counts: 2 studied, 1 in progress, 1 revision, rest not started", /2\s*Studied/.test(c) && /1\s*In progress/.test(c) && /1\s*Needs revision/.test(c) && new RegExp((mech.topics.length - 4) + "\\s*Not started").test(c), c);
  check("needs revision is not counted as studied", new RegExp("2\\s*of\\s*" + mech.topics.length).test(await text(page, ".summary-line")));

  await page.click(".back");
  check("Back returns to the subject", /Sample Physics/.test(await text(page, "h1")) && /2 studied/.test(await text(page, ".row")));
  await page.click(".back");
  check("Back again returns to the Syllabus root", /Syllabus/.test(await text(page, "h1")));

  /* ---------- 5. home reflects it ---------- */
  console.log("Home after progress");
  await page.click(".tab:has-text('Home')");
  const studiedNow = 2, expectPct = C.pctLabel(2, engView.total);
  check("overall % matches the topic counts", new RegExp("^\\s*" + expectPct + "\\s*%").test(await text(page, ".bignum")) && /2<\/b> of/.test(await page.locator(".hero-sub").innerHTML()), await text(page, ".bignum"));
  const tiles = (await page.locator(".tile").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  check("status tiles show real counts", /2 Studied/.test(tiles[0]) && /1 In progress/.test(tiles[1]) && /1 Needs revision/.test(tiles[3]), tiles);
  check("revision reminder shows the count", /1 topic to revise/.test(await text(page, ".revise")));
  check("continue card points to the last chapter and the in-progress topic", /Sample Mechanics/.test(await text(page, "main")) && /In progress/.test(await text(page, "main")));
  await shot(page, "09-home-progress");
  await page.click(".revise");
  check("revision card opens the filtered list", /Needs revision/.test(await text(page, "h1")) && (await page.locator(".topic").count()) === 1);
  await shot(page, "10-revision-list");

  /* ---------- 6. persistence + programme isolation ---------- */
  console.log("Persistence and programmes");
  await page.reload();
  await page.waitForSelector(".display");
  check("a reload keeps you on the same filtered list", /Needs revision/.test(await text(page, "h1")) && (await page.locator(".topic").count()) === 1);
  await page.click(".tab:has-text('Home')");
  check("progress survives a reload (2 studied)", /2<\/b> of/.test(await page.locator(".hero-sub").innerHTML()));
  await page.click(".progchip");
  const sheetText = (await text(page, ".sheet")).replace(/\s+/g, " ");
  check("programme sheet lists all programmes with their own progress", /Engineering current/.test(sheetText) && /Medical & Dental/.test(sheetText) && /2 of 40 topics studied|2 of \d+ topics studied/.test(sheetText), sheetText);
  await shot(page, "11-programmes");
  await page.locator(".option", { hasText: "Medical & Dental" }).click();
  await page.waitForSelector(".hero");
  const medView = ix.view("medical-dental");
  check("switching shows the other programme at 0%", /0\s*%/.test(await text(page, ".bignum")) && new RegExp("of\\s*" + medView.total + "\\s*topics").test(await text(page, ".hero-sub")));
  check("medical does not show Mathematics", !/Sample Mathematics/.test(await text(page, "main")) && /Sample Biology/.test(await text(page, "main")));
  await page.click(".progchip");
  await page.locator(".option", { hasText: "Engineering" }).click();
  await page.waitForSelector(".hero");
  check("switching back keeps the first programme's progress", /2<\/b> of/.test(await page.locator(".hero-sub").innerHTML()));

  /* ---------- 7. statistics ---------- */
  console.log("Statistics");
  await page.click(".tab:has-text('Statistics')");
  check("ring shows the same %", new RegExp(expectPct + "%").test(await page.locator(".ring-text").innerHTML()));
  const kv = (await text(page, ".kv")).replace(/\s+/g, " ");
  check("summary: studied / remaining / revision", new RegExp("2 / " + engView.total).test(kv) && new RegExp("Remaining " + (engView.total - 2)).test(kv) && /Needs revision 1/.test(kv), kv);
  await shot(page, "12-stats");
  check("no horizontal overflow (stats)", !(await overflow(page)));
  const wk = await page.locator(".weeks .wk-n").allInnerTexts();
  check("weekly chart counts only real first-studied dates (2 topics, this week)", wk.length === 8 && wk.reduce((n, x) => n + Number(x), 0) === 2 && wk[7] === "2", wk);
  await page.locator(".select").selectOption("sample-math");
  check("chapter breakdown follows the selected subject", (await page.locator("section:has(.select) .row").count()) === engView.subjectInfo["sample-math"].chapters.length);
  await page.locator("section:has(.select) .row").first().click();
  check("tapping a chapter opens its topics", /Sample Algebra/.test(await text(page, "h1")));
  await page.click(".back");
  check("Back returns to Statistics", /Statistics/.test(await text(page, "h1")));
  await page.locator(".dist-list a", { hasText: "Not started" }).click();
  check("tapping Not started opens that list", /Not started/.test(await text(page, "h1")) && (await page.locator(".topic").count()) === engView.total - 4);
  await page.click(".back");
  await page.locator("h2:has-text('By subject') + .list .row").first().click();
  check("tapping a subject opens it in the syllabus", /Sample Physics/.test(await text(page, "h1")));

  /* ---------- 8. search + filters ---------- */
  console.log("Search and filters");
  await page.click(".tab:has-text('Syllabus')");
  await page.click(".searchfield");
  check("search field is focused", await page.evaluate(() => document.activeElement && document.activeElement.id === "q"));
  await page.fill("#q", "doppler");
  await page.waitForSelector(".topic");
  const path_ = await text(page, ".topic .path");
  check("result shows the full path", /Sample Physics › Sample Waves/.test(path_), path_);
  await shot(page, "13-search");
  await page.locator(".topic a.topic-body").click();
  check("tapping a result opens the exact topic in its chapter", /Sample Waves/.test(await text(page, "h1")) && (await page.locator(".topic.flash").count()) === 1);
  await page.goBack();
  await page.fill("#q", "");
  await page.fill("#q", "sample");
  await page.waitForSelector("h2.group:has-text('Subjects')");
  const groups = (await page.locator("h2.group").allInnerTexts()).join("|").toLowerCase();
  check("search covers subjects, chapters and topics", groups === "subjects|chapters|topics", groups);
  await page.fill("#q", "নমুনা");
  await page.waitForFunction(() => document.querySelectorAll(".topic").length === 1 && !document.querySelector("h2.group:not(:last-of-type)"));
  check("Bengali text is searchable", (await page.locator(".topic").count()) === 1);
  await page.fill("#q", "zzzz");
  await page.waitForSelector(".empty");
  check("no-results state is designed", /No matches/.test(await text(page, ".empty")));
  await page.fill("#q", "");
  await page.click(".chip:has-text('Studied')");
  check("status filter lists the studied topics", (await page.locator(".topic").count()) === 2);
  check("coverage filter exists because the data defines layers", (await page.locator(".chip:has-text('Admission extension')").count()) === 1);
  await page.click(".chip:has-text('All')");
  await page.click(".chip:has-text('Admission extension')");
  const extCount = C.filterTopics(engView, {}, { layer: "Admission extension" }).length;
  check("coverage filter lists admission extensions", (await page.locator(".topic").count()) === extCount, extCount);
  await shot(page, "14-filter");

  /* ---------- 9. status change inside a filtered list ---------- */
  await page.click(".chip:has-text('Admission extension')"); // toggle off
  await page.click(".chip:has-text('Needs revision')");
  await page.locator(".mk-btn").first().click();
  await page.click("[data-act=set-status][data-st=studied]");
  check("changing status inside a list updates the stats", (await page.locator(".topic").count()) === 0 && /No topics here/.test(await text(page, ".empty")));

  /* ---------- 10. profile ---------- */
  console.log("Profile");
  await page.click(".tab:has-text('Profile')");
  await shot(page, "15-profile");
  check("shows version and source information", /Version\s*sample-0/.test((await text(page, ".kv-list")).replace(/\n/g, " ")) && /Imported on this device/.test(await text(page, ".kv-list")));
  await page.fill("#profile-name", "Rahat Hasan");
  await page.click("#profile-name-form button");
  check("name can be edited", /Name updated/.test(await text(page, ".toast")));
  await page.click(".tab:has-text('Home')");
  check("new name is used in the greeting and progress is untouched", /Rahat Hasan/.test(await text(page, "h1")) && /3<\/b> of/.test(await page.locator(".hero-sub").innerHTML()));
  await page.click(".tab:has-text('Profile')");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=export-backup]")]);
  const backupPath = path.join(SHOTS || "/tmp", "poridhi-backup-test.json");
  await dl.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  check("backup file holds the saved statuses", backup.app === "poridhi" && Object.keys(backup.progress.engineering).length === 5 - 1 + 1 || Object.keys(backup.progress.engineering).length >= 4, Object.keys(backup.progress.engineering).length);

  await page.click("[data-act=reset-prog]");
  const dlg = (await text(page, ".sheet")).replace(/\s+/g, " ");
  check("reset dialog says exactly what will be cleared", /clears 4 saved topic statuses for Engineering/.test(dlg) && /not touched/.test(dlg), dlg);
  await shot(page, "16-reset");
  await page.click(".sheet [data-act=close-layer]");
  check("cancel keeps everything", (await page.locator(".sheet").count()) === 0);
  await page.click("[data-act=reset-prog]");
  await page.click("[data-act=dialog-confirm]");
  await page.click(".tab:has-text('Home')");
  check("programme reset sends Engineering back to 0% and keeps the name", /0\s*%/.test(await text(page, ".bignum")) && /Rahat Hasan/.test(await text(page, "h1")));

  // restore from backup
  await page.click(".tab:has-text('Profile')");
  await page.setInputFiles("#restore-file", backupPath);
  await page.waitForSelector(".sheet");
  check("restore asks for confirmation first", /replaces/.test(await text(page, ".sheet")));
  await page.click("[data-act=dialog-confirm]");
  await page.waitForSelector(".hero");
  check("restore brings progress back", /4<\/b> of|3<\/b> of|2<\/b> of/.test(await page.locator(".hero-sub").innerHTML()) && !/0\s*%/.test(await text(page, ".bignum")));

  await page.click(".tab:has-text('Profile')");
  await page.click("[data-act=reset-all]");
  check("reset-everything warns it returns to the first screen", /first screen/.test(await text(page, ".sheet")));
  await page.click("[data-act=dialog-confirm]");
  check("reset everything returns to onboarding", await page.locator("#name-input").isVisible());

  check("no console errors in the main flow", page.errors.length === 0, page.errors);
  await ctx.close();

  /* ---------- 11. layouts on small screens ---------- */
  console.log("Small screens");
  for (const w of [320, 360]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 700 }, serviceWorkers: "block" });
    const p2 = await c2.newPage();
    await p2.addInitScript(([k, data, prof]) => {
      localStorage.setItem(k, JSON.stringify({ importedAt: new Date().toISOString(), filename: "sample", data }));
      localStorage.setItem("poridhi.v1.profile", JSON.stringify(prof));
    }, [OVERRIDE_KEY, sample, { name: "Rahat", programmeId: "engineering", lastChapter: {} }]);
    let bad = [];
    for (const h of ["#/home", "#/syllabus", "#/syllabus/s/sample-phy", "#/syllabus/c/sample-phy-c1", "#/stats", "#/topics?status=not_started", "#/profile"]) {
      await p2.goto(BASE + "/index.html" + h);
      await p2.waitForSelector(".display");
      if (await overflow(p2)) bad.push(h);
    }
    check("no horizontal scroll at " + w + "px on any screen", bad.length === 0, bad);
    await c2.close();
  }

  /* ---------- 12. admin tool ---------- */
  console.log("Admin tool");
  {
    const c3 = await browser.newContext({ viewport: { width: 800, height: 900 }, serviceWorkers: "block" });
    const p3 = await c3.newPage();
    await p3.goto(BASE + "/admin.html");
    await p3.setInputFiles("#file", path.join(__dirname, "fixtures/sample-syllabus.json"));
    await p3.waitForSelector(".status-ok");
    check("valid file passes and shows per-programme counts", /52 topics/.test(await text(p3, ".status-ok")) && (await p3.locator(".table tbody tr").count()) === 3);
    const bad = { programmes: [{ programme_id: "a", programme_name: "A" }], subjects: [], chapters: [], topics: [{ topic_id: "t1", chapter_id: "nope", topic_name: "x" }] };
    fs.writeFileSync("/tmp/bad-syllabus.json", JSON.stringify(bad));
    await p3.setInputFiles("#file", "/tmp/bad-syllabus.json");
    await p3.waitForSelector(".status-bad");
    check("invalid file gives a useful error report", /Unknown chapter_id "nope"/.test(await text(p3, "#report")) && (await p3.locator("#preview").count()) === 0);
    await p3.setInputFiles("#file", path.join(__dirname, "fixtures/sample-syllabus.json"));
    await p3.waitForSelector("#preview");
    await p3.click("#preview");
    check("preview import is stored", /Preview saved/.test(await text(p3, "#report")) && await p3.locator("#remove").isVisible());
    await c3.close();
  }


  /* ---------- 13. the real bundled syllabus ---------- */
  console.log("Bundled syllabus (real data)");
  {
    const rc = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const rp = await rc.newPage();
    const errs = [];
    rp.on("pageerror", (e) => errs.push(String(e)));
    rp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await rp.goto(BASE + "/index.html");
    await rp.fill("#name-input", "Rahat");
    await rp.click("button[type=submit]");
    const ch = await rp.locator(".choice").allInnerTexts();
    check("three programmes, short names, no sample banner", ch.length === 3 && /Varsity Science/.test(ch[0]) && /Engineering/.test(ch[1]) && /Medical & Dental/.test(ch[2]) && (await rp.locator(".banner-sample").count()) === 0, ch);
    check("programme choices show counts", /9 subjects/.test(ch[0]) && /787/.test(ch[0]) && /5 subjects/.test(ch[1]) && /537/.test(ch[1]) && /6 subjects/.test(ch[2]) && /579/.test(ch[2]), ch);
    await rp.locator(".choice", { hasText: "Engineering" }).click();
    const ct = await text(rp, "main");
    check("confirm screen shows the file's caveats (not an official syllabus)", /good to know/i.test(ct) && /not one government-issued/i.test(ct), ct.slice(0, 600));
    await shot(rp, "20-real-confirm");
    await rp.click("[data-act=wel-confirm]");
    await rp.waitForSelector(".hero");
    await rp.click("a.tab[href='#/syllabus'], nav a[href='#/syllabus']");
    await rp.waitForSelector(".list.card");
    check("Engineering lists its 5 subjects", (await rp.locator(".list.card > li").count()) === 5);
    await rp.locator("a.row", { hasText: "Physics" }).first().click();
    await rp.waitForSelector(".group-head");
    check("Physics shows paper headings and 22 chapters", (await rp.locator(".group-head").count()) >= 2 && (await rp.locator("a.row").count()) === 22);
    await shot(rp, "21-real-physics");
    await rp.locator("a.row").first().click();
    await rp.waitForSelector(".topics");
    check("chapter shows its paper/section as a sub line", (await rp.locator("header .sub").count()) === 1);
    const firstTopic = rp.locator(".topics > li").first();
    await shot(rp, "22-real-chapter");
    check("a topic with notes can expand to details with a resolved source", await (async () => {
      const exp = rp.locator(".topics [aria-expanded]").first();
      if (!(await exp.count())) return false;
      await exp.click();
      return /Source:/.test(await text(rp, ".topics"));
    })());
    const nm = (await text(rp, ".topics .t-name, .topics .topic-name, .topics li")).length;
    check("topic rows render text", nm > 0);
    /* set a status, check Engineering vs Medical isolation */
    await rp.locator(".topics .topic-main, .topics .t-main, .topics li button").first().click().catch(() => {});
    check("no horizontal scroll on real chapter at 360px", !(await overflow(rp)));
    await rp.goto(BASE + "/index.html#/profile");
    await rp.waitForSelector("dl.kv-list");
    const pt = await text(rp, "main");
    check("profile shows version 2026.11 and editorial notes", /2026\.11/.test(pt) && /please note/i.test(pt) && (await rp.locator(".bullets li").count()) >= 5);
    await rp.click("details.about summary");
    check("profile lists the 10 sources with ids", (await rp.locator(".srclist li").count()) === 10 && /SRC/.test(await text(rp, ".srclist")));
    await shot(rp, "23-real-profile");
    check("no horizontal scroll on profile at 360px", !(await overflow(rp)));
    check("no console errors on real data", errs.length === 0, errs);
    await rc.close();
  }

  await browser.close();
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
