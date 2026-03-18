# Smart Campus Logistics — Jote Hub

A full-stack parcel management system for campus logistics hubs.  
Frontend: plain HTML/CSS/JS — Backend: Node.js + Express + SQLite.

---

## Project Structure

```
campus-logistics/
├── backend/
│   ├── server.js              # Express entry point
│   ├── db.js                  # SQLite schema + helpers (better-sqlite3)
│   ├── middleware/
│   │   └── auth.js            # requireAuth / requireAdmin
│   └── routes/
│       ├── auth.js            # POST /api/auth/login|logout, GET /api/auth/me
│       ├── parcels.js         # CRUD + sort + override
│       ├── dispatch.js        # Dispatch runs
│       ├── delivery.js        # Confirm delivery + OTP
│       ├── notifications.js   # List + clear
│       └── admin.js           # Export JSON, manage users
├── public/
│   └── index.html             # Frontend SPA
├── package.json
├── .env.example               # Copy to .env and edit
└── README.md
```

---

## Quick Start (local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum change SESSION_SECRET

# 3. Start the server
npm start
# → http://localhost:3000
```

Default credentials (created on first run):

| Username | Password  | Role   |
|----------|-----------|--------|
| admin    | admin123  | Admin  |
| worker1  | work123   | Worker |
| worker2  | work456   | Worker |

**Change these passwords after first login in production!**

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | `{username, password}` → session cookie |
| POST | `/api/auth/logout` | Destroy session |
| GET  | `/api/auth/me` | Current user |

### Parcels
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/parcels` | All parcels with history |
| GET    | `/api/parcels/stats` | Dashboard counts |
| GET    | `/api/parcels/search?q=` | Search by tracking ID / name / destination |
| POST   | `/api/parcels` | Receive new parcel |
| POST   | `/api/parcels/:id/sort` | Mark arrived → sorted |
| PATCH  | `/api/parcels/:id/status` | Update status with note |
| PATCH  | `/api/parcels/:id/override` | Admin override with reason |

### Dispatch
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dispatch` | Dispatch sorted parcels |
| GET  | `/api/dispatch` | List all delivery runs |

### Delivery
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/delivery/confirm/:parcelId` | Mark dispatched → delivered |
| POST | `/api/delivery/otp/generate` | Generate 4-digit OTP |
| POST | `/api/delivery/otp/verify` | Verify OTP + deliver |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/notifications` | Latest 60 notifications |
| DELETE | `/api/notifications` | Clear all |

### Admin (admin role required)
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/admin/export` | Download full JSON export |
| GET  | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create user |

---

## Deployment

### Option A — Railway / Render / Fly.io

1. Push this folder to a GitHub repo
2. Connect the repo to Railway/Render
3. Set environment variables:
   - `SESSION_SECRET` = long random string
   - `NODE_ENV` = production
   - `PORT` = (set automatically by platform, or 3000)
4. The platform runs `npm start`

### Option B — VPS (Ubuntu/Debian) with PM2 + Nginx

```bash
# On your server
git clone <your-repo> /var/www/campus-logistics
cd /var/www/campus-logistics
npm install --production

# Copy and edit .env
cp .env.example .env
nano .env

# Install PM2
npm install -g pm2
pm2 start backend/server.js --name campus-logistics
pm2 save
pm2 startup

# Nginx reverse proxy (example)
# /etc/nginx/sites-available/campus-logistics
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then enable HTTPS with Certbot:
```bash
sudo certbot --nginx -d your-domain.com
```

### Option C — Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "backend/server.js"]
```

```bash
docker build -t campus-logistics .
docker run -d -p 3000:3000 \
  -e SESSION_SECRET=your-secret \
  -e NODE_ENV=production \
  -v $(pwd)/data:/app \
  campus-logistics
```

---

## Security Checklist (before going live)

- [ ] Change all default passwords
- [ ] Set a strong `SESSION_SECRET` in `.env`
- [ ] Enable HTTPS (Certbot / platform TLS)
- [ ] Set `NODE_ENV=production`
- [ ] Back up the SQLite database file regularly
- [ ] Remove demo OTP from response body and wire up real SMS (Twilio, MSG91, etc.)

---

## Database

The app uses a single SQLite file (`campus-logistics.db`) created automatically on first run.  
Back it up by simply copying the file. For high traffic, a PostgreSQL migration is straightforward — all queries use standard SQL via `better-sqlite3`.
