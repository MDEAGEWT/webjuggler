# WebJuggler Design Spec

Web-based time-series data viewer inspired by PlotJuggler. Built with Spring Boot 3 + React/TypeScript.

## Goals

- View PX4 ulog files (Phase 1) and ROS2 db3 files (Phase 2) in a browser
- Team-accessible: deployed on a server with simple auth
- Full-resolution data — no downsampling, exact cursor values
- PlotJuggler-like UX: drag-and-drop fields, recursive split layout, cursor sync

## Non-Goals

- Real-time streaming (no live ROS2 topics, UDP, etc.)
- Plugin system
- Data editing or export

## Architecture

```
Browser (React + TypeScript)          Spring Boot 3 (Java 21)
┌──────────────────────────┐         ┌──────────────────────────┐
│ Topic Tree (sidebar)     │  REST   │ ULog Parser (Java)       │
│ uPlot (time-series, X-Y) │◄──────►│ File Management Service  │
│ Three.js (3D plot)       │         │ Auth (JWT)               │
│ Split Layout Manager     │         │ Directory Browser        │
└──────────────────────────┘         └──────────┬───────────────┘
                                                 │
                                     ┌───────────▼───────────────┐
                                     │ Storage                    │
                                     │ - Upload directory         │
                                     │ - Server paths (NAS later) │
                                     │ - H2/PostgreSQL (users,    │
                                     │   file metadata)           │
                                     └───────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Spring Boot 3, Java 21 |
| ulog Parser | Java (ported from PlotJuggler C++ reference) |
| db3 Parser | SQLite JDBC + CDR deserializer (Phase 2) |
| Auth | Spring Security + JWT |
| Database | H2 (dev) / PostgreSQL (prod) |
| Frontend | React 18, TypeScript |
| Charts | uPlot (time-series, X-Y) |
| 3D | Three.js (3-field scatter) |
| Layout | react-resizable-panels (recursive split) |
| Build | Gradle (backend), Vite (frontend) |

## UI Design

### Layout Structure

- **Top bar**: Logo, Upload/Browse buttons, current filename, user info
- **Collapsible sidebar**: Topic tree with search filter, draggable fields with color indicators
- **Plot area**: Single plot initially, recursive split via right-click context menu

### Recursive Split Layout

Binary tree structure. Each node is either a `split` (direction + ratio + 2 children) or a `plot` (leaf).

```json
{
  "type": "split",
  "direction": "vertical",
  "ratio": 0.5,
  "children": [
    { "type": "plot", "id": "plot-1", "series": ["vehicle_attitude/rollspeed"] },
    { "type": "plot", "id": "plot-2", "series": [] }
  ]
}
```

**Context menu** (right-click on plot):
- Split Vertical (shortcut: V)
- Split Horizontal (shortcut: H)
- Swap with...
- Maximize
- Clear Series
- Close Panel

**Resize**: Drag the border between panels to adjust ratio. Double-click to reset 50:50.

### Drag & Drop → Auto Plot Mode

| Fields dragged | Plot type | Library |
|---------------|-----------|---------|
| 1 | Time-series (X=time) | uPlot |
| 2 | X-Y plot | uPlot |
| 3 | 3D scatter | Three.js |

- Ctrl+click in sidebar for multi-select
- Drop on existing plot = add series
- Drop on empty slot = new plot

### Cursor Sync

All plots share cursor position via React context. Hover on one plot → vertical cursor line on all time-series plots, highlighted point on X-Y and 3D plots. Exact current value displayed.

## REST API

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | username + password → JWT |
| POST | `/api/auth/register` | create account |

### Files

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/upload` | multipart upload → fileId (parsed immediately) |
| GET | `/api/files` | list all files (uploaded + server-side) |
| DELETE | `/api/files/{fileId}` | delete own upload |

### Server Browse

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/browse?path=/logs` | directory listing (allowed paths only) |
| POST | `/api/browse/open` | open server file → fileId (zero copy) |

**Security**: Allowed base paths are configured in `application.yml` via `webjuggler.browse.allowed-paths`. The backend canonicalizes the requested path and rejects any path that does not start with an allowed prefix. Symlinks that escape the allowed tree are rejected.

### Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files/{fileId}/topics` | topic tree with field names and types |
| GET | `/api/files/{fileId}/info` | metadata, parameters, duration, start time |
| POST | `/api/files/{fileId}/data` | full data — all points, no downsampling |

The data endpoint uses POST to avoid URL length limits. Request body:
```json
{
  "fields": ["vehicle_attitude/rollspeed", "vehicle_attitude/pitchspeed"]
}
```

