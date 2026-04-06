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

## Roadmap

- [ ] ROS2 db3 file support (SQLite JDBC + CDR deserialization)
- [ ] Server directory browsing (NAS mount)
- [ ] Layout state persistence (localStorage)
- [ ] Frontend unit tests
