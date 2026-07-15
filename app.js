/* =========================================================
   app.js — AquaSmart  (White + Black + Color Elements)
   ========================================================= */
'use strict';

const S = {
  page:     'splash',
  loggedIn: false,        // 🔒 auth flag — set true only after correct credentials
  pumpOn:   true,
  pumpMode: 'manual',
  level:    72,
  runSec:   45 * 60 + 12,
  charts:   {},
  timers:   {},
};

const NOTIF_DATA = [
  { icon:'🪣', cls:'full',     title:'Tank Full',           msg:'Tank reached 90%. Pump stopped automatically.',     time:'2 min ago',  unread:true  },
  { icon:'⚙️', cls:'start',   title:'Pump Started',        msg:'Auto mode triggered at 25% water level.',           time:'38 min ago', unread:true  },
  { icon:'🚨', cls:'overflow', title:'Overflow Prevented',  msg:'Overflow valve triggered at 95%. Auto-stop.',       time:'2h ago',     unread:true  },
  { icon:'⚠️', cls:'dry',      title:'Dry Run Alert',       msg:'Pump ran dry — auto shutdown activated.',           time:'5h ago',     unread:false },
  { icon:'💧', cls:'low',      title:'Low Water Level',     msg:'Level dropped below 20% threshold.',                time:'Yesterday',  unread:false },
];

const CFG_DATA = {
  wifi:     { t:'📡 WiFi Network',      f:[{l:'SSID',        ty:'text',     p:'AquaNet_5G'},{l:'Password', ty:'password', p:'••••••••'}] },
  telegram: { t:'📨 Telegram Alerts',   f:[{l:'Bot Token',   ty:'text',     p:'1234567890:ABC...'},{l:'Chat ID', ty:'text', p:'-100123456789'}] },
  tank:     { t:'📏 Tank Height',       f:[{l:'Height (cm)', ty:'number',   p:'100'}] },
  levels:   { t:'⚖️ Level Thresholds',  f:[{l:'Min Level (%)',ty:'number',  p:'20'},{l:'Max Level (%)', ty:'number', p:'90'}] },
};

const CHART_DATA = {
  today: { labels:['6AM','8AM','10AM','12PM','2PM','4PM','Now'], data:[58,65,72,89,85,78,72], lbl:'Today — July 13', peak:'89%' },
  week:  { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],    data:[70,82,65,89,75,60,72], lbl:'July 7–13',       peak:'89%' },
  month: { labels:['W1','W2','W3','W4'],                          data:[68,75,82,72],           lbl:'July 2026',      peak:'82%' },
};

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  clock();
  ripple();
  swipe();
  addLiquidRipple();
  restoreSession();   // check saved JWT — skip login if already authenticated

  // Enter key submits login
  ['lg-email','lg-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
});

/* ── Clock + Date + Greeting ────────────────────────────── */
function clock() {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  function tick() {
    const d  = new Date();
    let h    = d.getHours();
    const m  = String(d.getMinutes()).padStart(2,'0');
    const am = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const t  = h + ':' + m;

    // Status bar clocks
    const sb = document.getElementById('sb-time');
    if (sb) sb.textContent = t;
    const sp = document.getElementById('sp-time');
    if (sp) sp.textContent = t;
    const ic = document.getElementById('is-clock');
    if (ic) ic.textContent = t + ' ' + am;

    // Date string — updates once on load (no need for per-second)
  }

  function updateDate() {
    const d     = new Date();
    const day   = DAYS[d.getDay()];
    const date  = d.getDate();
    const month = MONTHS[d.getMonth()];
    const year  = d.getFullYear();
    const hour  = d.getHours();

    // Greeting
    const greet = hour < 12 ? 'Good Morning 👋'
                : hour < 17 ? 'Good Afternoon 👋'
                :              'Good Evening 👋';
    const gEl = document.getElementById('d-greeting');
    if (gEl) gEl.textContent = greet;

    // Dashboard date strip
    const dateStr = `${day}, ${date} ${month} ${year}`;
    const dEl = document.getElementById('d-date-str');
    if (dEl) dEl.textContent = dateStr;

    // Today's Water Level card
    const twcDay  = document.getElementById('twc-day');
    const twcDate = document.getElementById('twc-date');
    if (twcDay)  twcDay.textContent  = day;
    if (twcDate) twcDate.textContent = `${date} ${month} ${year}`;
  }

  tick();
  updateDate();
  S.timers.clock = setInterval(tick, 1000);
}

