/**
 * AquaSmart Backend — server.js
 * Express + JSON file storage + bcryptjs + JWT
 * Pure JavaScript — no native modules, works on any Node version
 */
'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET  = 'aquasmart_secret_key_change_in_prod';
const JWT_EXPIRES = '7d';

/* ─── JSON File Database ────────────────────────────────────────────────── */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_FILE = path.join(DATA_DIR, 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return null; }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Initialize DB if missing
let db = loadDB();
if (!db) {
  const adminHash = bcrypt.hashSync('aqua@1234', 10);
  const now = new Date().toISOString();

  db = {
    users: [
      { id: 1, name: 'Admin', email: 'admin@aquasmart.com',
        password: adminHash, role: 'owner', created_at: now, last_login: null }
    ],
    sessions: [],          // { id, user_id, token_ref, expires_at, revoked }
    tank: {
      level_pct:    72,
      level_liters: 720,
      capacity:     1000,
      temp_c:       28,
      pump_on:      false,
      pump_mode:    'manual',
      updated_at:   now
    },
    logs: []               // { level_pct, level_liters, used_liters, logged_at }
  };

  // Seed some hourly logs for today
  for (let h = 0; h <= 12; h++) {
    const t = new Date(Date.now() - (12 - h) * 3600000);
    const lvl = Math.round(88 - h * 1.5);
    db.logs.push({
      level_pct:    lvl,
      level_liters: Math.round(lvl * 10),
      used_liters:  h === 0 ? 0 : 15,
      logged_at:    t.toISOString()
    });
  }

  saveDB(db);
  console.log('✅ Database initialised → admin@aquasmart.com / aqua@1234');
}

let nextSessionId = (db.sessions.length ? Math.max(...db.sessions.map(s => s.id)) : 0) + 1;

/* ─── Middleware ────────────────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* ─── Auth Guard ────────────────────────────────────────────────────────── */
function requireAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    const payload = jwt.verify(h.split(' ')[1], JWT_SECRET);
    db = loadDB();
    const sess = db.sessions.find(s => s.user_id === payload.id && !s.revoked);
    if (!sess) return res.status(401).json({ ok: false, error: 'Session expired' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
}

/* ─── AUTH ──────────────────────────────────────────────────────────────── */
app.post('/api/auth/login', (req, res) => {
  db = loadDB();
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ ok: false, error: 'Email and password required' });

  const user = db.users.find(u => u.email === email.trim().toLowerCase());
  const valid = user && bcrypt.compareSync(password, user.password);
  if (!valid)
    return res.status(401).json({ ok: false, error: 'Incorrect email or password' });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET, { expiresIn: JWT_EXPIRES }
  );

  db.sessions.push({
    id: nextSessionId++,
    user_id: user.id,
    token_ref: token.slice(-32),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    revoked: false
  });
  user.last_login = new Date().toISOString();
  saveDB(db);

  res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  db = loadDB();
  db.sessions.forEach(s => { if (s.user_id === req.user.id) s.revoked = true; });
  saveDB(db);
  res.json({ ok: true, message: 'Logged out' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

/* ─── TANK ──────────────────────────────────────────────────────────────── */
app.get('/api/tank/status', requireAuth, (req, res) => {
  db = loadDB();
  res.json({ ok: true, tank: db.tank });
});

app.patch('/api/tank/status', requireAuth, (req, res) => {
  db = loadDB();
  const body = req.body || {};
  if (body.level_pct    !== undefined) db.tank.level_pct    = +body.level_pct;
  if (body.level_liters !== undefined) db.tank.level_liters = +body.level_liters;
  if (body.capacity     !== undefined) db.tank.capacity     = +body.capacity;
  if (body.temp_c       !== undefined) db.tank.temp_c       = +body.temp_c;
  if (body.pump_on      !== undefined) db.tank.pump_on      = !!body.pump_on;
  if (body.pump_mode    !== undefined) db.tank.pump_mode    = body.pump_mode;
  db.tank.updated_at = new Date().toISOString();

  // Auto-log reading
  db.logs.push({
    level_pct:    db.tank.level_pct,
    level_liters: db.tank.level_liters,
    used_liters:  0,
    logged_at:    db.tank.updated_at
  });
  saveDB(db);
  res.json({ ok: true, tank: db.tank });
});

/* ─── PUMP ──────────────────────────────────────────────────────────────── */
app.post('/api/pump/toggle', requireAuth, (req, res) => {
  db = loadDB();
  const newState = req.body.on !== undefined ? !!req.body.on : !db.tank.pump_on;
  db.tank.pump_on = newState;
  db.tank.updated_at = new Date().toISOString();
  saveDB(db);
  res.json({ ok: true, pump_on: newState });
});

/* ─── LOGS ──────────────────────────────────────────────────────────────── */
app.get('/api/tank/logs', requireAuth, (req, res) => {
  db = loadDB();
  const range = req.query.range || 'today';
  const now = Date.now();
  const cutoffs = {
    today: now - 24 * 3600000,
    week:  now - 7  * 86400000,
    month: now - 30 * 86400000
  };
  const cutoff = cutoffs[range] || cutoffs.today;
  const logs = db.logs
    .filter(l => new Date(l.logged_at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  res.json({ ok: true, logs });
});

/* ─── USERS ──────────────────────────────────────────────────────────────── */
app.get('/api/users', requireAuth, (req, res) => {
  if (req.user.role !== 'owner')
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  db = loadDB();
  res.json({ ok: true, users: db.users.map(u => ({ ...u, password: undefined })) });
});

app.patch('/api/users/password', requireAuth, (req, res) => {
  db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!bcrypt.compareSync(req.body.currentPassword || '', user.password))
    return res.status(401).json({ ok: false, error: 'Wrong current password' });
  user.password = bcrypt.hashSync(req.body.newPassword, 10);
  db.sessions.forEach(s => { if (s.user_id === user.id) s.revoked = true; });
  saveDB(db);
  res.json({ ok: true, message: 'Password changed. Please log in again.' });
});

/* ─── Serve frontend ────────────────────────────────────────────────────── */
app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log('\n🚀 AquaSmart Server → http://localhost:' + PORT);
  console.log('🔐 Login: admin@aquasmart.com  |  aqua@1234');
  console.log('📦 Storage: ' + DB_FILE + '\n');
});
