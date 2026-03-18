'use strict';
require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors       = require('cors');
const path       = require('path');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..') }),
  secret: process.env.SESSION_SECRET || 'campus-logistics-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

/* ── Routes ─────────────────────────────────────────────────────────────── */
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/parcels',       require('./routes/parcels'));
app.use('/api/dispatch',      require('./routes/dispatch'));
app.use('/api/delivery',      require('./routes/delivery'));
app.use('/api/returns',       require('./routes/returns'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));

/* ── Frontend ───────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅  Campus Logistics running on http://localhost:${PORT}`));