/* ── Splash ring animation ──────────────────────────────── */
function splashRingAnim() {
  const ring  = document.getElementById('ring-fill');
  const pctEl = document.getElementById('ring-pct');
  // No longer used — new splash has SVG tank animation instead
}

/* ── Liquid Ripple on CTA button press ──────────────────── */
function addLiquidRipple() {
  // Make CTA button emit a real ripple from click position
  const cta = document.querySelector('.sp-cta-btn');
  if (!cta) return;
  cta.addEventListener('pointerdown', function(e) {
    const rect = this.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
    this.style.setProperty('--rx', x + '%');
    this.style.setProperty('--ry', y + '%');

    // Also create a physical DOM ripple bubble
    const rpl = document.createElement('span');
    const sz  = Math.max(rect.width, rect.height) * 2;
    rpl.style.cssText = `
      position:absolute;
      width:${sz}px; height:${sz}px;
      left:${e.clientX - rect.left - sz/2}px;
      top:${e.clientY - rect.top - sz/2}px;
      background:rgba(255,255,255,0.18);
      border-radius:50%;
      pointer-events:none;
      transform:scale(0);
      animation:lrpl 0.6s ease-out forwards;
    `;
    this.appendChild(rpl);
    rpl.addEventListener('animationend', () => rpl.remove());
  });
}


/* ── Navigation ─────────────────────────────────────────── */
/* ── Protected pages — require login ─────────────────────── */
const PROTECTED = ['dashboard','analytics','notifications','settings'];

function goTo(page) {
  // 🔒 Auth guard — block protected pages if not logged in
  if (PROTECTED.includes(page) && !S.loggedIn) {
    goTo('login');
    return;
  }

  // Destroy charts when LEAVING analytics — prevents canvas bleed into other pages
  if (S.page === 'analytics' && page !== 'analytics') {
    Object.keys(S.charts).forEach(k => {
      if (S.charts[k]) { S.charts[k].destroy(); S.charts[k] = null; }
    });
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  const el = document.getElementById('p-' + page);
  if (el) {
    el.classList.add('active');
    const sc = el.querySelector('.pscroll');
    if (sc) sc.scrollTop = 0;
  }

  // Hide tab bar on splash and login (public pages)
  const bar = document.getElementById('tab-bar');
  const publicPages = ['splash', 'login'];
  if (publicPages.includes(page)) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    const t = document.getElementById('tab-' + page);
    if (t) t.classList.add('active');
  }

  S.page = page;

  if (page === 'dashboard')     initDash();
  if (page === 'analytics')     initAnalytics();
  if (page === 'notifications') initNotifs();
}

/* ── Swipe to navigate ───────────────────────────────────── */
function swipe() {
  const sc = document.getElementById('screen');
  if (!sc) return;
  const pages = ['dashboard','analytics','notifications','settings'];
  let sx = 0, sy = 0;
  sc.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive:true });
  sc.addEventListener('touchend', e => {
    if (!pages.includes(S.page)) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 72 && Math.abs(dy) < 60) {
      const i = pages.indexOf(S.page);
      if (dx < 0 && i < pages.length-1) goTo(pages[i+1]);
      if (dx > 0 && i > 0)              goTo(pages[i-1]);
    }
  }, { passive:true });
}

/* ── Dashboard ──────────────────────────────────────────── */
function initDash() {
  // Fetch live data from backend first
  loadTankData();
  loadTodayLogs();

  setTimeout(() => {
    const pbar = document.getElementById('pbar-fill');
    if (pbar) pbar.style.width = S.level + '%';

    const water = document.getElementById('tv-water');
    if (water) water.style.height = S.level + '%';

    const tvlbl = document.getElementById('tv-label');
    if (tvlbl) tvlbl.textContent = Math.round(S.level) + '%';
  }, 80);

  clearInterval(S.timers.sim);
  S.timers.sim = setInterval(() => {
    S.level = Math.max(48, Math.min(93, S.level + (Math.random()-0.48)*0.7));
    const pct = Math.round(S.level);

    const dp = document.getElementById('d-pct');
    if (dp) dp.textContent = pct + '%';

    const pm = document.getElementById('pbar-mid');
    if (pm) pm.textContent = pct + '%';

    const pbar = document.getElementById('pbar-fill');
    if (pbar) pbar.style.width = pct + '%';

    const water = document.getElementById('tv-water');
    if (water) water.style.height = pct + '%';

    const tvlbl = document.getElementById('tv-label');
    if (tvlbl) tvlbl.textContent = pct + '%';

    const sh = document.getElementById('ssr-h');
    if (sh) sh.textContent = pct + ' cm';
  }, 5000);

  startPumpTimer();
}

