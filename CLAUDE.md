# CLAUDE.md

## Project Overview

WebJuggler — a web-based PlotJuggler clone for viewing PX4 ulog (and eventually ROS2 db3) time-series data. Team-accessible with simple JWT auth.

## Tech Stack

- **Backend**: Spring Boot 3, Java 21, H2 (dev), Caffeine cache, jjwt
- **Frontend**: React 18, TypeScript, Vite, uPlot, Three.js, Zustand, react-resizable-panels
- **Build**: Gradle (backend), npm/Vite (frontend)

## Development Setup

```bash
# Backend (requires Java 21)
cd backend && ./gradlew bootRun    # http://localhost:8080

# Frontend (requires Node 18+)
cd frontend && npm install && npm run dev   # http://localhost:3000 (proxies to :8080)
```

If system Java is not 21, the Gradle toolchain will auto-download it. You may need:
```bash
JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun
```

## Running Tests

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
cd frontend && npx tsc --noEmit   # type check only, no unit tests yet
```

Test data: `backend/src/test/resources/sample.ulg`

## Project Structure

```
backend/src/main/java/com/webjuggler/
├── auth/          # JWT auth (register, login, refresh)
├── config/        # SecurityConfig, WebJugglerProperties
├── data/          # DataController (topics, info, data endpoints)
├── file/          # FileController, FileService, FileEntity
└── parser/
    ├── ulog/      # ULogParser, data structures (ported from C++)
    └── ParsedFileCache.java  # Caffeine LRU