### Data Response Format

```json
{
  "fields": {
    "vehicle_attitude/rollspeed": {
      "timestamps": [0.0, 0.004, 0.008],
      "values": [0.12, 0.15, 0.11]
    },
    "vehicle_attitude/pitchspeed": {
      "timestamps": [0.0, 0.004, 0.008],
      "values": [-0.03, -0.01, 0.02]
    }
  },
  "dropouts": [
    { "timestamp": 12.5, "durationMs": 120 }
  ]
}
```

Frontend should request fields **per topic group** (not all fields at once) to keep response sizes reasonable. The `/info` endpoint includes `estimatedDataSizeMb` per topic so the frontend can warn before fetching very large topics.

### Data Flow

1. User uploads file or opens from server directory
2. Backend parses ulog binary → Java objects, caches in memory
3. Frontend requests topic tree → renders sidebar
4. User drags field(s) to plot → `POST /data` with field names → full data array
5. Browser stores in `Float64Array`, uPlot renders
6. Zoom, pan, cursor — all client-side, no server calls

### Large File Handling

- Upload size limit: configurable, default 500MB (`webjuggler.upload.max-size-mb`)
- Spring config: `spring.servlet.multipart.max-file-size=500MB`
- Files > 100MB: frontend shows warning before loading data. User can load anyway or select time range.
- No silent degradation or automatic downsampling.
- Parsing is synchronous for files < 50MB. For larger files, async with polling: `GET /api/files/{fileId}/status` → `{"status": "parsing" | "ready" | "error"}`

## ULog Parser (Java)

Ported from PlotJuggler's C++ `ulog_parser.cpp`. Key structures:

### Binary Format

- File header: 8-byte magic + uint64 timestamp
- Each message: uint16 size + uint8 type + payload
- All multi-byte integers are little-endian

#### Message Types

| Type | Char | Disposition | Notes |
|------|------|-------------|-------|
| FORMAT | F | Parse | Message format definitions with field names/types |
| DATA | D | Parse | Actual logged data |
| INFO | I | Parse | Key-value info (hardware, software version, etc.) |
| INFO_MULTIPLE | M | Parse | Multi-part info values (arrays) |
| ADD_LOGGED_MSG | A | Parse | Subscribe msg_id to a format |
| REMOVE_LOGGED_MSG | R | Parse | Unsubscribe msg_id (stale mapping removal) |
| PARAMETER | P | Parse | Flight parameters |
| PARAMETER_DEFAULT | Q | Parse | Default parameter values |
| FLAG_BITS | B | Parse | **Critical**: incompat flags + appended data offsets. Reject file if unknown incompat bits are set. |
| LOGGING | L | Parse | Log messages with level + timestamp |
| LOGGING_TAGGED | C | Parse | Tagged log messages |
| SYNC | S | Skip | Sync marker for recovery |
| DROPOUT | O | Parse | Data loss indicator (duration in ms). Expose to frontend for visual markers. |

### Nested/Composite Types

ulog FORMAT messages can reference other named formats (nested structs). The parser must handle recursive field resolution. Fields are flattened with `/` separator:

```
# FORMAT: sensor_combined has a nested "gyro" struct
sensor_combined/gyro_rad[0]     → sensor_combined/gyro_rad.00
sensor_combined/gyro_rad[1]     → sensor_combined/gyro_rad.01
sensor_combined/nested_struct/x → sensor_combined/nested_struct/x
```

Fields named `_padding*` are alignment bytes — skip them, do not expose as data fields.

### Multi-Instance Topics

When `multi_id > 0` in ADD_LOGGED_MSG, append instance suffix:
- `sensor_accel` (multi_id=0) → `sensor_accel`
- `sensor_accel` (multi_id=1) → `sensor_accel.01`
- `sensor_accel` (multi_id=2) → `sensor_accel.02`

### Timestamp Convention

Timestamps are returned as **seconds since file start**:
```
timestamp_seconds = (raw_timestamp_us - file_start_timestamp_us) / 1_000_000.0
```

For nested structs without their own timestamp field, inherit the parent message's timestamp.

### Java Classes

```
ULogParser
├── parse(InputStream) → ULogFile
├── ULogFile
│   ├── topics: Map<String, Topic>
│   ├── parameters: Map<String, Parameter>
│   ├── info: Map<String, String>
│   ├── logs: List<LogMessage>
│   └── dropouts: List<Dropout>   // timestamp + duration_ms
├── Topic
│   ├── name: String              // includes multi-instance suffix
│   ├── fields: List<Field>       // flattened (nested structs resolved)
│   └── multiId: int
├── Field
│   ├── name: String
│   ├── type: FieldType (UINT8..DOUBLE, BOOL, CHAR, OTHER)
│   ├── otherTypeName: String     // for OTHER: references another Format
│   └── arraySize: int
└── Timeseries
    ├── timestamps: double[]      // seconds since file start
    └── values: double[]
```

