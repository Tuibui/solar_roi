# Solar ROI Calculator — Deployment Guide

---

## Prerequisites

- Python 3.10+ (3.12 recommended)
- pip
- PostgreSQL 14+ (for production)
- A Linux server or PaaS (Render, Railway, Heroku, VPS)
- A Google Maps API key with these APIs enabled:
  - Maps JavaScript API
  - Places API
  - Map Tiles API (for Photorealistic 3D Tiles)

---

## Local Development Setup

```bash
# 1. Clone repo
git clone <your-repo-url>
cd solar_roi/src/cesium-local

# 2. Create virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate   # Windows: backend\venv\Scripts\activate

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env and fill in your API keys

# 5. Run
flask --app backend run --debug
# Visit http://localhost:5000
```

---

## Environment Variables

All config comes from environment variables. In development these are loaded from `.env`.

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | **Yes** | Flask session secret. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | No | Database connection string. Defaults to SQLite if not set |
| `GOOGLE_MAPS_API_KEY` | **Yes** | Google Maps + Places + 3D Tiles |
| `CESIUM_ION_TOKEN` | No | Cesium Ion token (optional, used only if Google Tiles fail) |
| `FLASK_APP` | Dev only | Set to `backend` |
| `FLASK_ENV` | Dev only | Set to `development` for debug mode |

**DATABASE_URL formats:**
```
# SQLite (development only)
sqlite:///backend/solar.db

# PostgreSQL (production)
postgresql://username:password@hostname:5432/database_name

# If your hosting gives "postgres://" prefix (Heroku), the app auto-converts it
```

---

## Production with Gunicorn + Nginx

### 1. Set up server (Ubuntu/Debian)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python, pip, Nginx, PostgreSQL
sudo apt install -y python3 python3-pip python3-venv nginx postgresql postgresql-contrib

# Create app user (optional, good security practice)
sudo useradd -m -s /bin/bash solarapp
sudo su - solarapp
```

### 2. Deploy application

```bash
# As solarapp user
git clone <your-repo-url> ~/app
cd ~/app/src/cesium-local

# Create venv
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Configure environment

```bash
# Create .env file (do NOT commit this to git)
cat > /home/solarapp/app/src/cesium-local/.env << 'EOF'
SECRET_KEY=your-very-long-random-secret-key-here
DATABASE_URL=postgresql://solar_user:password@localhost:5432/solar_roi
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
CESIUM_ION_TOKEN=your-cesium-ion-token
FLASK_APP=backend
EOF
chmod 600 .env
```

### 4. Set up PostgreSQL

```bash
# As postgres user
sudo -u postgres psql << 'EOF'
CREATE USER solar_user WITH PASSWORD 'your-secure-password';
CREATE DATABASE solar_roi OWNER solar_user;
GRANT ALL PRIVILEGES ON DATABASE solar_roi TO solar_user;
\q
EOF

# Run migrations (as solarapp)
cd /home/solarapp/app/src/cesium-local
source backend/venv/bin/activate

flask db init          # only first time
flask db migrate -m "initial"
flask db upgrade
```

### 5. Create Gunicorn systemd service

```bash
sudo nano /etc/systemd/system/solarroi.service
```

```ini
[Unit]
Description=Solar ROI Calculator
After=network.target postgresql.service

[Service]
User=solarapp
WorkingDirectory=/home/solarapp/app/src/cesium-local
Environment="PATH=/home/solarapp/app/src/cesium-local/backend/venv/bin"
EnvironmentFile=/home/solarapp/app/src/cesium-local/.env
ExecStart=/home/solarapp/app/src/cesium-local/backend/venv/bin/gunicorn \
    "backend:create_app()" \
    --workers 4 \
    --bind 127.0.0.1:8000 \
    --timeout 120 \
    --access-logfile /var/log/solarroi/access.log \
    --error-logfile /var/log/solarroi/error.log
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Create log directory
sudo mkdir -p /var/log/solarroi
sudo chown solarapp:solarapp /var/log/solarroi

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable solarroi
sudo systemctl start solarroi
sudo systemctl status solarroi
```

