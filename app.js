"use strict";
var KEY = "dailyRoutine.v1", SKEY = "dailyRoutine.sync", API = "https://textdb.dev/api/data/";
var DEFAULTS = ["Get morning sunlight", "Morning skincare", "Gym", "Stretching", "Play Harmonium", "Study Hindi", "Evening skincare"];
var DEF_IDS = ["t1", "t2", "t3", "t4", "t5", "t7", "t6"];
function load() { try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.tasks && d.days) return d; } catch (e) {}
  return { tasks: DEFAULTS.map(function (n, i) { return { id: DEF_IDS[i], name: n }; }), days: {}, nextId: 8, migrations: ["add-study-hindi"] }; }
function migrate(d) { // each migration runs once per device, tracked in d.migrations
  var done = d.migrations = d.migrations || [];
  if (done.indexOf("add-study-hindi") < 0) {
    if (!d.tasks.some(function (t) { return /hindi/i.test(t.name); })) {
      var i = d.tasks.findIndex(function (t) { return /harmonium/i.test(t.name); });
      if (i < 0) { var j = d.tasks.findIndex(function (t) { return /evening/i.test(t.name); }); i = j < 0 ? d.tasks.length - 1 : j - 1; }
      // fixed id "t7" (same on every device) unless taken
      var id = d.tasks.some(function (t) { return t.id === "t7"; }) ? newId() : "t7";
      d.tasks.splice(i + 1, 0, { id: id, name: "Study Hindi" });
    }
    done.push("add-study-hindi");
  }
  delete d.mig;
  // sync fields: tt = tick timestamps per "date|task", removed = deleted task ids, orderTs = last reorder/add time
  d.tt = d.tt || {}; d.removed = d.removed || {}; d.orderTs = d.orderTs || 0;
  return d; }