/* ── Pump Sheet ──────────────────────────────────────────── */
function openSheet(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'pump-sheet') {
    const ring = document.getElementById('pump-ring');
    if (ring) ring.classList.toggle('off', !S.pumpOn);
    const tog = document.getElementById('pump-tog');
    if (tog) tog.checked = S.pumpOn;
  }
}

function closeSheet(id) {
  document.getElementById(id).classList.remove('open');
}

function sheetBg(e, id) {
  if (e.target === document.getElementById(id)) closeSheet(id);
}

function togglePump() {
  S.pumpOn = document.getElementById('pump-tog').checked;

  const ring  = document.getElementById('pump-ring');
  const lbl   = document.getElementById('pump-lbl');
  const sub   = document.getElementById('pump-sub');

  if (ring) ring.classList.toggle('off', !S.pumpOn);
  if (lbl)  lbl.textContent = S.pumpOn ? 'Pump is ON' : 'Pump is OFF';

  // Update dashboard badges
  ['d-pump-b','d-motor-b'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = S.pumpOn ? 'ON' : 'OFF';
    el.className   = S.pumpOn ? 'badge-green' : 'badge-grey';
  });

  if (S.pumpOn) {
    startPumpTimer();
    toast('✓ Pump turned ON');
  } else {
    clearInterval(S.timers.pump);
    if (sub) sub.textContent = 'Pump is off';
    toast('Pump turned OFF');
  }
}