frontend/src/
├── api/           # REST client (client.ts, auth.ts, files.ts)
├── components/
│   ├── PlotArea/  # SplitLayout, PlotPanel, TimeSeriesPlot, XYPlot, ThreeDPlot
│   ├── Sidebar/   # TopicTree, FieldItem (drag source)
│   ├── TopBar.tsx, LoginPage.tsx, ContextMenu.tsx
├── stores/        # Zustand: auth, file, layout, data, cursor
└── types/         # TypeScript interfaces
```

## Key Design Decisions

- **No downsampling** — full-resolution data always, all zoom/pan client-side
- **No WebSocket** — pure REST, data loaded once per field
- **Drag count determines plot type**: 1=time-series, 2=X-Y, 3=3D
- **Recursive split layout** — binary tree, right-click to split V/H
- **ULog parser** — pure Java port of PlotJuggler's C++ parser, handles all 13 message types
- **Cursor sync** — all time-series plots sync via uPlot sync key; X-Y and 3D show cursor sphere

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Login → JWT |
| POST | /api/auth/refresh | Yes | Refresh token |
| POST | /api/files/upload | Yes | Upload .ulg file |
| GET | /api/files | Yes | List files |
| DELETE | /api/files/{id} | Yes | Delete (owner only) |
| GET | /api/files/{id}/topics | Yes | Topic tree |
| GET | /api/files/{id}/info | Yes | Metadata |
| POST | /api/files/{id}/data | Yes | Full field data |

## Recommended Plugins

```
/plugin install superpowers@claude-plugins-official
/plugin install playwright-cli@anthropic-agent-skills
/reload-plugins
```

## Feature Backlog (vs PlotJuggler)

### Critical — Core UX gaps
- [x] **Multi-file loading** — load multiple ulg files simultaneously for comparison
- [x] **Undo/Redo** — Ctrl+Z/Y for layout changes (split, close, clear series)
- [x] **Layout save/restore** — persist plot layout + series assignments to localStorage
- [ ] **Data transforms** — derivative, moving average, integral, scale, outlier removal. Applied per-series, computed client-side
- [x] **Synchronized zoom/pan** — all time-series plots share the same time range. Zoom one = zoom all. 2D drag zoom (X+Y always)
- [x] **Multi-file timestamp merge** — merged timestamp arrays with nearest-neighbor value lookup (no interpolation). spanGaps connects across nulls

### Important — Usability
- [x] **Legend with interaction** — color + topic/field path, click to hide/show, right-click to remove
- [x] **Cursor value display** — values overlay follows cursor line with dots at intersection points. Sorted by series order
- [x] **Playback controls** — timeline slider, play/pause button, playback speed (0.5x-10x)
- [x] **Keyboard shortcuts** — V split vertical, H split horizontal, Delete remove series, Ctrl+Z/Y undo/redo, Space play/pause
- [x] **Toast notifications** — show errors/status to the user (upload failed, parse error, token expired)
- [x] **Dark/Light mode toggle** — CSS variables, persisted preference. Dark = default
- [x] **Right sidebar toggles** — Zoom sync, Cursor values, Cursor mode (OFF/Point/Time)
- [x] **Sidebar field values** — shows current value at cursor time for fetched fields
- [ ] **Edit Curves dialog** — per-series: color picker, line style (Lines/Dots/Lines+Dots), line width. Accessible via context menu "Edit Curves..."

### Special visualization modes
- [x] **Heading compass view** — multi-needle compass, auto radian↔degree, full topic/field labels in overlay
- [x] **3D Attitude view** — multi-quaternion comparison (up to 3 groups), PX4 NED→Three.js mapping, distinct rod colors per group, RGB axis tips, euler overlay
- [x] **X-Y plot** — canvas scatter with trajectory line, cursor sync highlight
- [x] **3D scatter plot** — Three.js with orbit controls, axis negate buttons, Z=vertical mapping
- [x] **Cursor modes** — OFF (playback only), Point (nearest data point hover with PlotJuggler-style tooltip), Time (move tracker)
- [ ] **3D axis config dialog** — swap/assign which data field maps to X/Y/Z, negate toggle. Small popup from axis control buttons

### Nice-to-have
- [ ] **Tabbed plot groups** — organize plots into named tabs instead of one giant split tree
- [ ] **Recent files menu** — quick access to previously opened files
- [ ] **Time offset controls** — remove time offset, show relative time from arbitrary point
- [ ] **Fullscreen mode** — F11 or button to maximize plot area
- [ ] **Help/cheatsheet dialog** — show available shortcuts and features
- [ ] **Per-field data point count** — show count at field level in sidebar, not just topic level

### Deferred — Phase 3+
- [ ] ROS2 db3 file support (SQLite JDBC + CDR deserialization)
- [x] Server directory browsing (NAS mount) — see NAS Flight Log Structure below
- [ ] Live data streaming (ROS2 topics, UDP, WebSocket)
- [ ] Data transforms (derivative, moving average, etc.)

## NAS Flight Log Structure

The server has NFS-mounted NAS storage at `/mnt/nas_storage/`.
WebJuggler reads from `Share/flight_logs/` which contains organized PX4 ULG files.

**Mount path:** `/mnt/nas_storage/Share/flight_logs/`

```
flight_logs/
├── 2026-03-28/
│   ├── swarm_session_1/
│   │   ├── drone_60_03_07_46.ulg
│   │   ├── drone_67_03_07_46.ulg
│   │   ├── drone_100_03_07_46.ulg
│   │   ├── summary.json
│   │   └── report.pdf
│   ├── swarm_session_2/
│   │   └── ...
│   ├── solo_flights/
│   │   ├── drone_84_02_45_19.ulg
│   │   └── report.pdf
│   ├── _unarmed/
│   │   └── drone_60_01_55_53.ulg
│   └── overview_report.pdf
├── 2026-04-10/
│   └── ...
```

**Naming conventions:**
- Date folders: `YYYY-MM-DD` (KST)
- Swarm sessions: `swarm_session_N/` — multiple drones that flew simultaneously
- Solo flights: `solo_flights/` — single-drone armed flights
- Unarmed: `_unarmed/` — ground logs (no takeoff)
- ULG filenames: `{drone_id}_{HH_MM_SS}.ulg`

**summary.json** (per swarm session):
```json
{
  "session_id": "swarm_session_1",
  "date": "2026-03-28",
  "drone_count": 25,
  "drone_ids": ["drone_60", "drone_67", "drone_100"],
  "start_time": "2026-03-28T03:07:46+00:00",
  "end_time": "2026-03-28T03:08:10+00:00",
  "total_duration_sec": 24.1,
  "flights": [
    {
      "drone_id": "drone_60",
      "filename": "drone_60_03_07_46.ulg",
      "is_armed": true,
      "flight_duration_sec": 24.1,
      "start_time_utc": "2026-03-28T03:07:46+00:00"
    }
  ]
}
```

**Integration notes:**
- Browse endpoint should scan `/mnt/nas_storage/Share/flight_logs/` for date → session → ULG hierarchy
- `summary.json` provides metadata without parsing ULGs
- `_unarmed/` can be hidden or shown via toggle
- Files are read-only (chmod 444) — no upload/delete for NAS files
- Multiple ULGs from same session should be loadable together for swarm comparison

### Not planned
- Data export (CSV/image)
- CSV file import
- Plugin/extension architecture
- Lua scripting (PlotJuggler feature)