### 6. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/solarroi
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase upload size for base64 screenshot uploads
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Serve generated GLB files directly (bypass Python for speed)
    location /backend/static/ {
        alias /home/solarapp/app/src/cesium-local/backend/static/;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # Serve frontend static files directly
    location /static/ {
        alias /home/solarapp/app/src/cesium-local/static/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/solarroi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Certbot auto-configures Nginx and sets up renewal
```

---

## Deploying on Render.com

Render is the easiest option — free tier available.

### 1. Create `render.yaml` in repo root

```yaml
services:
  - type: web
    name: solar-roi
    env: python
    region: singapore
    plan: free
    buildCommand: pip install -r src/cesium-local/backend/requirements.txt
    startCommand: >
      cd src/cesium-local &&
      flask db upgrade &&
      gunicorn "backend:create_app()" --workers 2 --bind 0.0.0.0:$PORT --timeout 120
    envVars:
      - key: FLASK_APP
        value: backend
      - key: SECRET_KEY
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: solar-roi-db
          property: connectionString
      - key: GOOGLE_MAPS_API_KEY
        sync: false
      - key: CESIUM_ION_TOKEN
        sync: false

databases:
  - name: solar-roi-db
    databaseName: solar_roi
    plan: free
```

### 2. Push to GitHub and connect to Render

1. Go to render.com → New → Blueprint
2. Connect your GitHub repo
3. Fill in `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` in environment settings
4. Deploy

---

## Deploying on Railway.app

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# In the project directory
railway init
railway add --database postgresql

# Set environment variables
railway variables set SECRET_KEY="your-secret"
railway variables set GOOGLE_MAPS_API_KEY="your-key"

# Deploy
railway up
```

Add a `Procfile` to the repo:
```
web: cd src/cesium-local && flask db upgrade && gunicorn "backend:create_app()" --workers 2 --bind 0.0.0.0:$PORT
```

---

## Deploying with Docker

### `Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for trimesh/numpy
RUN apt-get update && apt-get install -y \
    gcc g++ libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY src/cesium-local/backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src/cesium-local /app

# Create directories for generated files
RUN mkdir -p backend/static static/captures

EXPOSE 8000

CMD flask db upgrade && gunicorn "backend:create_app()" \
    --workers 4 \
    --bind 0.0.0.0:8000 \
    --timeout 120
```

### `docker-compose.yml`

```yaml
version: "3.9"

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - DATABASE_URL=postgresql://solar:solar@db:5432/solar_roi
      - GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
      - CESIUM_ION_TOKEN=${CESIUM_ION_TOKEN}
      - FLASK_APP=backend
    volumes:
      - ./generated:/app/backend/static
      - ./captures:/app/static/captures
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: solar_roi
      POSTGRES_USER: solar
      POSTGRES_PASSWORD: solar
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U solar"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

```bash
# Run
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

---

## Environment Checklist

Before going live, verify:

- [ ] `SECRET_KEY` is a long random string (at least 32 bytes)
- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite)
- [ ] `GOOGLE_MAPS_API_KEY` is restricted to your domain in Google Cloud Console
- [ ] `FLASK_ENV` is NOT set to `development` in production
- [ ] `flask db upgrade` has been run against the production database
- [ ] Nginx `client_max_body_size` is at least 20M (for screenshot uploads)
- [ ] `/backend/static/` directory is writable by the app user (GLB generation)
- [ ] `/static/captures/` directory is writable by the app user (screenshots)
- [ ] SSL certificate is installed
- [ ] Firewall: only ports 80 and 443 open externally

---

## Updating Production

```bash
# Pull latest code
cd /home/solarapp/app
git pull

# Activate venv
source src/cesium-local/backend/venv/bin/activate

# Install any new dependencies
pip install -r src/cesium-local/backend/requirements.txt

# Run migrations (safe to run even if no new migrations)
cd src/cesium-local
flask db upgrade

# Restart app
sudo systemctl restart solarroi

# Check status
sudo systemctl status solarroi
sudo tail -f /var/log/solarroi/error.log
```

---

## Common Issues

### `ModuleNotFoundError: No module named 'backend'`
Make sure `FLASK_APP=backend` is set and you're running flask from `cesium-local/` directory.

### `PVGIS API timeout`
PVGIS can be slow. Increase gunicorn timeout: `--timeout 120`. The results are cached per-process, so repeated calls for the same location are fast.

### GLB model not showing in browser
Check that `backend/static/` is writable. The model generation requires `trimesh[easy]` — make sure all its optional dependencies installed correctly with `pip install trimesh[easy]`.

### `psycopg2` installation fails
Install system libraries first: `sudo apt install libpq-dev python3-dev`

### Google 3D Tiles not loading
- Check browser console for API key errors
- Ensure "Map Tiles API" is enabled in Google Cloud Console
- The API key must not be restricted to a different referrer

### Screenshots not saving
`static/captures/` must exist and be writable. Created automatically on first save attempt, but the parent directory must be writable.