function pumpMode(mode, btn) {
  S.pumpMode = mode;
  document.querySelectorAll('#pm-manual,#pm-auto').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function startPumpTimer() {
  clearInterval(S.timers.pump);
  if (!S.pumpOn) return;
  S.timers.pump = setInterval(() => {
    S.runSec++;
    const rt = document.getElementById('run-timer');
    if (rt) {
      const h = String(Math.floor(S.runSec/3600)).padStart(2,'0');
      const m = String(Math.floor(S.runSec%3600/60)).padStart(2,'0');
      const s = String(S.runSec%60).padStart(2,'0');
      rt.textContent = h+':'+m+':'+s;
    }
    const sub = document.getElementById('pump-sub');
    if (sub) {
      const mm = Math.floor(S.runSec/60), ss = S.runSec%60;
      sub.textContent = `Running for ${mm} min ${String(ss).padStart(2,'0')} sec`;
    }
  }, 1000);
}

/* ── Analytics ──────────────────────────────────────────── */

// Rich data for each period
const AN_DATA = {
  today: {
    periodLabel: 'Today',
    chartLabel:  'Hourly — ',
    labels:      ['4am','5am','6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','Now'],
    level:       [88,85,83,78,72,68,70,75,72,68,65,67,68],
    consumed:    [0,3,2,5,6,4,0,0,3,4,3,0,0],
    pumpRun:     '1.8h',
    conLabel:    'Hourly Usage (Litres)',
  },
  week: {
    periodLabel: 'This Week',
    chartLabel:  'Daily — ',
    labels:      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    level:       [72,80,68,89,75,60,72],
    consumed:    [145,132,178,121,156,143,130],
    pumpRun:     '14.2h',
    conLabel:    'Daily Usage (Litres)',
  },
  month: {
    periodLabel: 'This Month',
    chartLabel:  'Weekly — ',
    labels:      ['Wk 1','Wk 2','Wk 3','Wk 4'],
    level:       [70,85,68,72],
    consumed:    [980,850,1120,920],
    pumpRun:     '52.6h',
    conLabel:    'Weekly Usage (Litres)',
  },
};

function initAnalytics() {
  // Set today's date in period label
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('an-period-date').textContent =
    d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();

  // Set date input max to today
  const di = document.getElementById('an-date-input');
  if (di) di.max = d.toISOString().slice(0,10);

  segClick(document.getElementById('seg-today'), 'today');
}

function segClick(btn, period) {
  // Highlight active tab
  document.querySelectorAll('.an-seg .seg').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide date picker
  const dp = document.getElementById('an-date-pick');
  if (period === 'date') {
    if (dp) dp.style.display = 'flex';
    // Load data for selected date (use today's data as demo)
    const di = document.getElementById('an-date-input');
    const dateVal = di && di.value ? di.value : new Date().toISOString().slice(0,10);
    const d = new Date(dateVal);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    document.getElementById('an-period-lbl').innerHTML =
      days[d.getDay()] + ' — <span id="an-period-date">' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + '</span>';
    buildAnalyticsCharts('today');
    return;
  }
  if (dp) dp.style.display = 'none';

  const p = AN_DATA[period];
  if (!p) return;

  // Period label
  const d = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let dateTxt = d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  if (period === 'week') {
    const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    dateTxt = mon.getDate() + ' – ' + sun.getDate() + ' ' + months[d.getMonth()];
  } else if (period === 'month') {
    dateTxt = months[d.getMonth()] + ' ' + d.getFullYear();
  }
  document.getElementById('an-period-lbl').innerHTML =
    p.periodLabel + ' — <span id="an-period-date">' + dateTxt + '</span>';

  buildAnalyticsCharts(period);
}

function buildAnalyticsCharts(period) {
  const p = AN_DATA[period] || AN_DATA.today;

  // Stats
  const maxLvl = Math.max(...p.level);
  const minLvl = Math.min(...p.level);
  const totalConsumed = p.consumed.reduce((a,b) => a+b, 0);

  const elMax = document.getElementById('an-max');
  const elMin = document.getElementById('an-min');
  const elPump = document.getElementById('an-pump');
  const elCon  = document.getElementById('an-consumed');
  const elPeak = document.getElementById('chart-peak');
  const elConLbl = document.getElementById('con-lbl');

  if (elMax)  elMax.textContent  = maxLvl + '%';
  if (elMin)  elMin.textContent  = minLvl + '%';
  if (elPump) elPump.textContent = p.pumpRun;
  if (elCon)  elCon.textContent  = totalConsumed + 'L';
  if (elPeak) elPeak.textContent = maxLvl + '%';
  if (elConLbl) elConLbl.textContent = p.conLabel;

  buildMainChart(p);
  buildConChart(p);
}

function buildMainChart(p) {
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  if (S.charts.main) { S.charts.main.destroy(); S.charts.main = null; }

  const g  = ctx.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 200);
  gr.addColorStop(0,   'rgba(0,122,255,0.3)');
  gr.addColorStop(0.6, 'rgba(0,122,255,0.08)');
  gr.addColorStop(1,   'rgba(0,122,255,0)');

  // Mark pump-on zones (levels increasing)
  const pointColors = p.level.map((v,i) =>
    i > 0 && p.level[i] > p.level[i-1] ? '#34C759' : '#007AFF'
  );

  S.charts.main = new Chart(ctx, {
    type: 'line',
    data: {
      labels: p.labels,
      datasets: [{
        label: 'Water Level',
        data: p.level,
        borderColor: '#007AFF',
        borderWidth: 2.5,
        fill: true,
        backgroundColor: gr,
        tension: 0.4,
        pointBackgroundColor: pointColors,
        pointBorderColor: 'white',
        pointBorderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointHoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      animation: { duration:600, easing:'easeInOutQuart' },
      plugins: {
        legend: { display:false },
        tooltip: {
          backgroundColor: 'rgba(28,28,30,0.92)',
          borderColor: 'rgba(0,122,255,0.3)',
          borderWidth: 1,
          titleColor: 'rgba(255,255,255,0.55)',
          bodyColor: '#fff',
          padding: 14, cornerRadius: 14,
          callbacks: {
            label: c => '  💧 Level: ' + c.parsed.y + '%',
            afterLabel: (c) => {
              const used = p.consumed[c.dataIndex] || 0;
              return used > 0 ? '  🚿 Used: ' + used + 'L' : '';
            },
          },
        },
        annotation: {},
      },
      scales: {
        x: {
          grid: { color:'rgba(0,0,0,0.05)', drawBorder:false },
          ticks: { color:'#8e8e93', font:{ size:10, family:'Inter' }, maxRotation:0 },
          border: { display:false },
        },
        y: {
          min: 0, max: 100,
          grid: { color:'rgba(0,0,0,0.06)', drawBorder:false },
          ticks: { color:'#8e8e93', font:{ size:10, family:'Inter' }, stepSize:20, callback: v => v+'%' },
          border: { display:false },
        },
      },
    },
  });
}

function buildConChart(p) {
  const ctx = document.getElementById('conChart');
  if (!ctx) return;
  if (S.charts.con) { S.charts.con.destroy(); S.charts.con = null; }

  const colors = p.consumed.map(v =>
    v > 150 ? 'rgba(255,59,48,0.75)' :
    v > 100 ? 'rgba(255,149,0,0.75)' :
              'rgba(88,86,214,0.7)'
  );

  S.charts.con = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: p.labels,
      datasets: [{
        label: 'Water Used',
        data: p.consumed,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7','1').replace('0.75','1')),
        borderWidth: 1,
        borderRadius: 10,
        borderSkipped: false,
        hoverBackgroundColor: colors.map(c => c.replace('0.7','0.9').replace('0.75','0.9')),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration:600, easing:'easeInOutQuart' },
      plugins: {
        legend: { display:false },
        tooltip: {
          backgroundColor: 'rgba(28,28,30,0.92)',
          borderColor: 'rgba(88,86,214,0.3)',
          borderWidth: 1,
          titleColor: 'rgba(255,255,255,0.55)',
          bodyColor: '#fff',
          padding: 14, cornerRadius: 14,
          callbacks: {
            label: c => '  🚿 Consumed: ' + c.parsed.y + 'L',
          },
        },
      },
      scales: {
        x: {
          grid: { display:false },
          ticks: { color:'#8e8e93', font:{ size:10, family:'Inter' }, maxRotation:0 },
          border: { display:false },
        },
        y: {
          grid: { color:'rgba(0,0,0,0.06)', drawBorder:false },
          ticks: { color:'#8e8e93', font:{ size:10, family:'Inter' }, callback: v => v+'L' },
          border: { display:false },
        },
      },
    },
  });
}

