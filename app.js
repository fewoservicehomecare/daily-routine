"use strict";
var KEY = "dailyRoutine.v1";
function load() { try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.tasks && d.days) return d; } catch (e) {} 
  return { tasks: [{ id: "t1", name: "Get morning sunlight" }, { id: "t2", name: "Morning skincare" }, { id: "t3", name: "Gym" }, { id: "t4", name: "Stretching" }, { id: "t5", name: "Play Harmonium" }, { id: "t7", name: "Study Hindi" }, { id: "t6", name: "Evening skincare" }], days: {}, nextId: 8, migrations: ["add-study-hindi"] }; }
function migrate(d) { // each migration runs once per device, tracked in d.migrations
  var done = d.migrations = d.migrations || [];
  if (done.indexOf("add-study-hindi") < 0) {
    if (!d.tasks.some(function (t) { return /hindi/i.test(t.name); })) {
      var id, n = d.nextId || 100; do { id = "t" + n++; } while (d.tasks.some(function (t) { return t.id === id; }));
      d.nextId = n;
      var i = d.tasks.findIndex(function (t) { return /harmonium/i.test(t.name); });
      if (i < 0) { var j = d.tasks.findIndex(function (t) { return /evening/i.test(t.name); }); i = j < 0 ? d.tasks.length - 1 : j - 1; }
      d.tasks.splice(i + 1, 0, { id: id, name: "Study Hindi" });
    }
    done.push("add-study-hindi");
  }
  delete d.mig; return d; }
var S = migrate(load()); localStorage.setItem(KEY, JSON.stringify(S));
var view = "today", cur = today();
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today() { return ymd(new Date()); }
function shift(s, n) { var p = s.split("-"); var d = new Date(+p[0], p[1] - 1, +p[2] + n); return ymd(d); }
function isDone(day, id) { return !!(S.days[day] && S.days[day][id]); }
function toggle(day, id) { var o = S.days[day] = S.days[day] || {}; if (o[id]) delete o[id]; else o[id] = 1; if (!Object.keys(o).length) delete S.days[day]; save(); }
function streak(id, from) { var d = from || today(), n = 0; if (!isDone(d, id)) d = shift(d, -1); while (isDone(d, id)) { n++; d = shift(d, -1); } return n; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function label(s) { var p = s.split("-"), d = new Date(+p[0], p[1] - 1, +p[2]);
  var t = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return s === today() ? "Today · " + t : s === shift(today(), -1) ? "Yesterday · " + t : t; }
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
    h += '<div class="row"><button id="exp">Export JSON</button><button id="imp">Import JSON</button><input type="file" id="file" accept=".json,application/json" hidden></div>';
    h += '<p class="muted">Data is stored only in this browser on this device.</p>';
  }
  v.innerHTML = h;
}
function move(i, d) { var j = i + d; if (j < 0 || j >= S.tasks.length) return; var t = S.tasks[i]; S.tasks[i] = S.tasks[j]; S.tasks[j] = t; save(); render(); }
document.addEventListener("click", function (e) {
  var el = e.target.closest ? e.target.closest("[data-id],[data-v],[data-up],[data-dn],[data-del],button") : null; if (!el) return;
  var ds = el.dataset;
  if (ds.id) { toggle(cur, ds.id); render(); }
  else if (ds.v) { view = ds.v; document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.toggle("on", b === el); }); render(); }
  else if (ds.up) move(+ds.up, -1);
  else if (ds.dn) move(+ds.dn, 1);
  else if (ds.del) { var t = S.tasks.filter(function (x) { return x.id === ds.del; })[0];
    if (t && confirm('Delete "' + t.name + '"? (its history is kept in the data)')) { S.tasks = S.tasks.filter(function (x) { return x !== t; }); save(); render(); } }
  else if (el.id === "prev") { cur = shift(cur, -1); render(); }
  else if (el.id === "next") { cur = shift(cur, 1); render(); }
  else if (el.id === "gotoday") { cur = today(); render(); }
  else if (el.id === "add") addTask();
  else if (el.id === "exp") { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "daily-routine-" + today() + ".json"; a.click(); }
  else if (el.id === "imp") document.getElementById("file").click();
});
function addTask() { var i = document.getElementById("newname"), n = i.value.trim(); if (!n) return; S.tasks.push({ id: "t" + (S.nextId++), name: n }); save(); render(); }
document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "newname") addTask(); });
document.addEventListener("change", function (e) {
  if (e.target.dataset && e.target.dataset.r) { var n = e.target.value.trim(); S.tasks.forEach(function (t) { if (t.id === e.target.dataset.r && n) t.name = n; }); save(); render(); }
  if (e.target.id === "file" && e.target.files[0]) { var r = new FileReader(); r.onload = function () {
    try { var d = JSON.parse(r.result); if (!d.tasks || !d.days) throw 0; if (confirm("Replace all current data with the imported file?")) { S = migrate(d); S.nextId = S.nextId || S.tasks.length + 100; save(); render(); } }
    catch (x) { alert("Not a valid Daily Routine backup file."); } }; r.readAsText(e.target.files[0]); }
});
document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); });
render();
