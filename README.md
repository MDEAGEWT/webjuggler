# WebJuggler

Web-based time-series data viewer inspired by [PlotJuggler](https://github.com/facontidavide/PlotJuggler). Built with Spring Boot 3 + React/TypeScript.

![WebJuggler Screenshot](docs/images/screenshot-main.png)

## Features

- **ULog file parsing** — PX4 flight log viewer (Java parser, all 13 message types)
- **Full-resolution data** — no downsampling, exact cursor values
- **Multi-file comparison** — load multiple files simultaneously, per-file topic namespacing
- **Recursive split layout** — right-click to split V/H, drag borders to resize
- **Drag & drop plotting**
  - 1 field → Time-series (uPlot)
  - 2 fields → X-Y scatter/trajectory (Canvas)
  - 3 fields → 3D scatter (Three.js)
  - 4 fields → Attitude quaternion view (Three.js)
- **Special views** — heading compass (multi-needle, auto rad/deg), 3D attitude (multi-quaternion comparison)
- **Cursor system** — 3 modes: OFF (playback only), Point (nearest data point), Time (move tracker)
- **Cursor values overlay** — follows cursor line with intersection dots and series values
- **Synchronized zoom/pan** — 2D drag zoom (X+Y), sync across all time-series plots
- **Playback controls** — timeline slider, play/pause, speed (0.5x–10x)
- **Edit Curves** — per-plot color, line style (Lines/Dots/Lines+Dots), line width
- **3D axis config** — swap/remap axes, negate toggle, PX4 NED mapping
- **Undo/Redo** — Ctrl+Z/Y for all layout changes
- **Layout persistence** — survives page refresh (localStorage)
- **Dark/Light mode** — CSS variable theming
- **Simple auth** — JWT login/register for team access

## Quick Start

### Prerequisites

- Java 21+
- Node.js 18+
- Gradle 8.x

### Backend

```bash
cd backend
./gradlew bootRun
```

Runs on `http://localhost:8080`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000` (proxies API to backend)

### Usage

1. Open `http://localhost:3000`
2. Register an account
3. Upload a `.ulg` file
4. Expand topics in the sidebar, drag fields to the plot area
5. Right-click on a plot to split, resize by dragging borders

## Architecture

```
Browser (React + TypeScript)          Spring Boot 3 (Java 21)
+--------------------------+         +--------------------------+
| Topic Tree (sidebar)     |  REST   | ULog Parser (Java)       |
| uPlot (time-series, X-Y) |<------>| File Management Service  |
| Three.js (3D plot)       |         | Auth (JWT)               |
| Split Layout Manager     |         | Parsed File Cache        |
+--------------------------+         +------------+-------------+
                                                  |
                                     +------------v-------------+
                                     | Storage                   |
                                     | - Upload directory        |
                                     | - H2 (dev) / PostgreSQL   |
                                     +---------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Spring Boot 3, Java 21, Spring Security (JWT), Caffeine cache |
| Parser | Java (ported from PlotJuggler C++ reference) |
| Database | H2 (dev) / PostgreSQL (prod) |
| Frontend | React 18, TypeScript, Vite |
| Charts | uPlot (time-series), Canvas (X-Y), Three.js (3D) |
| Layout | react-resizable-panels |
| State | Zustand |

## Configuration

Edit `backend/src/main/resources/application.yml`:

```yaml
webjuggler:
  upload:
    path: ./uploads          # file storage directory
    max-size-mb: 500         # max upload size
  cache:
    max-size-mb: 1024        # parsed file cache (LRU)
  jwt:
    secret: <change-me>      # JWT signing key (256+ bits)
    expiration-hours: 24
  browse:
    allowed-paths: []        # server directories for browsing
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/files/upload` | Upload .ulg file |
| GET | `/api/files` | List files |
| DELETE | `/api/files/{id}` | Delete file |
| GET | `/api/files/{id}/topics` | Topic tree |
| GET | `/api/files/{id}/info` | File metadata |
| POST | `/api/files/{id}/data` | Field data (full resolution) |

## Roadmap

- [x] ULog viewer with time-series, X-Y, 3D, attitude, compass
- [x] Multi-file comparison, cursor sync, playback controls
- [x] Edit Curves, 3D axis config, undo/redo, layout persistence
- [ ] ROS2 db3 file support
- [ ] Server directory browsing (NAS)
- [ ] Data transforms (derivative, moving average)

## License

MIT