/* ── Today's Water Level — bar tap detail ───────────────── */
function showBarDetail(col, time, level, used) {
  // Highlight tapped bar
  document.querySelectorAll('#twc-bars .twc-bar-col').forEach(c => c.classList.remove('twc-bar-active'));
  col.classList.add('twc-bar-active');

  const tt    = document.getElementById('twc-tooltip');
  const tTime = document.getElementById('twct-time');
  const tVal  = document.getElementById('twct-val');
  const tUsed = document.getElementById('twct-used');

  if (!tt) return;
  if (tTime) tTime.textContent = time;
  if (tVal)  tVal.textContent  = level;
  if (tUsed) tUsed.textContent = used;
  tt.style.display = 'flex';
}

/* old segClick alias */
function buildMain(period) { buildAnalyticsCharts(period); }


/* ── Notifications ──────────────────────────────────────── */
function initNotifs() {
  const list = document.getElementById('notif-list');
  if (!list || list.children.length) return;

  NOTIF_DATA.forEach((n, i) => {
    const div = document.createElement('div');
    div.className = 'notif-card';
    div.style.animationDelay = (i * 0.06) + 's';
    div.innerHTML = `
      <div class="ni-ic ${n.cls}">${n.icon}</div>
      <div class="ni-body">
        <div class="ni-title">${n.title}</div>
        <div class="ni-msg">${n.msg}</div>
      </div>
      <div class="ni-r">
        <div class="ni-time">${n.time}</div>
        ${n.unread ? '<div class="ni-dot"></div>' : ''}
      </div>
    `;
    div.addEventListener('click', () => {
      div.querySelector('.ni-dot')?.remove();
      n.unread = false;
      updateBadge();
    });
    list.appendChild(div);
  });
  updateBadge();
}

function updateBadge() {
  const count = NOTIF_DATA.filter(n => n.unread).length;
  const badge = document.getElementById('tab-badge');
  const lbl   = document.getElementById('notif-count');
  if (badge) { badge.textContent = count; badge.style.display = count ? 'flex' : 'none'; }
  if (lbl)   lbl.textContent = count ? count + ' unread' : 'All caught up';
}

function clearAllNotifs() {
  NOTIF_DATA.forEach(n => n.unread = false);
  document.querySelectorAll('.ni-dot').forEach(d => d.remove());
  updateBadge();
  toast('✓ All alerts cleared');
}

