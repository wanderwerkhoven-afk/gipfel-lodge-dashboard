// ========= Config =========
const NET_FACTOR = 0.76;
const OWNER_COLOR = getCss("--owner");
const PLATFORM_COLOR = getCss("--accent");

const GRID_COLOR = "rgba(255,255,255,.12)";

// Winter: dec-jan-feb-mrt | Zomer: jun-jul-aug
const WINTER_MONTHS = new Set([11, 0, 1, 2]);
const SUMMER_MONTHS = new Set([5, 6, 7]);

const SEASON_WINTER_FILL = "rgba(122,162,255,.08)";
const SEASON_SUMMER_FILL = "rgba(140,255,215,.06)";


// ========= DOM =========
const fileInput = document.getElementById("fileInput");
const logEl = document.getElementById("log");

const modeGrossBtn = document.getElementById("modeGross");
const modeNetBtn = document.getElementById("modeNet");

const kpiBookings = document.getElementById("kpiBookings");
const kpiOwnerBookings = document.getElementById("kpiOwnerBookings");
const kpiNights = document.getElementById("kpiNights");
const kpiOwnerNights = document.getElementById("kpiOwnerNights");
const kpiGrossRevenue = document.getElementById("kpiGrossRevenue");
const kpiGrossRevPerNight = document.getElementById("kpiGrossRevPerNight");
const kpiNetRevenue = document.getElementById("kpiNetRevenue");
const kpiNetRevPerNight = document.getElementById("kpiNetRevPerNight");


const tableWrap = document.getElementById("tableWrap");

const ctxRevenueMonth = document.getElementById("chartRevenueMonth");
const ctxBookingsNights = document.getElementById("chartBookingsNights");
const ctxLeadTime = document.getElementById("chartLeadTime");
const ctxRevenueChannel = document.getElementById("chartRevenueChannel");
const ctxGuestPie = document.getElementById("chartGuestPie");
const ctxFreeWeeks = document.getElementById("chartFreeWeeks");
const gapsWrap = document.getElementById("gapsWrap");
const ctxCumulative = document.getElementById("chartCumulative");


// ========= State =========
let rawRows = [];
let mode = "gross"; // "gross" | "net"

let chartRevenueMonth, chartBookingsNights, chartRevenueChannel, chartGuestPie, chartCumulative, chartLeadTime, chartFreeWeeks;

