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
- [ ] **Undo/Redo** — Ctrl+Z/Y for layout changes (split, close, clear series). Zustand middleware or state snapshot stack
- [ ] **Layout save/restore** — persist plot layout + series assignments to localStorage (or server). Survive page refresh
- [ ] **Data transforms** — derivative, moving average, integral, scale, outlier removal. Applied per-series, computed client-side
- [x] **Synchronized zoom/pan** — all time-series plots share the same time range. Zoom one = zoom all

### Important — Usability
- [x] **Legend with interaction** — show series list per plot with color, name, visibility toggle (click to hide/show), right-click to remove
- [x] **Cursor value display** — show exact numeric values at cursor position on each plot
- [ ] **Playback controls** — timeline slider, play/pause button, playback speed. Animates cursor across time
- [x] **Keyboard shortcuts** — V split vertical, H split horizontal, Delete remove series
- [x] **Toast notifications** — show errors/status to the user (upload failed, parse error, token expired)
- [x] **Dark/Light mode toggle** — current theme is dark-only. Add light mode option, persist preference. Dark = default

### Nice-to-have
- [ ] **Tabbed plot groups** — organize plots into named tabs instead of one giant split tree
- [ ] **Plot customization** — line width, grid toggle, axis labels, dot mode vs line mode
- [ ] **Recent files menu** — quick access to previously opened files
- [ ] **Time offset controls** — remove time offset, show relative time from arbitrary point
- [ ] **Fullscreen mode** — F11 or button to maximize plot area
- [ ] **Help/cheatsheet dialog** — show available shortcuts and features
- [ ] **Per-field data point count** — show count at field level in sidebar, not just topic level

### Deferred — Phase 3+
- [ ] ROS2 db3 file support (SQLite JDBC + CDR deserialization)
- [ ] Server directory browsing (NAS mount)
- [ ] Live data streaming (ROS2 topics, UDP, WebSocket)

### Not planned
- Data export (CSV/image)
- CSV file import
- Plugin/extension architecture
- Lua scripting (PlotJuggler feature)
