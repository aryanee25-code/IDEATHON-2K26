'use strict';
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'campus-logistics.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL CHECK(role IN ('admin','worker','driver')),
    name        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS parcels (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_id    TEXT    NOT NULL UNIQUE,
    courier_name   TEXT    NOT NULL,
    source         TEXT    NOT NULL DEFAULT 'Itanagar',
    destination    TEXT    NOT NULL,
    recipient_name TEXT,
    phone          TEXT,
    weight_kg      TEXT,
    notes          TEXT    DEFAULT '',
    status         TEXT    NOT NULL DEFAULT 'arrived'
                           CHECK(status IN ('arrived','sorted','dispatched','delivered','return_requested','returned')),
    driver         TEXT,
    vehicle        TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    created_by     INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS status_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parcel_id   INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    status      TEXT    NOT NULL,
    note        TEXT    NOT NULL DEFAULT '',
    changed_by  INTEGER REFERENCES users(id),
    actor_label TEXT    DEFAULT '',
    time        INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS deliveries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id   TEXT    NOT NULL UNIQUE,
    driver_name   TEXT    NOT NULL,
    vehicle       TEXT    NOT NULL,
    notes         TEXT    DEFAULT '',
    dispatch_time INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    created_by    INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS delivery_parcels (
    delivery_id  INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    parcel_id    INTEGER NOT NULL REFERENCES parcels(id),
    PRIMARY KEY (delivery_id, parcel_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL DEFAULT 'info'
                       CHECK(type IN ('info','success','warn','danger')),
    text       TEXT    NOT NULL,
    time       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    user_id    INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS otps (
    tracking_id  TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    expires_at   INTEGER NOT NULL,
    PRIMARY KEY (tracking_id)
  );

  CREATE TABLE IF NOT EXISTS return_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    parcel_id    INTEGER NOT NULL REFERENCES parcels(id),
    tracking_id  TEXT    NOT NULL,
    reason       TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','approved','rejected','picked_up')),
    requested_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    resolved_at  INTEGER,
    resolved_by  INTEGER REFERENCES users(id),
    notes        TEXT    DEFAULT ''
  );
`);

/* ── Seed default users ─────────────────────────────────────────────────── */
const seedUsers = [
  { username:'admin',   password:'admin123', role:'admin',  name:'Administrator' },
  { username:'worker1', password:'work123',  role:'worker', name:'Worker One'    },
  { username:'worker2', password:'work456',  role:'worker', name:'Worker Two'    },
  { username:'driver1', password:'drive123', role:'driver', name:'Driver One'    },
];
const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (username,password,role,name) VALUES (?,?,?,?)`
);
for (const u of seedUsers) {
  insertUser.run(u.username, bcrypt.hashSync(u.password, 10), u.role, u.name);
}

module.exports = db;