// ========= Utils =========
function getCss(varName){
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function log(msg){
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${msg}\n` + logEl.textContent;
}

function toNumber(v){
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string"){
    const s = v.trim();
    if (!s || s === "-") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(v){
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string"){
    // your cells sometimes are like "25-01-2026 (middag)" etc.
    const onlyDate = v.split(" ")[0].trim(); // keep first token
    // Try dd-mm-yyyy
    const m = onlyDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m){
      const dd = Number(m[1]), mm = Number(m[2]) - 1, yyyy = Number(m[3]);
      const d = new Date(yyyy, mm, dd);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d2 = new Date(v);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function fmtEUR(n){
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

function fmtPct(n){
  if (n == null || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(0) + "%";
}

function monthKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtDateNL(d){
  return d.toLocaleDateString("nl-NL", { day:"2-digit", month:"short", year:"numeric" });
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function safeStr(v){
  return String(v ?? "");
}

function guessChannel(boekingStr){
  const s = safeStr(boekingStr).toLowerCase();
  if (!s) return "Onbekend";
  if (s.includes("huiseigenaar")) return "Huiseigenaar";
  if (s.includes("villa for you") || s.includes("villaforyou")) return "Villa for You";
  if (s.includes("booking")) return "Booking.com";
  if (s.includes("airbnb")) return "Airbnb";
  return "Overig";
}

function isOwnerBooking(row){
  // Primary rule: Inkomsten is '-' or empty → owner booking
  const inc = row["Inkomsten"];
  if (typeof inc === "string" && inc.trim() === "-") return true;
  // Secondary: booking text contains 'huiseigenaar'
  return safeStr(row["Boeking"]).toLowerCase().includes("huiseigenaar");
}

// ========= Data pipeline =========
function normalizeRows(rows){
  return rows.map((r) => {
    const aankomst = toDate(r["Aankomst"]);
    const vertrek = toDate(r["Vertrek"]);
    const geboektOp = toDate(r["Geboekt op"]);

    const nights = toNumber(r["Nachten"]) ?? 0;

    const volw = toNumber(r["Volw."]) ?? 0;
    const knd = toNumber(r["Knd."]) ?? 0;
    const bab = toNumber(r["Bab."]) ?? 0;
    const hd = toNumber(r["H.d."]) ?? 0;
    const guests = volw + knd + bab + hd;

    const owner = isOwnerBooking(r);

    const gross = owner ? 0 : (toNumber(r["Inkomsten"]) ?? 0);
    const net = gross * NET_FACTOR;

    const channel = owner ? "Huiseigenaar" : guessChannel(r["Boeking"]);

    return {
      ...r,
      __aankomst: aankomst,
      __vertrek: vertrek,
      __geboektOp: geboektOp,
      __nights: nights,
      __guests: guests,
      __owner: owner,
      __gross: gross,
      __net: net,
      __channel: channel,
    };
  }).filter(r => r.__aankomst); // require arrival date
}

function valueByMode(row){
  return mode === "net" ? row.__net : row.__gross;
}

function computeKPIs(rows){
  const platformRows = rows.filter(r => !r.__owner);
  const ownerRows = rows.filter(r => r.__owner);

  const bookings = platformRows.length;
  const ownerBookings = ownerRows.length;

  const nights = platformRows.reduce((s,r)=> s + (r.__nights || 0), 0);
  const ownerNights = ownerRows.reduce((s,r)=> s + (r.__nights || 0), 0);

  const grossRevenue = platformRows.reduce((s,r)=> s + (r.__gross || 0), 0);
  const netRevenue = platformRows.reduce((s,r)=> s + (r.__net || 0), 0);

  const grossRevPerNight = nights > 0 ? grossRevenue / nights : null;
  const netRevPerNight = nights > 0 ? netRevenue / nights : null;

  return {
    bookings,
    ownerBookings,
    nights,
    ownerNights,
    grossRevenue,
    netRevenue,
    grossRevPerNight,
    netRevPerNight
  };
}


// ========= Aggregations for charts =========
function aggRevenueByMonth(rows){
  const monthNames = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

  // Sorteer boekingen op aankomst voor stabiele stacking
  const sorted = [...rows].sort((a,b)=> a.__aankomst - b.__aankomst);

  // Bepaal alle maanden die voorkomen
  const monthKeys = [];
  const monthIndex = new Map(); // key => idx

  for (const r of sorted){
    const y = r.__aankomst.getFullYear();
    const m = r.__aankomst.getMonth() + 1; // 1-12
    const key = `${y}-${String(m).padStart(2,"0")}`;
    if (!monthIndex.has(key)){
      monthIndex.set(key, monthKeys.length);
      monthKeys.push(key);
    }
  }

  const labels = monthKeys.map(k => {
    const [y, mStr] = k.split("-");
    const m = Number(mStr) - 1;
    return [monthNames[m], y]; // multiline label
  });

  const metaMonths = monthKeys.map(k => Number(k.split("-")[1]) - 1); // 0-11

  // Maak per boeking een dataset (1 segment in 1 maand)
  const datasets = sorted.map((r, i) => {
    const y = r.__aankomst.getFullYear();
    const m = r.__aankomst.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2,"0")}`;
    const idx = monthIndex.get(key);

    const value = valueByMode(r);

    // kleur: owner oranje, anders blauw met subtiele variatie
    const isOwner = r.__owner;
    const bg = isOwner
      ? "rgba(255, 138, 42, 0.75)"
      : `rgba(122, 162, 255, ${0.35 + (i % 6) * 0.08})`; // variatie alpha

    const data = new Array(monthKeys.length).fill(0);
    data[idx] = value;

    const dateLabel = r.__aankomst.toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    return {
      label: dateLabel,          // mag leeg/clean blijven
      __dateLabel: dateLabel,    // 👈 extra veld voor tooltip
      data,
      backgroundColor: bg,
      borderColor: "rgba(255,255,255,.18)",
      borderWidth: 1
    };
  });

  // Bereken totaal per maand
  const monthTotals = monthKeys.map((_, idx) =>
    datasets.reduce((sum, ds) => sum + (ds.data[idx] || 0), 0)
  );

  return { labels, datasets, metaMonths, monthTotals };

}