function newId() { var a = new Uint8Array(6); crypto.getRandomValues(a); return "x" + Array.from(a, function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
var S = migrate(load()); localStorage.setItem(KEY, JSON.stringify(S));
var view = "today", cur = today();
function now() { return Date.now(); }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); schedulePush(); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today() { return ymd(new Date()); }
function shift(s, n) { var p = s.split("-"); var d = new Date(+p[0], p[1] - 1, +p[2] + n); return ymd(d); }
function isDone(day, id) { return !!(S.days[day] && S.days[day][id]); }
function setTick(d, day, id, on) { var o = d.days[day] = d.days[day] || {}; if (on) o[id] = 1; else delete o[id]; if (!Object.keys(o).length) delete d.days[day]; }
function toggle(day, id) { setTick(S, day, id, !isDone(day, id)); S.tt[day + "|" + id] = now(); save(); }
function streak(id, from) { var d = from || today(), n = 0; if (!isDone(d, id)) d = shift(d, -1); while (isDone(d, id)) { n++; d = shift(d, -1); } return n; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function label(s) { var p = s.split("-"), d = new Date(+p[0], p[1] - 1, +p[2]);
  var t = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return s === today() ? "Today · " + t : s === shift(today(), -1) ? "Yesterday · " + t : t; }

// ---------- merge (pure): per date+task last-write-wins; untimestamped (legacy) ticks are unioned ----------
function merge(a, b) {
  a = migrate(JSON.parse(JSON.stringify(a))); b = migrate(JSON.parse(JSON.stringify(b)));
  var r = { days: {}, tt: {}, removed: {}, migrations: [], nextId: Math.max(a.nextId || 0, b.nextId || 0) };
  a.migrations.concat(b.migrations).forEach(function (m) { if (r.migrations.indexOf(m) < 0) r.migrations.push(m); });
  [a.removed, b.removed].forEach(function (x) { for (var k in x) r.removed[k] = Math.max(r.removed[k] || 0, x[k]); });
  // tasks: per id, newer ts wins (rename)
  var byId = {};
  [a, b].forEach(function (s) { s.tasks.forEach(function (t) { var o = byId[t.id]; if (!o || (t.ts || 0) > (o.ts || 0)) byId[t.id] = t; }); });
  var first = (b.orderTs || 0) > (a.orderTs || 0) ? b : a, second = first === a ? b : a;
  r.orderTs = Math.max(a.orderTs, b.orderTs);
  var ids = first.tasks.map(function (t) { return t.id; });
  second.tasks.forEach(function (t, i) { if (ids.indexOf(t.id) < 0) { // insert after its predecessor in the other list
    var prev = i > 0 ? ids.indexOf(second.tasks[i - 1].id) : -1; ids.splice(prev + 1, 0, t.id); } });
  r.tasks = ids.filter(function (id) { return !(r.removed[id] > (byId[id].ts || 0)); }).map(function (id) { return byId[id]; });
  // ticks
  var keys = {};
  [a, b].forEach(function (s) { for (var k in s.tt) keys[k] = 1; for (var d in s.days) for (var id in s.days[d]) keys[d + "|" + id] = 1; });
  Object.keys(keys).forEach(function (k) {
    var p = k.split("|"), d = p[0], id = p[1];
    var ta = a.tt[k] || 0, tb = b.tt[k] || 0, va = !!(a.days[d] && a.days[d][id]), vb = !!(b.days[d] && b.days[d][id]);
    var v = ta === tb ? (va || vb) : (ta > tb ? va : vb);
    if (ta || tb) r.tt[k] = Math.max(ta, tb);
    if (v) setTick(r, d, id, true);
  });
  return r;
}

// ---------- sync: end-to-end encrypted blob on textdb.dev, addressed by a hash of the secret sync code ----------
var sync = { code: localStorage.getItem(SKEY) || "", state: "off", msg: "", timer: 0, busy: false, again: false };
function b64u(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
function sha(s) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); }
function keys(code) { return Promise.all([sha("dr-id:" + code), sha("dr-key:" + code)]).then(function (h) {
  return crypto.subtle.importKey("raw", h[1], "AES-GCM", false, ["encrypt", "decrypt"]).then(function (k) {
    return { url: API + "daily-routine-" + Array.from(new Uint8Array(h[0]).slice(0, 20), function (b) { return b.toString(16).padStart(2, "0"); }).join(""), key: k }; }); }); }
function enc(k, obj) { var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj))).then(function (ct) { return JSON.stringify({ v: 1, iv: b64u(iv), ct: b64u(ct) }); }); }
function dec(k, txt) { var o = JSON.parse(txt);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, k, unb64(o.ct)).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); }); }
function setStatus(st, msg) { sync.state = st; sync.msg = msg || ""; var e = document.getElementById("sync");
  if (e) { e.textContent = { off: "", syncing: "⟳ syncing…", ok: "✓ synced " + sync.msg, err: "⚠ sync failed " + sync.msg, offline: "○ offline – will sync later" }[st]; e.className = "sync " + st; } }
