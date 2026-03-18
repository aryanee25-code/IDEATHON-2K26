'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router  = express.Router();

router.get('/export', requireAdmin, (req, res) => {
  const data = {
    parcels:       db.prepare(`SELECT * FROM parcels`).all(),
    deliveries:    db.prepare(`SELECT * FROM deliveries`).all(),
    return_requests: db.prepare(`SELECT * FROM return_requests`).all(),
    status_history: db.prepare(`SELECT * FROM status_history`).all(),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="export.json"');
  res.json(data);
});

router.get('/users', requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT id,username,role,name,created_at FROM users`).all());
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role || !name)
    return res.status(400).json({ error: 'All fields required' });
  if (!['admin','worker','driver'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  try {
    const info = db.prepare(`INSERT INTO users (username,password,role,name) VALUES (?,?,?,?)`)
      .run(username, bcrypt.hashSync(password, 10), role, name);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Username already exists' });
  }
});

module.exports = router;