function aggBookingsNightsByMonth(rows){
  const monthNames = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

  const map = new Map(); // key => { bookings, nights }

  for (const r of rows){
    const d = r.__aankomst;
    if (!d) continue;

    const y = d.getFullYear();
    const m = d.getMonth(); // 0-11
    const key = `${y}-${m}`;

    if (!map.has(key)){
      map.set(key, { bookings: 0, nights: 0 });
    }

    map.get(key).bookings += 1;
    map.get(key).nights += (r.__nights || 0);
  }

  const keys = [...map.keys()].sort((a,b)=>{
    const [ya,ma] = a.split("-").map(Number);
    const [yb,mb] = b.split("-").map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });

  return {
    labels: keys.map(k => {
      const [y,m] = k.split("-").map(Number);
      return [monthNames[m], String(y)];
    }),
    bookings: keys.map(k => map.get(k).bookings),
    nights: keys.map(k => map.get(k).nights),
    metaMonths: keys.map(k => Number(k.split("-")[1])) // voor seizoenshighlight (optioneel)
  };
}

function daysBetween(a, b){
  // a,b are Date
  const ms = (a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function aggLeadTime(rows){
  // buckets in days
  const buckets = [
    { label: "0–7",   min: 0,   max: 7 },
    { label: "8–14",  min: 8,   max: 14 },
    { label: "15–30", min: 15,  max: 30 },
    { label: "31–60", min: 31,  max: 60 },
    { label: "61–90", min: 61,  max: 90 },
    { label: "91–180",min: 91,  max: 180 },
    { label: "181+",  min: 181, max: Infinity },
  ];

  const counts = new Array(buckets.length).fill(0);
  const values = []; // raw lead times for optional stats

  for (const r of rows){
    if (!r.__geboektOp || !r.__aankomst) continue;

    const lead = daysBetween(r.__aankomst, r.__geboektOp);
    if (!Number.isFinite(lead) || lead < 0) continue; // ignore invalid

    values.push(lead);

    const idx = buckets.findIndex(b => lead >= b.min && lead <= b.max);
    if (idx >= 0) counts[idx] += 1;
  }

  return {
    labels: buckets.map(b => b.label),
    counts,
    total: counts.reduce((a,b)=>a+b,0),
    values
  };
}

function aggRevenueByChannel(rows){
  const map = new Map();
  for (const r of rows){
    const ch = r.__channel || "Onbekend";
    const v = valueByMode(r);
    map.set(ch, (map.get(ch) || 0) + v);
  }
  const sorted = [...map.entries()].sort((a,b)=> b[1]-a[1]);
  return { labels: sorted.map(x=>x[0]), values: sorted.map(x=>x[1]) };
}

function aggGuestPie(rows){
  const map = new Map();

  for (const r of rows){
    if (r.__owner){
      map.set("Eigen boeking", (map.get("Eigen boeking") || 0) + 1);
      continue;
    }

    const g = Math.max(0, Math.round(r.__guests || 0));
    if (g <= 0) continue;

    const key = g >= 10 ? "10" : String(g);
    map.set(key, (map.get(key) || 0) + 1);
  }

  // Sorteer: eerst 1..10, en zet "Eigen boeking" als laatste (of eerste als je wil)
  const numericKeys = [...map.keys()].filter(k => k !== "Eigen boeking").sort((a,b)=> Number(a)-Number(b));
  const labels = [];
  if (map.has("Eigen boeking")) labels.push("Eigen boeking");
  labels.push(...numericKeys);

  const values = labels.map(k => map.get(k) || 0);

  return { labels, values };
}

function startOfDay(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ISO week key: YYYY-WW
function isoWeekKey(date){
  const d = startOfDay(date);
  // Thursday in current week decides the year
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const thursday = addDays(d, 3 - day);
  const year = thursday.getFullYear();

  // week 1 is the week with Jan 4th
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = addDays(jan4, -jan4Day);

  const diffDays = Math.round((startOfDay(d) - startOfDay(week1Mon)) / (1000*60*60*24));
  const week = 1 + Math.floor(diffDays / 7);
  return `${year}-W${String(week).padStart(2,"0")}`;
}

// Build a set of occupied nights (date strings) from bookings.
// We count nights from arrival up to (but not including) departure.
function buildOccupiedNightSet(rows){
  const occ = new Set();

  for (const r of rows){
    if (!r.__aankomst || !r.__vertrek) continue;

    let cur = startOfDay(r.__aankomst);
    const end = startOfDay(r.__vertrek);

    while (cur < end){
      occ.add(cur.toISOString().slice(0,10)); // YYYY-MM-DD
      cur = addDays(cur, 1);
    }
  }
  return occ;
}

function aggFreeNightsByWeek(rows){
  const occ = buildOccupiedNightSet(rows);

  // range: van min aankomst tot max vertrek
  const valid = rows.filter(r => r.__aankomst && r.__vertrek);
  if (!valid.length){
    return { labels: [], free: [], booked: [] };
  }

  const minDate = startOfDay(valid.reduce((m,r)=> r.__aankomst < m ? r.__aankomst : m, valid[0].__aankomst));
  const maxDate = startOfDay(valid.reduce((m,r)=> r.__vertrek > m ? r.__vertrek : m, valid[0].__vertrek));

  // tel per ISO week: booked nights (0..7)
  const weekBooked = new Map();

  let cur = new Date(minDate);
  while (cur < maxDate){
    const key = isoWeekKey(cur);
    const ds = cur.toISOString().slice(0,10);
    const isBooked = occ.has(ds);

    weekBooked.set(key, (weekBooked.get(key) || 0) + (isBooked ? 1 : 0));
    cur = addDays(cur, 1);
  }

  const labels = [...weekBooked.keys()].sort();
  const booked = labels.map(k => Math.min(7, weekBooked.get(k) || 0));
  const free = labels.map((k, i) => 7 - booked[i]);

  return { labels, free, booked };
}

// Continuous gap periods between bookings (useful for “korting ja/nee”)
function computeGaps(rows){
  const intervals = rows
    .filter(r => r.__aankomst && r.__vertrek)
    .map(r => ({ start: startOfDay(r.__aankomst), end: startOfDay(r.__vertrek) }))
    .sort((a,b)=> a.start - b.start);

  if (!intervals.length) return [];

  // merge overlaps/touching
  const merged = [intervals[0]];
  for (let i=1; i<intervals.length; i++){
    const last = merged[merged.length - 1];
    const cur = intervals[i];
    if (cur.start <= last.end){ // overlap/touch
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push(cur);
    }
  }

  // gaps between merged intervals
  const gaps = [];
  for (let i=0; i<merged.length - 1; i++){
    const a = merged[i];
    const b = merged[i+1];
    const gapNights = Math.round((b.start - a.end) / (1000*60*60*24));
    if (gapNights > 0){
      gaps.push({
        start: a.end,
        end: b.start,
        nights: gapNights
      });
    }
  }
  return gaps;
}


function aggCumulativeRevenue(rows){
  // sort by arrival date
  const sorted = [...rows].sort((a,b)=> a.__aankomst - b.__aankomst);

  // build cumulative over booking events (step-like)
  let cum = 0;
  const points = sorted.map(r => {
    const v = valueByMode(r); // bruto/netto toggle
    cum += (v || 0);
    return {
      x: r.__aankomst,
      y: cum,
      bookingValue: v || 0,
      nights: r.__nights || 0,   // 👈 AANTAL NACHTEN
      owner: !!r.__owner,
      vertrek: r.__vertrek || null
    };
  });

  const bookingSpans = sorted
  .filter(r => r.__aankomst && r.__vertrek)
  .map((r, i) => ({
    start: r.__aankomst,
    end: r.__vertrek,
    owner: !!r.__owner,
    idx: i
  }));


  // season lines (you used fixed dates)
  const seasonLines = [
    { x: new Date("2026-06-01"), label: "Zomer" },
    { x: new Date("2026-11-15"), label: "Winter" }
  ];

  const total = points.length ? points[points.length - 1].y : 0;

  const minDate = sorted.length ? sorted[0].__aankomst : null;
  const maxDate = sorted.length ? (sorted[sorted.length - 1].__vertrek || sorted[sorted.length - 1].__aankomst) : null;

  return { points, bookingSpans, seasonLines, total, minDate, maxDate };

}


// ========= Rendering =========
function renderKPIs(rows){
  const k = computeKPIs(rows);

  kpiBookings.textContent = k.bookings;
  kpiOwnerBookings.textContent = k.ownerBookings;

  kpiNights.textContent = k.nights;
  kpiOwnerNights.textContent = k.ownerNights;

  kpiGrossRevenue.textContent = fmtEUR(k.grossRevenue);
  kpiGrossRevPerNight.textContent = k.grossRevPerNight ? fmtEUR(k.grossRevPerNight) : "—";

  kpiNetRevenue.textContent = fmtEUR(k.netRevenue);
  kpiNetRevPerNight.textContent = k.netRevPerNight ? fmtEUR(k.netRevPerNight) : "—";
}


function renderTable(rows){
  // show arrival, departure, nights, channel, country, guests, gross, net, note
  const columns = [
    { key: "__aankomst", label: "Aankomst", fmt: v => v ? v.toLocaleDateString("nl-NL") : "" },
    { key: "__vertrek", label: "Vertrek", fmt: v => v ? v.toLocaleDateString("nl-NL") : "" },
    { key: "__nights", label: "Nachten" },
    { key: "__channel", label: "Kanaal" },
    { key: "Land", label: "Land" },
    { key: "__guests", label: "Gasten" },
    { key: "__gross", label: "Bruto", fmt: fmtEUR },
    { key: "__net", label: "Netto", fmt: fmtEUR },
    { key: "Opmerking", label: "Opmerking" },
  ];

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of columns){
    const th = document.createElement("th");
    th.textContent = c.label;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  const sorted = [...rows].sort((a,b)=> a.__aankomst - b.__aankomst);

  for (const r of sorted){
    const tr = document.createElement("tr");
    if (r.__owner) tr.classList.add("owner");

    for (const c of columns){
      const td = document.createElement("td");
      const val = r[c.key];
      td.textContent = c.fmt ? c.fmt(val) : String(val ?? "");
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);
}

function destroy(chart){
  if (chart) chart.destroy();
  return null;
}

function renderGapsTable(rows){
  const gaps = computeGaps(rows)
    .sort((a,b)=> b.nights - a.nights); // grootste gaps bovenaan

  const cols = [
    { k: "start", label: "Start", fmt: d => d.toLocaleDateString("nl-NL") },
    { k: "end", label: "Eind", fmt: d => d.toLocaleDateString("nl-NL") },
    { k: "nights", label: "Vrije nachten" },
    { k: "advies", label: "Kortingsadvies", fmt: v => v },
  ];

  // simpele “actie”-logica (kunnen we later slimmer maken)
  function advice(n){
    if (n >= 7) return "Overweeg weekdeal / -10%";
    if (n >= 4) return "Overweeg 20%";
    if (n >= 2) return "weinig mogelijk / last-minute";
    return "—";
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of cols){
    const th = document.createElement("th");
    th.textContent = c.label;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  for (const g of gaps){
    const tr = document.createElement("tr");
    const row = { ...g, advies: advice(g.nights) };

    for (const c of cols){
      const td = document.createElement("td");
      const val = row[c.k];
      td.textContent = c.fmt ? c.fmt(val) : String(val);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);

  gapsWrap.innerHTML = "";
  gapsWrap.appendChild(table);
}


// ========= Rendering ========= Season bands plugin for Chart.js, to highlight winter/summer months in the revenue by month chart
const seasonBandsPlugin = {
  id: "seasonBands",
  beforeDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    const x = scales.x;
    if (!x || !pluginOptions?.months) return;

    const months = pluginOptions.months; // array 0-11 per label
    ctx.save();

    for (let i = 0; i < months.length; i++){
      const m = months[i];

      let fill = null;
      if (WINTER_MONTHS.has(m)) fill = SEASON_WINTER_FILL;
      else if (SUMMER_MONTHS.has(m)) fill = SEASON_SUMMER_FILL;

      if (!fill) continue;

      // Determine band boundaries between ticks
      const xCenter = x.getPixelForTick(i);
      const prev = i > 0 ? x.getPixelForTick(i - 1) : chartArea.left;
      const next = i < months.length - 1 ? x.getPixelForTick(i + 1) : chartArea.right;

      const left = i === 0 ? chartArea.left : (prev + xCenter) / 2;
      const right = i === months.length - 1 ? chartArea.right : (xCenter + next) / 2;

      ctx.fillStyle = fill;
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    }

    ctx.restore();
  }
};

const cumulativeOverlayPlugin = {
  id: "cumulativeOverlay",
  beforeDatasetsDraw(chart, args, opts){
    const { ctx, chartArea, scales } = chart;
    const x = scales.x;
    const y = scales.y;
    if (!x || !y) return;

    ctx.save();

    // 1) booking spans (subtiel voor alle boekingen)
    if (opts?.bookingSpans?.length){
      for (const s of opts.bookingSpans){
        const x1 = x.getPixelForValue(s.start);
        const x2 = x.getPixelForValue(s.end);

        // Afwisselend subtiele tint, owner iets sterker
        const baseAlpha = s.owner ? 0.14 : 0.07;
        const alt = (s.idx % 2 === 0) ? 1 : 0.75; // kleine variatie
        ctx.fillStyle = `rgba(255,255,255,${baseAlpha * alt})`;

        ctx.fillRect(
          Math.min(x1,x2),
          chartArea.top,
          Math.abs(x2 - x1),
          chartArea.bottom - chartArea.top
        );
      }
    }


    // 2) season lines + labels
    if (opts?.seasonLines?.length){
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.setLineDash([6,6]);
      ctx.lineWidth = 1;

      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "12px system-ui";

      for (const sl of opts.seasonLines){
        const px = x.getPixelForValue(sl.x);
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();

        // label vertically near top
        ctx.save();
        ctx.translate(px + 6, chartArea.top + 10);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(sl.label, 0, 0);
        ctx.restore();
      }

      ctx.setLineDash([]);
    }

    // 3) total label (top-right)
    if (typeof opts?.total === "number"){
      const text = `Totale omzet ${fmtEUR(opts.total)}`;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "700 13px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(text, chartArea.right, chartArea.top - 8);
    }

    ctx.restore();
  }
};



function renderCharts(rows){
  // 1) Omzet per maand (stacked per boeking)
  const revM = aggRevenueByMonth(rows);

  chartRevenueMonth = destroy(chartRevenueMonth);

  chartRevenueMonth = new Chart(ctxRevenueMonth, {
    type: "bar",
    data: { labels: revM.labels, datasets: revM.datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }, // anders veel te druk
        tooltip: {
          displayColors: false, // 👈 haalt het gekleurde blokje weg
          callbacks: {
            title: (items) => {
              // Titel = maand + jaar (zoals je al hebt)
              return items[0].label.replace(",", " ");
            },
            label: (ctx) => {
              const value = ctx.raw;
              if (!value) return null;

              const dateLabel = ctx.dataset.__dateLabel || ctx.dataset.label || "";
              const monthTotal = revM.monthTotals[ctx.dataIndex];

              return [
                fmtEUR(value),
                dateLabel,
                `Totaal maand: ${fmtEUR(monthTotal)}`
              ];
            }
          }
        },
        seasonBands: { months: revM.metaMonths }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 12 } }
        },
        y: {
          stacked: true,
          grid: {
            display: true,
            color: "rgba(255,255,255,.12)", // horizontale gridlines
            drawBorder: false
          }
        }
      }
    },
    plugins: [seasonBandsPlugin]
  });

  // 2) Boekingen & nachten per maand (dual bar chart)
  const bn = aggBookingsNightsByMonth(rows);
  chartBookingsNights = destroy(chartBookingsNights);

  chartBookingsNights = new Chart(ctxBookingsNights, {
    type: "bar",
    data: {
      labels: bn.labels,
      datasets: [
        {
          label: "Boekingen",
          data: bn.bookings,
          yAxisID: "yBookings",
          backgroundColor: "rgba(122,162,255,0.75)",
          borderColor: "rgba(255,255,255,.25)",
          borderWidth: 1,
          barPercentage: 0.45
        },
        {
          label: "Nachten",
          data: bn.nights,
          yAxisID: "yNights",
          backgroundColor: "rgba(255,110,150,0.75)",
          borderColor: "rgba(255,255,255,.25)",
          borderWidth: 1,
          barPercentage: 0.45
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: {
          grid: { display: false }
        },
        yBookings: {
          position: "left",
          title: {
            display: true,
            text: "Boekingen"
          },
          grid: {
            color: GRID_COLOR
          }
        },
        yNights: {
          position: "right",
          title: {
            display: true,
            text: "Nachten"
          },
          grid: {
            drawOnChartArea: false // 👈 voorkomt dubbele grid
          }
        }
      }
    }
  });

  // 3) Revenue per channel
  const rc = aggRevenueByChannel(rows);
  chartRevenueChannel = destroy(chartRevenueChannel);
  chartRevenueChannel = new Chart(ctxRevenueChannel, {
    type: "bar",
    data: {
      labels: rc.labels,
      datasets: [{ label: "Omzet", data: rc.values }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // 4) Guest pie
  const gp = aggGuestPie(rows);
  chartGuestPie = destroy(chartGuestPie);

  const total = gp.values.reduce((a,b)=> a+b, 0);

  // helper: gradient palette van blauw -> geel -> oranje
  function guestPalette(n){
    // gedempt: minder saturation & iets donkerder
    const startHue = 210; // blauw
    const endHue = 28;    // oranje
    const sat = 55;       // was 85 -> veel rustiger
    const light = 48;     // was 60 -> minder fel

    const hues = Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      return startHue + (endHue - startHue) * t;
    });

    return hues.map(h => `hsl(${h} ${sat}% ${light}%)`);
  }


  const colors = guestPalette(gp.labels.length);
  if (gp.labels[0] === "Eigen boeking") {
    colors[0] = "hsl(28, 94%, 49%)"; // warm, niet fel
  }


  chartGuestPie = new Chart(ctxGuestPie, {
    type: "pie",
    data: {
      labels: gp.labels.map(x => (x === "Eigen boeking" ? "Eigen boeking" : `${x} pers.`)),
      datasets: [{
        data: gp.values,
        backgroundColor: colors,
        borderColor: "rgba(255,255,255,.65)",
        borderWidth: 2
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },

        // ✅ Percentages op de chart
        datalabels: {
          color: "rgba(255,255,255,.85)",
          font: { weight: "800", size: 20 },
          formatter: (value) => {
            if (!total) return "";
            const pct = (value / total) * 100;
            return pct >= 4 ? `${pct.toFixed(0)}%` : ""; // kleine slices niet labelen
          }
        },

        tooltip: {
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "";
              const value = ctx.raw || 0;
              const pct = total ? ((value/total)*100) : 0;
              return `${label}: ${value} boekingen (${pct.toFixed(0)}%)`;
            }
          }
        }
      }
    },
    plugins: [ChartDataLabels]
  });

  // 5) Lead time histogram
  const lt = aggLeadTime(rows);
  chartLeadTime = destroy(chartLeadTime);

  chartLeadTime = new Chart(ctxLeadTime, {
    type: "bar",
    data: {
      labels: lt.labels,
      datasets: [{
        label: "Boekingen",
        data: lt.counts,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.22)",
        backgroundColor: "rgba(122,162,255,0.55)"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => `Lead time: ${items[0].label} dagen`,
            label: (ctx) => {
              const v = ctx.raw || 0;
              const pct = lt.total ? (v / lt.total) * 100 : 0;
              return `${v} boekingen (${pct.toFixed(0)}%)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: GRID_COLOR, drawBorder: false },
          ticks: { precision: 0 }
        }
      }
    }
  });

  // 6) Vrije nachten per week
  const fw = aggFreeNightsByWeek(rows);
  chartFreeWeeks = destroy(chartFreeWeeks);

  chartFreeWeeks = new Chart(ctxFreeWeeks, {
    type: "bar",
    data: {
      labels: fw.labels,
      datasets: [
        {
          label: "Bezet (nachten)",
          data: fw.booked,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,.20)",
          backgroundColor: "rgba(122,162,255,0.55)",
          stack: "s"
        },
        {
          label: "Vrij (nachten)",
          data: fw.free,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,.20)",
          backgroundColor: "rgba(255,138,42,0.35)",
          stack: "s"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => `Week: ${items[0].label}`,
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} / 7`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 7,
          ticks: { stepSize: 1 },
          grid: { color: GRID_COLOR, drawBorder: false }
        }
      }
    }
  });

  // 7) Gaps table
  renderGapsTable(rows);

  // 8) Cumulatieve omzet per boeking
  const cum = aggCumulativeRevenue(rows);
  chartCumulative = destroy(chartCumulative);

  chartCumulative = new Chart(ctxCumulative, {
    type: "line",
    data: {
      datasets: [
        // line (all points)
        {
          label: "Cumulatieve omzet",
          data: cum.points.map(p => ({ x: p.x, y: p.y })),
          borderWidth: 2,
          tension: 0,          // step-ish feel (we keep straight segments)
          stepped: "after", // sprong ipv schuine lijn
          pointRadius: 3,
          pointHoverRadius: 5
        },
        // owner points (orange)
        {
          label: "Huiseigenaar boeking",
          data: cum.points.filter(p => p.owner).map(p => ({ x: p.x, y: p.y, __bookingValue: p.bookingValue })),
          showLine: false,
          pointRadius: 7,
          pointHoverRadius: 9,
          pointBackgroundColor: "rgba(255,138,42,0.95)",
          pointBorderColor: "rgba(0,0,0,.35)",
          pointBorderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      parsing: false,
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => {
              // show date of the hovered point
              const xVal = items[0].raw.x;
              return fmtDateNL(new Date(xVal));
            },
            label: (ctx) => {
              const x = new Date(ctx.raw.x).getTime();
              const found = cum.points.find(p => p.x.getTime() === x);

              const bookingValue = found ? found.bookingValue : 0;
              const nights = found ? found.nights : 0;
              const cumulative = ctx.raw.y;

              return [
                `Boeking: ${fmtEUR(bookingValue)}`,
                `Nachten: ${nights}`,
                `Cumulatief: ${fmtEUR(cumulative)}`
              ];
            }
          }
        },
        cumulativeOverlay: {
          bookingSpans: cum.bookingSpans,
          seasonLines: cum.seasonLines,
          total: cum.total
        }
      },
      scales: {
        x: {
          type: "time",
          min: cum.minDate ? cum.minDate : undefined,  // ✅ force full range
          max: cum.maxDate ? cum.maxDate : undefined,
          time: { unit: "month" },
          grid: {
            display: true,                    // ✅ verticale gridlines aan
            color: "rgba(255,255,255,.10)",   // subtiel, matcht y-as
            drawBorder: false,
            lineWidth: 1
          },
          ticks: {
            autoSkip: false, // ✅ laat alle maanden zien
            callback: (value) => {
              const d = new Date(value);
              const monthNames = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
              return [monthNames[d.getMonth()], String(d.getFullYear())]; // ✅ multiline
            }
          }
        },

        y: {
          grid: { color: GRID_COLOR, drawBorder: false },
          ticks: {
            callback: (v) => {
              // nice € formatting on axis
              const n = Number(v);
              if (!Number.isFinite(n)) return v;
              return n.toLocaleString("nl-NL");
            }
          }
        }
      }
    },
    plugins: [cumulativeOverlayPlugin]
  });
}