/* ── Config Sheet ───────────────────────────────────────── */
function openCfg(key) {
  const c = CFG_DATA[key];
  if (!c) return;
  document.getElementById('cfg-title').textContent = c.t;
  document.getElementById('cfg-body').innerHTML = c.f.map(f =>
    `<div class="cfg-field"><label>${f.l}</label><input type="${f.ty}" placeholder="${f.p}"/></div>`
  ).join('');
  openSheet('cfg-sheet');
}

function saveCfg() {
  closeSheet('cfg-sheet');
  toast('✓ Settings saved');
}

/* ── Logout ─────────────────────────────────────────────── */
function doLogout() {
  if (!confirm('Sign out from AquaSmart?')) return;
  Object.values(S.timers).forEach(id => clearInterval(id));
  S.timers = {};
  Object.values(S.charts).forEach(c => c?.destroy());
  S.charts = {};
  document.getElementById('notif-list').innerHTML = '';
  goTo('splash');
}

/* ── Toast ──────────────────────────────────────────────── */
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(S.timers.toast);
  S.timers.toast = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ── Ripple ─────────────────────────────────────────────── */
function ripple() {
  document.addEventListener('click', e => {
    const el = e.target.closest(
      '.tab,.tab-fab,.qa-card,.list-row,.seg,.notif-card,.btn-primary,.btn-outline,.sheet-close,.clear-all-btn'
    );
    if (!el) return;
    const r  = document.createElement('span');
    r.className = 'rpl';
    const rc = el.getBoundingClientRect();
    const sz = Math.max(rc.width, rc.height);
    r.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-rc.left-sz/2}px;top:${e.clientY-rc.top-sz/2}px`;
    if (!el.style.position || el.style.position==='static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}

/* ── Keyboard nav ───────────────────────────────────────── */
const NAV = ['dashboard','analytics','notifications','settings'];
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.sheet-overlay.open').forEach(s => s.classList.remove('open'));
    return;
  }
  if (!NAV.includes(S.page)) return;
  const i = NAV.indexOf(S.page);
  if (e.key==='ArrowRight' && i<NAV.length-1) goTo(NAV[i+1]);
  if (e.key==='ArrowLeft'  && i>0)            goTo(NAV[i-1]);
});

console.log('%cAquaSmart 💧', 'color:#007AFF;font-size:14px;font-weight:800;background:#f0f8ff;padding:4px 10px;border-radius:6px;');

/* ═══════════════════════════════════════════════════════════
   BACKEND API — real fetch calls to Express server
   ═══════════════════════════════════════════════════════════ */

const API = window.location.origin + '/api';

// ── Token helpers ─────────────────────────────────────────────
function getToken()       { return localStorage.getItem('aqToken'); }
function setToken(t)      { localStorage.setItem('aqToken', t); }
function clearToken()     { localStorage.removeItem('aqToken'); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  return res.json();
}

// ── Restore session on page load ──────────────────────────────
async function restoreSession() {
  const token = getToken();
  if (!token) return;
  try {
    const data = await apiFetch('/auth/me');
    if (data.ok) {
      S.loggedIn = true;
      // Already logged in — go straight to dashboard
      if (S.page === 'splash' || S.page === 'login') goTo('dashboard');
    } else {
      clearToken();
    }
  } catch { clearToken(); }
}

// ── Login ─────────────────────────────────────────────────────
async function doLogin() {
  const btn    = document.getElementById('lg-signin');
  const text   = document.getElementById('lg-btn-text');
  const email  = document.getElementById('lg-email');
  const pass   = document.getElementById('lg-pass');
  if (!btn || !text || !email || !pass) return;

  const errEl = document.getElementById('lg-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  const emailVal = email.value.trim();
  const passVal  = pass.value;

  if (!emailVal) { showLoginError('Please enter your email address.'); return; }
  if (!passVal)  { showLoginError('Please enter your password.');      return; }

  btn.classList.add('loading');
  text.textContent = 'Signing in…';
  btn.disabled = true;

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ email: emailVal, password: passVal }),
    });

    btn.classList.remove('loading');
    btn.disabled = false;
    text.textContent = 'Sign In';

    if (data.ok) {
      setToken(data.token);
      S.loggedIn = true;
      email.value = '';
      pass.value  = '';
      goTo('dashboard');
    } else {
      showLoginError(data.error || 'Incorrect email or password.');
      pass.value = '';
    }
  } catch (err) {
    btn.classList.remove('loading');
    btn.disabled = false;
    text.textContent = 'Sign In';
    showLoginError('Cannot connect to server. Make sure server is running.');
  }
}

// ── Show login error ──────────────────────────────────────────
function showLoginError(msg) {
  const errEl = document.getElementById('lg-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.style.display = 'block';
  // Auto-hide after 4s
  clearTimeout(showLoginError._t);
  showLoginError._t = setTimeout(() => { errEl.style.display = 'none'; }, 4000);
}

// ── Toggle password visibility ────────────────────────────────
function togglePass() {
  const inp  = document.getElementById('lg-pass');
  const icon = document.getElementById('lg-eye-icon');
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  if (icon) icon.style.opacity = isHidden ? '1' : '0.4';
}

// ── Logout ────────────────────────────────────────────────────
async function doLogout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
  clearToken();
  S.loggedIn = false;
  goTo('splash');
}

// ── Load tank data from backend ───────────────────────────────
async function loadTankData() {
  try {
    const data = await apiFetch('/tank/status');
    if (!data.ok) return;
    const t = data.tank;
    const levelPct   = Math.round(t.level_pct);
    const levelL     = Math.round(t.level_liters);
    const capacity   = Math.round(t.capacity);
    const remaining  = capacity - levelL;   // correct: capacity minus current
    const heightCm   = Math.round(levelPct);  // proportional to tank height
    S.level = levelPct;

    // Update all display elements
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    set('d-pct',         levelPct + '%');
    set('lc-sub',        levelL + ' of ' + capacity + ' Litres');
    set('pbar-mid',      levelPct + '%');
    set('tv-label',      levelPct + '%');
    set('ssr-h',         heightCm + ' cm');
    set('ssr-temp',      t.temp_c + '°C');
    set('ssr-remaining', remaining + ' L');
    set('twc-current',   levelL + ' L');
    set('twc-remaining', remaining + ' L');
    set('an-max',        levelPct + '%');

    // Progress bar
    const pbar = document.getElementById('pbar-fill');
    if (pbar) pbar.style.width = levelPct + '%';
    // Tank water visual
    const water = document.getElementById('tv-water');
    if (water) water.style.height = levelPct + '%';
    // Splash glass card
    const sstat = document.querySelector('.sgc-stat');
    if (sstat) sstat.innerHTML = levelL + ' <span class="sgc-unit">L</span>';
  } catch(e) { console.warn('Tank data fetch failed:', e.message); }
}

// ── Load today's water logs ───────────────────────────────────
async function loadTodayLogs() {
  try {
    const data = await apiFetch('/tank/logs?range=today');
    if (!data.ok || !data.logs || !data.logs.length) {
      // Fall back to 0 if no logs
      const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
      set('ssr-used',  '0 L');
      set('twc-used',  '0 L');
      return;
    }
    const logs = data.logs;
    // usedToday = first reading of day minus current (water consumed = drop in level)
    const firstL   = logs[0].level_liters;
    const currentL = logs[logs.length-1].level_liters;
    const usedToday = Math.max(0, Math.round(firstL - currentL));
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    set('ssr-used',  usedToday + ' L');
    set('twc-used',  usedToday + ' L');
  } catch(e) { console.warn('Logs fetch failed:', e.message); }
}

// ── Pump toggle (real API) ────────────────────────────────────
async function togglePump(on) {
  try {
    const data = await apiFetch('/pump/toggle', {
      method: 'POST',
      body:   JSON.stringify({ on }),
    });
    if (data.ok) {
      S.pumpOn = data.pump_on;
      const badge = document.getElementById('d-pump-b');
      if (badge) {
        badge.textContent = data.pump_on ? 'ON' : 'OFF';
        badge.className   = data.pump_on ? 'badge-green' : 'badge-red';
      }
    }
  } catch { console.warn('Pump toggle failed'); }
}

function showLoginError(msg) {
  const el = document.getElementById('lg-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'flex';
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function togglePass() {
  const inp  = document.getElementById('lg-pass');
  const icon = document.getElementById('lg-eye-icon');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (icon) {
    icon.innerHTML = show
      ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/><circle cx="12" cy="12" r="3"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}
