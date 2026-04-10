# WebJuggler Deployment Guide

## Prerequisites

- Java 21+ (or Gradle will auto-download via toolchain)
- Node.js 18+
- npm 9+

## Quick Setup (for Claude Code or new machines)

```bash
# 1. Clone
git clone https://github.com/MDEAGEWT/webjuggler.git
cd webjuggler

# 2. Backend dependencies (auto-downloads Java 21 if needed)
cd backend && ./gradlew build -x test && cd ..

# 3. Frontend dependencies
cd frontend && npm install && cd ..
```

## Running

### SOLO Mode (default — local, no auth)

```bash
# Terminal 1: Backend
cd backend && ./gradlew bootRun

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open http://localhost:3000. No login needed, drag & drop .ulg files.

### NAS Mode (team, Nextcloud auth + NAS browsing)

```bash
# Terminal 1: Backend with NAS settings
cd backend && ./gradlew bootRun --args='\
  --webjuggler.mode=nas \
  --webjuggler.nextcloud.url=https://your-nextcloud.example.com \
  --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs'

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open http://localhost:3000. Login with Nextcloud credentials. "NAS" button in TopBar to browse flight logs.

#### NAS Mount (required for NAS mode)

The NAS path must be mounted before starting the server:

```bash
sudo mount -t nfs <NAS_IP>:/mnt/Storage/nc_storage /mnt/nas_storage
```

## Production Deployment

### Build

```bash
# Backend: build fat JAR
cd backend && ./gradlew bootJar
# Output: backend/build/libs/webjuggler-*.jar

# Frontend: build static files
cd frontend && npm run build
# Output: frontend/dist/
```

### Run

```bash
# Serve frontend static files from backend
# Copy frontend build to backend's static directory:
cp -r frontend/dist/* backend/src/main/resources/static/

# Or rebuild backend after copying:
cd backend && ./gradlew bootJar

# Run the JAR:
java -jar build/libs/webjuggler-*.jar \
  --webjuggler.mode=nas \
  --webjuggler.nextcloud.url=https://your-nextcloud.example.com \
  --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs \
  --webjuggler.jwt.secret=your-secure-random-key-at-least-256-bits
```

Single port (8080) serves both API and frontend.

### Systemd Service (optional)

```ini
# /etc/systemd/system/webjuggler.service
[Unit]
Description=WebJuggler
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/webjuggler
ExecStart=/usr/bin/java -jar webjuggler.jar \
  --webjuggler.mode=nas \
  --webjuggler.nextcloud.url=https://your-nextcloud.example.com \
  --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs \
  --webjuggler.jwt.secret=change-me
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now webjuggler
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name webjuggler.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 500M;
    }
}
```

---

### Custom Java Path

If system Java is not 21:

```bash
JAVA_HOME=/path/to/jdk-21 ./gradlew bootRun
```

## Configuration

All settings in `backend/src/main/resources/application.yml`, overridable via CLI args or env vars.

| Property | Default | Description |
|----------|---------|-------------|
| `webjuggler.mode` | `solo` | `solo` (no auth) or `nas` (Nextcloud auth) |
| `webjuggler.upload.path` | `./uploads` | File upload directory |
| `webjuggler.upload.max-size-mb` | `500` | Max upload size |
| `webjuggler.cache.max-size-mb` | `1024` | Parsed file cache (LRU) |
| `webjuggler.jwt.secret` | dev default | JWT signing key (change in production!) |
| `webjuggler.jwt.expiration-hours` | `24` | JWT token lifetime |
| `webjuggler.nextcloud.url` | `""` | Nextcloud server URL (NAS mode) |
| `webjuggler.nas.path` | `""` | NAS flight logs directory (NAS mode) |

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| Backend | 8080 | REST API |
| Frontend | 3000 | Dev server (proxies /api to :8080) |

## Troubleshooting

### H2 Database lock error

```
Database may be already in use
```

Another backend instance is running. Kill it or delete the lock:
```bash
rm -f backend/data/webjuggler.mv.db
```

### Schema migration error (after code updates)

```
NULL not allowed for column "SOURCE"
```

Delete the H2 database to let Hibernate recreate the schema:
```bash
rm -f backend/data/webjuggler.mv.db backend/data/webjuggler.trace.db
```

### NAS browse returns 503

NAS path is not mounted or inaccessible. Check:
```bash
ls /mnt/nas_storage/Share/flight_logs/
```

### Frontend can't reach backend

Ensure backend is running on :8080. The Vite dev server proxies `/api/*` to `localhost:8080` (configured in `frontend/vite.config.ts`).