function rerender(){
  if (!rawRows.length) return;
  renderKPIs(rawRows);
  renderCharts(rawRows);
  renderTable(rawRows);
  log(`Render: modus = ${mode === "net" ? "Netto" : "Bruto"}`);
}

// ========= Events =========
modeGrossBtn.addEventListener("click", () => {
  mode = "gross";
  modeGrossBtn.classList.add("seg__btn--active");
  modeNetBtn.classList.remove("seg__btn--active");
  rerender();
});
modeNetBtn.addEventListener("click", () => {
  mode = "net";
  modeNetBtn.classList.add("seg__btn--active");
  modeGrossBtn.classList.remove("seg__btn--active");
  rerender();
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  log(`Upload: ${file.name} (${Math.round(file.size/1024)} KB)`);

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!json.length){
      log("Geen rijen gevonden.");
      return;
    }

    // Normalize rows based on your fixed structure
    rawRows = normalizeRows(json);

    log(`Sheet: ${sheetName} — rijen ingelezen: ${rawRows.length}`);
    rerender();

  } catch (err) {
    console.error(err);
    log(`Fout: ${err?.message || String(err)}`);
  } finally {
    fileInput.value = ""; // allow same file re-upload
  }
});

// Chart download/share buttons actie
function getChartByCanvasId(canvasId){
  return Chart.getChart(canvasId) || null;
}

async function shareOrDownloadChartPNG(canvasId){
  const chart = getChartByCanvasId(canvasId);
  if (!chart) return;

  // PNG (transparant)
  const dataUrl = chart.toBase64Image("image/png", 1);

  // DataURL -> Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  const fileName = `${canvasId}-${new Date().toISOString().slice(0,10)}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  // ✅ iOS/Android share sheet (als ondersteund)
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share){
    try{
      await navigator.share({
        files: [file],
        title: "Gipfel Lodge grafiek",
        text: "Grafiek export (PNG)"
      });
      return; // klaar
    }catch(err){
      // user cancelled -> geen probleem, ga niet door naar fallback tenzij je dat wil
      return;
    }
  }

  // Fallback iOS (en desktop): open in new tab (iOS: daarna delen -> bewaar)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS){
    window.open(dataUrl, "_blank");
    return;
  }

  // Desktop fallback: download
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='download']");
  if (!btn) return;

  const target = btn.getAttribute("data-target");
  if (!target) return;

  // Belangrijk: dit gebeurt direct op click (user gesture) -> nodig voor iOS share sheet
  shareOrDownloadChartPNG(target);
});
