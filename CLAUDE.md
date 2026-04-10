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
- **View mode via context menu** — right-click to switch between timeseries/XY/3D/attitude/compass
- **Tabbed layout** — each tab has independent split tree + undo stack
- **Multi-curve XY/3D** — series paired by 2 (XY) or 3 (3D), each pair = one curve/trajectory
- **Custom functions** — mathjs/number expression evaluator, results stored in data store with `custom:` key prefix
- **Time axis modes** — Boot Time (default, offsets by fileStartTime) and GPS Time. Data stored as boot-relative, offsets applied in adjustedData layer
- **SOLO/NAS modes** — configured via `webjuggler.mode` property. SOLO: permitAll + SoloAuthFilter. NAS: JWT + Nextcloud OCS login
- **ULog parser** — pure Java port of PlotJuggler's C++ parser, handles all 13 message types

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/config | No | App mode + settings |
| POST | /api/auth/login | No | Login → JWT |
| POST | /api/auth/register | No | Create account (SOLO only) |
| POST | /api/auth/refresh | Yes | Refresh token |
| POST | /api/files/upload | Yes | Upload .ulg file |
| GET | /api/files | Yes | List files |
| DELETE | /api/files/{id} | Yes | Delete (owner only) |
| GET | /api/files/{id}/topics | Yes | Topic tree |
| GET | /api/files/{id}/info | Yes | Metadata + startTimeMicros + gpsOffsetUs |
| POST | /api/files/{id}/data | Yes | Full field data |
| GET | /api/nas/browse | Yes | Browse NAS directory (NAS mode) |
| POST | /api/nas/open | Yes | Open NAS files (NAS mode) |

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
- [x] **X-Y plot** — multi-curve canvas scatter with trajectory line, cursor point mode
- [x] **3D scatter plot** — multi-trajectory Three.js with orbit controls, cursor point mode, per-trajectory colors
- [x] **Cursor modes** — OFF, Point (tooltip on all plot types), Time (move tracker)
- [x] **Axis config** — XY and 3D: swap/remap axes, negate toggle, via context menu
- [x] **Custom functions** — mathjs expression editor, 10 templates, live preview, function library
- [x] **Tabbed plot area** — named tabs, per-tab undo, Custom Function Editor as tab
- [x] **Time axis modes** — Boot Time / GPS Time, per-file offset
- [x] **SOLO/NAS modes** — no-auth local mode + Nextcloud auth NAS browsing

### Nice-to-have
- [ ] **Recent files menu** — quick access to previously opened files
- [ ] **Fullscreen mode** — F11 or button to maximize plot area
- [ ] **Help/cheatsheet dialog** — show available shortcuts and features

### Deferred
- [ ] ROS2 db3 file support (SQLite JDBC + CDR deserialization)
- [ ] Live data streaming (ROS2 topics, UDP, WebSocket)

## NAS Integration

See [NAS.md](NAS.md) for full NAS architecture and flight log structure.

**Quick reference for WebJuggler:**
- Read path: `/mnt/nas_storage/Share/flight_logs/`
- Hierarchy: date → session → ULG files
- `summary.json` per session for metadata without parsing
- Files are read-only (chmod 444) — browse and open only, no upload/delete
- Coexists with existing file upload feature

### Not planned
- Data export (CSV/image)
- CSV file import
- Plugin/extension architecture
- Lua scripting (PlotJuggler feature)
