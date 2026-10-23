(function () {
  "use strict";

  var TABS = ["general", "times", "aliyot", "messages"];
  var CACHE_KEY = "beit-knesset-data-v1";

  // ---------- נתוני דוגמה (באותו מבנה כמו הגיליון) ----------
  var SAMPLE = {
    general: [
      ["שדה", "ערך"],
      ["שם בית הכנסת", "בית כנסת המרכזי עזרת אחים"],
      ["פרשה", "לך לך"],
      ["בעל קורא", "רועי אהרוני"],
      ["תאריך", ""]
    ],
    times: [
      ["קבוצה", "תפילה", "שעה", "הערה"],
      ["חול", "שחרית", "6:15", ""],
      ["חול", "מנחה", "16:50", ""],
      ["חול", "ערבית", "17:20", ""],
      ["שבת", "מנחה ערב שבת", "16:55", ""],
      ["שבת", "שחרית", "8:00", ""],
      ["שבת", "מנחה", "16:30", ""],
      ["שבת", "ערבית מוצאי שבת", "17:40", ""]
    ],
    aliyot: [
      ["עלייה", "שם"],
      ["ראשון", "אהרן כהן"],
      ["שני", "משה לוי"],
      ["שלישי", "דוד ישראלי"],
      ["רביעי", "יוסף מזרחי"],
      ["חמישי", "שמואל פרץ"],
      ["שישי", "יעקב ביטון"],
      ["שביעי", "אליהו אברהם"],
      ["מפטיר", "נתן שפירא"],
      ["הפטרה", "נתן שפירא"]
    ],
    messages: [
      ["תאריך", "כותרת", "תוכן", "עד תאריך"],
      ["23/10/2026", "קידוש בשבת", "הקידוש השבת אחרי התפילה, בחסות משפחת לוי לרגל הולדת הבת. כולם מוזמנים.", "25/10/2026"],
      ["20/10/2026", "שיעור שבועי", "השיעור בגמרא מתקיים בימי שלישי בשעה 20:30 בבית המדרש.", ""]
    ]
  };

  // ---------- עזרים ----------
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function clean(v) { return (v == null ? "" : String(v)).trim(); }

  function parseCSV(text) {
    var rows = [], row = [], field = "", inQuotes = false;
    text = String(text).replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // הופך טבלה (שורה ראשונה = כותרות) לרשימת שורות, ומחזיר פונקציה לשליפת עמודה לפי שם
  function table(rows) {
    rows = (rows || []).filter(function (r) {
      return r.some(function (c) { return clean(c) !== ""; });
    });
    var headers = (rows[0] || []).map(clean);
    function col(names, fallback) {
      for (var i = 0; i < names.length; i++) {
        var idx = headers.indexOf(names[i]);
        if (idx !== -1) return idx;
      }
      return fallback;
    }
    return { headers: headers, body: rows.slice(1), col: col };
  }

  function parseDate(s) {
    s = clean(s);
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += 2000;
      return new Date(y, +m[2] - 1, +m[1]);
    }
    return null;
  }

  function startOfToday() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function hebrewNumber(n) {
    var ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    var tens = ["", "י", "כ", "ל"];
    var s = n === 15 ? "טו" : n === 16 ? "טז" : tens[Math.floor(n / 10)] + ones[n % 10];
    return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
  }

  function hebrewDate(d) {
    try {
      var parts = new Intl.DateTimeFormat("he-u-ca-hebrew", { day: "numeric", month: "long" }).formatToParts(d);
      return parts.map(function (p) {
        return p.type === "day" && /^\d+$/.test(p.value) ? hebrewNumber(+p.value) : p.value;
      }).join("");
    } catch (e) {
      return "";
    }
  }

  function gregorianDate(d) {
    return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(d);
  }

  function upcomingShabbat() {
    var d = startOfToday();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    return d;
  }

  function isShabbatTime() {
    var now = new Date();
    var day = now.getDay();
    return day === 6 || (day === 5 && now.getHours() >= 12);
  }

  // ---------- הצגה ----------
  var state = { groups: [], selected: null };

  function renderGeneral(rows) {
    var t = table(rows);
    var map = {};
    t.body.forEach(function (r) {
      var key = clean(r[0]);
      if (key) map[key] = clean(r[1]);
    });

    var name = map["שם בית הכנסת"] || "בית הכנסת";
    $("shul-name").textContent = name;
    document.title = name;

    var parasha = map["פרשה"] || map["פרשת השבוע"] || "";
    if (parasha && parasha.indexOf("פרשת") !== 0) parasha = "פרשת " + parasha;
    $("shabbat-title").textContent = parasha ? "שבת " + parasha : "";

    var date = parseDate(map["תאריך"]) || upcomingShabbat();
    var heb = hebrewDate(date);
    $("shabbat-date").textContent = parasha ? (heb ? heb + ", " : "") + gregorianDate(date) : "";

    var reader = map["בעל קורא"] || map["בעל הקורא"] || "";
    var box = $("reader");
    box.textContent = "";
    if (reader) {
      box.appendChild(el("span", "label", "בעל קורא: "));
      box.appendChild(el("span", "who", reader));
    }
  }

  function renderTimes(rows) {
    var t = table(rows);
    var cGroup = t.col(["קבוצה", "יום"], 0);
    var cName = t.col(["תפילה"], 1);
    var cTime = t.col(["שעה"], 2);
    var cNote = t.col(["הערה"], 3);

    var groups = [];
    var byGroup = {};
    t.body.forEach(function (r) {
      var g = clean(r[cGroup]) || "כללי";
      var name = clean(r[cName]);
      if (!name) return;
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push({ name: name, time: clean(r[cTime]), note: clean(r[cNote]) });
    });

    state.groups = groups;
    state.byGroup = byGroup;

    if (groups.indexOf(state.selected) === -1) {
      var shabbat = groups.filter(function (g) { return g.indexOf("שבת") !== -1; })[0];
      state.selected = isShabbatTime() && shabbat ? shabbat : groups[0] || null;
    }

    var bar = $("groups");
    bar.textContent = "";
    if (groups.length > 1) {
      groups.forEach(function (g) {
        var b = el("button", null, g);
        b.type = "button";
        b.setAttribute("aria-pressed", String(g === state.selected));
        b.addEventListener("click", function () {
          if (state.selected === g) return;
          state.selected = g;
          renderTimes(rows);
          var list = $("board-rows");
          list.classList.remove("fresh");
          void list.offsetWidth;
          list.classList.add("fresh");
        });
        bar.appendChild(b);
      });
    }

    var list = $("board-rows");
    list.textContent = "";
    var items = byGroup[state.selected] || [];
    if (!items.length) {
      list.appendChild(el("li", "empty", "הזמנים יפורסמו בקרוב"));
      return;
    }
    items.forEach(function (it) {
      var li = el("li");
      li.appendChild(el("span", "name", it.name));
      li.appendChild(el("span", "time", it.time));
      list.appendChild(li);
      if (it.note) list.appendChild(el("li", "note", it.note));
    });
  }

  function renderAliyot(rows) {
    var t = table(rows);
    var cRole = t.col(["עלייה", "עליה"], 0);
    var cName = t.col(["שם"], 1);
    var list = $("aliyot");
    list.textContent = "";

    var items = t.body.map(function (r) {
      return { role: clean(r[cRole]), name: clean(r[cName]) };
    }).filter(function (it) { return it.role && it.name; });

    if (!items.length) {
      list.appendChild(el("li", "empty", "העליות לשבת הקרובה עוד לא פורסמו."));
      return;
    }
    items.forEach(function (it) {
      var li = el("li", it.role.indexOf("הפטר") === 0 ? "haftara" : null);
      li.appendChild(el("span", "role", it.role));
      li.appendChild(el("span", "who", it.name));
      list.appendChild(li);
    });
  }

  function appendWithLinks(parent, text) {
    var re = /(https?:\/\/[^\s]+)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el("a", null, m[1]);
      a.href = m[1];
      a.target = "_blank";
      a.rel = "noopener";
      parent.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMessages(rows) {
    var t = table(rows);
    var cDate = t.col(["תאריך"], 0);
    var cTitle = t.col(["כותרת"], 1);
    var cText = t.col(["תוכן", "טקסט", "הודעה"], 2);
    var cUntil = t.col(["עד תאריך", "עד"], 3);
    var today = startOfToday();

    var items = t.body.map(function (r, i) {
      return {
        date: parseDate(r[cDate]),
        title: clean(r[cTitle]),
        text: clean(r[cText]),
        until: parseDate(r[cUntil]),
        order: i
      };
    }).filter(function (it) {
      if (!it.title && !it.text) return false;
      if (it.until && today > it.until) return false;
      if (it.date && it.date > today) return false;
      return true;
    }).sort(function (a, b) {
      var da = a.date ? a.date.getTime() : 0;
      var db = b.date ? b.date.getTime() : 0;
      return db - da || a.order - b.order;
    });

    var box = $("news");
    box.textContent = "";
    if (!items.length) {
      box.appendChild(el("p", "empty", "אין הודעות כרגע."));
      return;
    }
    items.forEach(function (it) {
      var art = el("article");
      if (it.date) {
        var tm = el("time", null, gregorianDate(it.date));
        tm.dateTime = it.date.getFullYear() + "-" + String(it.date.getMonth() + 1).padStart(2, "0") + "-" + String(it.date.getDate()).padStart(2, "0");
        art.appendChild(tm);
      }
      if (it.title) art.appendChild(el("h3", null, it.title));
      if (it.text) {
        var p = el("p");
        appendWithLinks(p, it.text);
        art.appendChild(p);
      }
      box.appendChild(art);
    });
  }

  function render(data) {
    renderGeneral(data.general);
    renderTimes(data.times);
    renderAliyot(data.aliyot);
    renderMessages(data.messages);
  }

  function setStatus(text) {
    var s = $("status");
    s.textContent = text || "";
    s.hidden = !text;
  }

  // ---------- טעינה מהגיליון ----------
  function tabUrl(cfg, key) {
    if (cfg.publishedUrl) {
      var base = cfg.publishedUrl.split("?")[0].replace(/\/pubhtml$/, "/pub");
      return base + "?output=csv&single=true&gid=" + encodeURIComponent(cfg.gids[key]);
    }
    return "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(cfg.sheetId) +
      "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(cfg.tabNames[key]);
  }

  function isConfigured(cfg) {
    if (!cfg) return false;
    if (cfg.publishedUrl) return TABS.every(function (k) { return cfg.gids && clean(cfg.gids[k]) !== ""; });
    return !!cfg.sheetId;
  }

  function fetchTab(cfg, key) {
    return fetch(tabUrl(cfg, key), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function (text) {
      if (/^\s*</.test(text)) throw new Error("not csv");
      return parseCSV(text);
    });
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, savedAt: Date.now() })); } catch (e) { /* לא חובה */ }
  }

  function start() {
    var cfg = window.SITE_CONFIG || {};
    cfg.tabNames = cfg.tabNames || {};
    ["general", "times", "aliyot", "messages"].forEach(function (k, i) {
      cfg.tabNames[k] = cfg.tabNames[k] || ["כללי", "זמנים", "עליות", "הודעות"][i];
    });

    if (!isConfigured(cfg)) {
      setStatus("כרגע מוצגים כאן נתוני דוגמה. כשהגיליון יחובר, יופיע כאן המידע של בית הכנסת.");
      render(SAMPLE);
      return;
    }

    var cached = readCache();
    if (cached && cached.data) render(cached.data);

    Promise.all(TABS.map(function (k) { return fetchTab(cfg, k); })).then(function (results) {
      var data = {};
      TABS.forEach(function (k, i) { data[k] = results[i]; });
      writeCache(data);
      setStatus("");
      render(data);
    }).catch(function () {
      if (cached && cached.data) {
        var when = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(cached.savedAt));
        setStatus("לא הצלחנו לטעון את המידע העדכני. מוצג המידע מ-" + when + ".");
      } else {
        setStatus("לא ניתן לטעון את המידע כרגע. בדקו את החיבור לאינטרנט ונסו שוב.");
      }
    });
  }

  start();
})();