function doSync() {
  if (!sync.code) { setStatus("off"); return Promise.resolve(); }
  if (sync.busy) { sync.again = true; return Promise.resolve(); }
  if (!navigator.onLine) { setStatus("offline"); return Promise.resolve(); }
  sync.busy = true; setStatus("syncing");
  var K;
  return keys(sync.code).then(function (k) { K = k; return fetch(K.url, { cache: "no-store" }); })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(function (t) { return t.trim() ? dec(K.key, t) : null; })
    .then(function (remote) {
      var before = JSON.stringify(S);
      if (remote) { S = merge(S, remote); localStorage.setItem(KEY, JSON.stringify(S)); if (JSON.stringify(S) !== before) render(); }
      return enc(K.key, S).then(function (body) { return fetch(K.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body }); })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
    })
    .then(function () { var d = new Date(); setStatus("ok", pad(d.getHours()) + ":" + pad(d.getMinutes())); },
          function (e) { setStatus(navigator.onLine ? "err" : "offline", navigator.onLine ? "(" + (e.message || e) + ")" : ""); })
    .then(function () { sync.busy = false; if (sync.again) { sync.again = false; return doSync(); } });
}
function schedulePush() { if (!sync.code) return; clearTimeout(sync.timer); sync.timer = setTimeout(doSync, 1200); }
function newCode() { return b64u(crypto.getRandomValues(new Uint8Array(18))); }
function linkUrl() { return location.origin + location.pathname + "#sync=" + sync.code; }
function setCode(c) { sync.code = c; if (c) localStorage.setItem(SKEY, c); else localStorage.removeItem(SKEY); setStatus(c ? "syncing" : "off"); render(); return doSync(); }
function checkHash() { var m = /[#&]sync=([A-Za-z0-9_-]{16,})/.exec(location.hash); if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (m[1] === sync.code) return;
  if (confirm("Link this device to sync?\n\nYour tasks and ticks on this device will be merged with the other device (nothing is deleted).")) setCode(m[1]); }

function render() {
  document.getElementById("date").textContent = label(cur);
  var v = document.getElementById("view"), h = "";
  if (view === "today") {
    if (!S.tasks.length) h = '<p class="muted">No tasks yet — add some under "Tasks".</p>';
    S.tasks.forEach(function (t) { var dn = isDone(cur, t.id), st = streak(t.id);
      h += '<div class="task' + (dn ? " done" : "") + '" data-id="' + t.id + '"><span class="box">' + (dn ? "✓" : "") + '</span><span class="name">' + esc(t.name) + '</span><span class="streak">' + (st ? "🔥 " + st : "") + "</span></div>"; });
    if (cur !== today()) h += '<div class="row"><button id="gotoday">Back to today</button></div>';
  } else if (view === "history") {
    var ds = []; for (var i = 13; i >= 0; i--) ds.push(shift(today(), -i));
    h = '<table><tr><th class="n">Task</th>' + ds.map(function (d) { return "<th>" + +d.slice(8) + "</th>"; }).join("") + "<th>🔥</th></tr>";
    S.tasks.forEach(function (t) { h += '<tr><th class="n">' + esc(t.name) + "</th>" + ds.map(function (d) { var y = isDone(d, t.id); return '<td class="' + (y ? "y" : "n") + '">' + (y ? "✓" : "·") + "</td>"; }).join("") + "<td>" + streak(t.id) + "</td></tr>"; });
    h += '</table><p class="muted">Last 14 days (day of month). 🔥 = current streak in days.</p>';
  } else {
    S.tasks.forEach(function (t, i) { h += '<div class="edit"><input data-r="' + t.id + '" value="' + esc(t.name) + '"><button data-up="' + i + '">↑</button><button data-dn="' + i + '">↓</button><button data-del="' + t.id + '">🗑</button></div>'; });
    h += '<div class="edit"><input id="newname" placeholder="New task…"><button id="add">Add</button></div>';
    h += '<h3>Sync between devices</h3>';
    if (!sync.code) {
      h += '<p class="muted">Off. Ticks are only on this device.</p><div class="row"><button id="syncon">Turn on sync (first device)</button><button id="synclink">Link to other device…</button></div>';
    } else {
      h += '<p class="muted">On. To link another device, open this link on it (or enter the code there via "Link to other device"). Keep it private — anyone with it can see and change your routine data.</p>' +
        '<div class="edit"><input id="synccode" readonly value="' + esc(linkUrl()) + '"></div>' +
        '<div class="row"><button id="synccopy">Copy link</button>' + (navigator.share ? '<button id="syncshare">Share link</button>' : "") + '<button id="syncnow">Sync now</button><button id="syncoff">Turn off on this device</button></div>';
    }
    h += '<h3>Backup</h3><div class="row"><button id="exp">Export JSON</button><button id="imp">Import JSON</button><input type="file" id="file" accept=".json,application/json" hidden></div>';
  }
  v.innerHTML = h;
  setStatus(sync.state, sync.msg);
}
function move(i, d) { var j = i + d; if (j < 0 || j >= S.tasks.length) return; var t = S.tasks[i]; S.tasks[i] = S.tasks[j]; S.tasks[j] = t; S.orderTs = now(); save(); render(); }
document.addEventListener("click", function (e) {
  var el = e.target.closest ? e.target.closest("[data-id],[data-v],[data-up],[data-dn],[data-del],button") : null; if (!el) return;
  var ds = el.dataset;
  if (ds.id) { toggle(cur, ds.id); render(); }
  else if (ds.v) { view = ds.v; document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.toggle("on", b === el); }); render(); }
  else if (ds.up) move(+ds.up, -1);
  else if (ds.dn) move(+ds.dn, 1);
  else if (ds.del) { var t = S.tasks.filter(function (x) { return x.id === ds.del; })[0];
    if (t && confirm('Delete "' + t.name + '"? (its history is kept in the data)')) { S.tasks = S.tasks.filter(function (x) { return x !== t; }); S.removed[t.id] = now(); save(); render(); } }
  else if (el.id === "prev") { cur = shift(cur, -1); render(); }
  else if (el.id === "next") { cur = shift(cur, 1); render(); }
  else if (el.id === "gotoday") { cur = today(); render(); }
  else if (el.id === "add") addTask();
  else if (el.id === "syncon") setCode(newCode());
  else if (el.id === "synclink") { var c = prompt("Paste the sync link or code from your other device:"); if (c) { var m = /([A-Za-z0-9_-]{16,})\s*$/.exec(c.trim()); if (m) setCode(m[1]); else alert("That doesn't look like a sync code."); } }
  else if (el.id === "synccopy") { var inp = document.getElementById("synccode"); (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(function () { el.textContent = "Copied ✓"; }, function () { inp.select(); document.execCommand("copy"); el.textContent = "Copied ✓"; }); }
  else if (el.id === "syncshare") navigator.share({ title: "Daily Routine sync link", url: linkUrl() }).catch(function () {});
  else if (el.id === "syncnow") doSync();
  else if (el.id === "syncoff") { if (confirm("Stop syncing on this device? Data stays here; the other device keeps its copy.")) setCode(""); }
  else if (el.id === "exp") { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "daily-routine-" + today() + ".json"; a.click(); }
  else if (el.id === "imp") document.getElementById("file").click();
});
function addTask() { var i = document.getElementById("newname"), n = i.value.trim(); if (!n) return; S.tasks.push({ id: newId(), name: n, ts: now() }); S.orderTs = now(); save(); render(); }
document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "newname") addTask(); });
document.addEventListener("change", function (e) {
  if (e.target.dataset && e.target.dataset.r) { var n = e.target.value.trim(); S.tasks.forEach(function (t) { if (t.id === e.target.dataset.r && n) { t.name = n; t.ts = now(); } }); save(); render(); }
  if (e.target.id === "file" && e.target.files[0]) { var r = new FileReader(); r.onload = function () {
    try { var d = JSON.parse(r.result); if (!d.tasks || !d.days) throw 0; if (confirm("Replace all current data with the imported file?")) { S = migrate(d); S.orderTs = now(); S.nextId = S.nextId || S.tasks.length + 100; save(); render(); } }
    catch (x) { alert("Not a valid Daily Routine backup file."); } }; r.readAsText(e.target.files[0]); }
});
document.addEventListener("visibilitychange", function () { if (!document.hidden) { render(); doSync(); } });
window.addEventListener("online", function () { doSync(); });
window.addEventListener("hashchange", checkHash);
if (typeof module !== "undefined") module.exports = { merge: merge };
render(); checkHash(); doSync();