### Parsing Strategy

1. Read file header, validate magic bytes (`ULog01`)
2. Read FLAG_BITS — reject if unknown incompat flags set
3. Read definition section (FORMAT, INFO, INFO_MULTIPLE, PARAMETER, PARAMETER_DEFAULT)
4. Read data section (ADD_LOGGED_MSG, REMOVE_LOGGED_MSG, DATA, DROPOUT, LOGGING)
5. Resolve nested formats recursively, flatten field paths, skip `_padding*` fields
6. Build timeseries: for each subscription, extract fields from DATA messages
7. Cache parsed result in memory (keyed by fileId)

### Parsed File Cache

LRU cache using Caffeine with configurable max memory budget:
- Default: 1GB max cache size (configurable via `webjuggler.cache.max-size-mb`)
- Eviction: least recently accessed
- On cache miss after eviction: re-parse from stored file (transparent to client)
- Cache key: fileId, cache value: parsed ULogFile

## Auth

- Simple username/password registration
- JWT tokens (Spring Security), 24h expiry, refresh via `POST /api/auth/refresh`
- File ownership: users can only delete their own uploads
- Server-side files are read-only for all users
- No roles/permissions beyond ownership

## Error Handling

### API Error Response Format
```json
{ "error": "FILE_NOT_FOUND", "message": "File abc123 does not exist" }
```

### HTTP Status Codes
- 400: Bad request (invalid fields, malformed request)
- 401: Unauthorized (missing/expired JWT)
- 403: Forbidden (deleting another user's file)
- 404: File or path not found
- 413: Upload exceeds size limit
- 500: Parser error or server failure

### Frontend States
- **Uploading**: progress bar (multipart upload progress)
- **Parsing**: spinner with "Parsing file..." (for async large files, poll `/status`)
- **Ready**: topic tree rendered
- **Error**: toast notification with error message

## Project Structure

```
webjuggler/
├── backend/
│   ├── src/main/java/com/webjuggler/
│   │   ├── WebJugglerApplication.java
│   │   ├── config/
│   │   │   ├── SecurityConfig.java
│   │   │   └── WebConfig.java
│   │   ├── auth/
│   │   │   ├── AuthController.java
│   │   │   ├── JwtService.java
│   │   │   └── User.java
│   │   ├── file/
│   │   │   ├── FileController.java
│   │   │   ├── FileService.java
│   │   │   └── BrowseController.java
│   │   ├── parser/
│   │   │   ├── ulog/
│   │   │   │   ├── ULogParser.java
│   │   │   │   ├── ULogFile.java
│   │   │   │   ├── ULogMessageType.java
│   │   │   │   └── ULogStructs.java
│   │   │   └── ParsedFileCache.java
│   │   └── data/
│   │       └── DataController.java
│   ├── src/main/resources/
│   │   └── application.yml
│   └── build.gradle
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar/
│   │   │   │   ├── TopicTree.tsx
│   │   │   │   └── FieldItem.tsx
│   │   │   ├── PlotArea/
│   │   │   │   ├── SplitLayout.tsx
│   │   │   │   ├── PlotPanel.tsx
│   │   │   │   ├── TimeSeriesPlot.tsx
│   │   │   │   ├── XYPlot.tsx
│   │   │   │   └── ThreeDPlot.tsx
│   │   │   ├── ContextMenu.tsx
│   │   │   └── FileDialog.tsx
│   │   ├── hooks/
│   │   │   ├── useCursorSync.ts
│   │   │   ├── useSplitLayout.ts
│   │   │   └── useDragDrop.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── vite.config.ts
└── docs/
```

## Phasing

### Phase 1 — ulog viewer (MVP)
- Java ulog parser
- File upload + topic tree + time-series plot
- Recursive split layout with resize
- Drag & drop (1 field = time-series)
- Cursor sync across plots
- Simple auth (JWT)

### Phase 2 — X-Y and multi-field
- 2-field drag → X-Y plot
- 3-field drag → 3D scatter (Three.js)
- Server directory browsing

### Phase 3 — db3 support + NAS
- SQLite JDBC reader for ROS2 bag files
- CDR deserialization
- NAS mount browsing
