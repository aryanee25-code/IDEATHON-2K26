'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM notifications ORDER BY time DESC LIMIT 60`).all());
});

router.delete('/', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM notifications`).run();
  res.json({ ok: true });
});

module.exports = router;
