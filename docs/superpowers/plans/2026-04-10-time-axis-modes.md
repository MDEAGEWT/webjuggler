# Time Axis Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Boot Time and GPS Time axis modes for multi-file timestamp alignment.

**Architecture:** Backend exposes `startTimeMicros` and `gpsOffsetUs` via the info endpoint. Frontend stores per-file metadata, computes offsets via a utility, and applies them in `useDataStore.adjustedData`. All consumer components read `adjustedData` instead of `data`. PlaybackBar gets a time mode dropdown.

**Tech Stack:** Spring Boot 3 (Java 21), React 18, TypeScript, Zustand

**Spec:** `docs/superpowers/specs/2026-04-10-time-axis-modes-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/.../data/InfoResponse.java` | Add `startTimeMicros`, `gpsOffsetUs` fields |
| Modify | `backend/.../data/DataController.java` | Pass startTimeMicros and gpsOffsetUs to InfoResponse |
| Modify | `backend/.../parser/ulog/ULogParser.java` | Expose fileStartTime, extract GPS offset |
| Create | `frontend/src/utils/timeOffset.ts` | getFileTimeOffset, fileIdFromKey utilities |
| Modify | `frontend/src/api/files.ts` | Update info() return type |
| Modify | `frontend/src/types/index.ts` | Update FileInfo type, add LoadedFile fields |
| Modify | `frontend/src/stores/useFileStore.ts` | Store startTimeMicros, gpsOffsetUs per file |
| Modify | `frontend/src/stores/useSettingsStore.ts` | Add timeMode setting |
| Modify | `frontend/src/stores/useDataStore.ts` | Add adjustedData + recomputeAdjusted |
| Modify | `frontend/src/components/PlotArea/TimeSeriesPlot.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/PlotArea/XYPlot.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/PlotArea/ThreeDPlot.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/PlotArea/CompassView.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/PlotArea/AttitudeView.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/Sidebar/FieldItem.tsx` | `s.data` → `s.adjustedData` |
| Modify | `frontend/src/components/PlaybackBar.tsx` | Time mode dropdown, use adjustedData |
| Modify | `frontend/src/index.css` | Dropdown CSS |

---

## Task 1: Backend — expose startTimeMicros and gpsOffsetUs

**Files:**
- Modify: `backend/src/main/java/com/webjuggler/data/InfoResponse.java`
- Modify: `backend/src/main/java/com/webjuggler/data/DataController.java`
- Modify: `backend/src/main/java/com/webjuggler/parser/ulog/ULogParser.java`

- [ ] **Step 1: Add getter for fileStartTime in ULogParser**

ULogParser has `private long fileStartTime` (line 19). Add a public getter:

```java
public long getFileStartTime() {
    return fileStartTime;
}
```

- [ ] **Step 2: Add GPS offset extraction to ULogParser**

Add a method that scans parsed data for GPS topics and extracts the boot↔GPS time offset. Add after `buildResult()`:

```java
/**
 * Extract GPS offset by finding the first valid GPS UTC timestamp.
 * Priority: sensor_gnss_relative.time_utc_usec, then piksi_rtk.time_utc_usec
 * Returns null if no GPS data found.
 */
public Long extractGpsOffsetUs() {
    // Try sensor_gnss_relative first
    Long offset = tryGpsOffset("sensor_gnss_relative", "time_utc_usec");
    if (offset != null) return offset;

    // Try piksi_rtk
    offset = tryGpsOffset("piksi_rtk", "time_utc_usec");
    return offset;
}

private Long tryGpsOffset(String topicName, String fieldName) {
    for (var entry : messageData.entrySet()) {
        MessageDefinition def = entry.getKey();
        if (!def.name().equals(topicName)) continue;

        MultiTimeseries mts = entry.getValue();
        if (mts.timestamps.isEmpty()) continue;

        // Find the field index
        int fieldIdx = -1;
        for (int i = 0; i < mts.fieldNames.size(); i++) {
            if (mts.fieldNames.get(i).equals(fieldName)) {
                fieldIdx = i;
                break;
            }
        }
        if (fieldIdx < 0) continue;

        // Get the first valid GPS timestamp
        Long bootUs = mts.timestamps.get(0);
        double gpsValue = mts.fieldValues.get(fieldIdx).get(0);
        if (bootUs == null || !Double.isFinite(gpsValue) || gpsValue <= 0) continue;

        long gpsUs = (long) gpsValue;
        return gpsUs - bootUs;  // GPS-boot delta in microseconds
    }
    return null;
}
```

Note: `messageData` is `Map<MessageDefinition, MultiTimeseries>` (check the actual field name in ULogParser — it may be named differently). The implementer should read the parser to find the correct data structure that stores raw topic data before `buildResult()` converts it.

- [ ] **Step 3: Update InfoResponse record**

```java
public record InfoResponse(
    Map<String, String> info,
    List<ParameterEntry> parameters,
    double duration,
    int topicCount,
    long totalDataPoints,
    long startTimeMicros,    // NEW
    Long gpsOffsetUs         // NEW, nullable
) {}
```

- [ ] **Step 4: Update DataController info endpoint**

In the `getInfo` method, after parsing, pass the new fields:

```java
return new InfoResponse(
    ulog.info(),
    params,
    duration,
    topicCount,
    totalDataPoints,
    parser.getFileStartTime(),       // NEW
    parser.extractGpsOffsetUs()      // NEW
);
```

Note: The implementer needs to check how `parser` is accessed. Currently the info endpoint uses `ULogFile ulog = cache.get(fileId)`. The parser may already be discarded after parsing. If so, `startTimeMicros` and `gpsOffsetUs` need to be stored on `ULogFile` during parsing.

- [ ] **Step 5: Run backend tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: expose startTimeMicros and gpsOffsetUs in info endpoint"
```

---

## Task 2: Frontend — time offset utility + types

**Files:**
- Create: `frontend/src/utils/timeOffset.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Update FileInfo type**

In `frontend/src/types/index.ts`, add fields to the existing types:

```typescript
// Add to FileInfo or create new fields in LoadedFile interface
export interface FileTimeMeta {
  startTimeMicros: number
  gpsOffsetUs: number | null
}
```

- [ ] **Step 2: Create timeOffset.ts**

```typescript
interface FileMeta {
  fileId: string
  startTimeMicros: number
  gpsOffsetUs: number | null
}

export function getFileTimeOffset(
  fileId: string,
  files: FileMeta[],
  timeMode: 'boot' | 'gps',
): number {
  const file = files.find((f) => f.fileId === fileId)
  if (!file) return 0

  if (timeMode === 'boot') {
    const earliest = Math.min(...files.map((f) => f.startTimeMicros))
    return (file.startTimeMicros - earliest) / 1_000_000
  }

  if (timeMode === 'gps' && file.gpsOffsetUs != null) {
    // GPS absolute = startTimeMicros + relative_us + gpsOffsetUs
    // For display: subtract earliest GPS absolute to get T=0
    const gpsAbsolute = (f: FileMeta) => f.startTimeMicros + (f.gpsOffsetUs ?? 0)
    const allGpsStarts = files
      .filter((f) => f.gpsOffsetUs != null)
      .map(gpsAbsolute)
    const earliestGps = Math.min(...allGpsStarts)
    return (gpsAbsolute(file) - earliestGps) / 1_000_000
  }

  return 0
}

export function fileIdFromKey(compositeKey: string): string {
  if (compositeKey.startsWith('custom:')) return ''
  const idx = compositeKey.indexOf(':')
  return idx >= 0 ? compositeKey.substring(0, idx) : ''
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/timeOffset.ts frontend/src/types/index.ts
git commit -m "feat: add time offset utility and FileTimeMeta type"
```

---

## Task 3: Frontend stores — file metadata + settings + adjustedData

**Files:**
- Modify: `frontend/src/api/files.ts`
- Modify: `frontend/src/stores/useFileStore.ts`
- Modify: `frontend/src/stores/useSettingsStore.ts`
- Modify: `frontend/src/stores/useDataStore.ts`

- [ ] **Step 1: Update API files.ts — info response**

The current `info()` function returns `FileInfo`. Update it to also return `startTimeMicros` and `gpsOffsetUs` from the backend response. Either extend `FileInfo` or return a separate object. The simplest approach: return the raw response and let the store extract what it needs.

```typescript
export interface InfoResponse {
  info: Record<string, string>
  parameters: { name: string; value: number }[]
  duration: number
  topicCount: number
  totalDataPoints: number
  startTimeMicros: number
  gpsOffsetUs: number | null
}

export async function info(fileId: string): Promise<InfoResponse> {
  const res = await api.get(`/files/${fileId}/info`)
  return res.data
}
```

- [ ] **Step 2: Update useFileStore — store time metadata**

Add `startTimeMicros` and `gpsOffsetUs` to the `LoadedFile` interface and populate during `addFile`:

```typescript
interface LoadedFile {
  fileId: string
  filename: string
  shortName: string
  topics: Topic[]
  startTimeMicros: number
  gpsOffsetUs: number | null
}
```

In the `addFile` action, after fetching topics, also fetch info and extract the time metadata:

```typescript
addFile: async (fileId, filename) => {
  const [topicData, infoData] = await Promise.all([
    fetchTopics(fileId),
    info(fileId),
  ])
  // ... existing topic processing ...
  set((state) => ({
    files: [...state.files, {
      fileId,
      filename,
      shortName: filename.replace(/\.ulg$/i, ''),
      topics: topicData,
      startTimeMicros: infoData.startTimeMicros,
      gpsOffsetUs: infoData.gpsOffsetUs,
    }],
  }))
  // Trigger adjustedData recomputation
  useDataStore.getState().recomputeAdjusted()
},
```

Also in `removeFile`, trigger recompute after removal.

- [ ] **Step 3: Update useSettingsStore — add timeMode**

```typescript
// Add to interface:
timeMode: 'boot' | 'gps'
setTimeMode: (mode: 'boot' | 'gps') => void

// Add to store:
timeMode: 'boot',
setTimeMode: (mode) => {
  set({ timeMode: mode })
  // Trigger adjustedData recomputation
  useDataStore.getState().recomputeAdjusted()
  // Reset zoom and cursor
  useZoomStore.getState().resetZoom()
  useCursorStore.getState().setCursor(null)
},
```

- [ ] **Step 4: Update useDataStore — add adjustedData**

Add `adjustedData` computed from `data` + offsets. Add `recomputeAdjusted` method:

```typescript
interface DataState {
  data: Record<string, FieldData>
  adjustedData: Record<string, FieldData>
  fetchFields: (fields: string[]) => Promise<void>
  clearFileData: (fileId: string) => void
  setCustomData: (key: string, data: FieldData) => void
  removeCustomData: (key: string) => void
  recomputeAdjusted: () => void
}
```

Implementation of `recomputeAdjusted`:

```typescript
recomputeAdjusted: () => {
  const state = get()
  const files = useFileStore.getState().files
  const timeMode = useSettingsStore.getState().timeMode
  const customFunctions = useCustomFunctionStore.getState().functions

  const adjusted: Record<string, FieldData> = {}
  for (const [key, fd] of Object.entries(state.data)) {
    let fid: string
    if (key.startsWith('custom:')) {
      // Custom series: inherit main input's fileId
      const fnName = key.substring(7)
      const fn = Object.values(customFunctions).find((f) => f.name === fnName)
      fid = fn ? fileIdFromKey(fn.mainInput) : ''
    } else {
      fid = fileIdFromKey(key)
    }
    const offset = getFileTimeOffset(fid, files, timeMode)
    if (offset === 0) {
      adjusted[key] = fd  // No copy needed
    } else {
      adjusted[key] = {
        timestamps: Float64Array.from(fd.timestamps, (t) => t + offset),
        values: fd.values,
      }
    }
  }
  set({ adjustedData: adjusted })
},
```

Also call `recomputeAdjusted()` at the end of `fetchFields` (after storing data) and after `setCustomData`.

Initial state: `adjustedData: {}`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/files.ts frontend/src/stores/useFileStore.ts frontend/src/stores/useSettingsStore.ts frontend/src/stores/useDataStore.ts
git commit -m "feat: store file time metadata, add adjustedData with offset computation"
```

---

## Task 4: Switch all consumers from data to adjustedData

**Files:**
- Modify: `frontend/src/components/PlotArea/TimeSeriesPlot.tsx`
- Modify: `frontend/src/components/PlotArea/XYPlot.tsx`
- Modify: `frontend/src/components/PlotArea/ThreeDPlot.tsx`
- Modify: `frontend/src/components/PlotArea/CompassView.tsx`
- Modify: `frontend/src/components/PlotArea/AttitudeView.tsx`
- Modify: `frontend/src/components/Sidebar/FieldItem.tsx`
- Modify: `frontend/src/components/PlaybackBar.tsx`

- [ ] **Step 1: Replace in all 7 files**

In each file, find `useDataStore((s) => s.data)` and replace with `useDataStore((s) => s.adjustedData)`.

Pattern:
```typescript
// Before:
const data = useDataStore((s) => s.data)

// After:
const data = useDataStore((s) => s.adjustedData)
```

Files to update:
1. `TimeSeriesPlot.tsx` — `const data = useDataStore((s) => s.data)`
2. `XYPlot.tsx` — `const data = useDataStore((s) => s.data)`
3. `ThreeDPlot.tsx` — `const data = useDataStore((s) => s.data)`
4. `CompassView.tsx` — `const data = useDataStore((s) => s.data)`
5. `AttitudeView.tsx` — `const data = useDataStore((s) => s.data)`
6. `FieldItem.tsx` — `const fieldData = useDataStore((s) => s.data[fieldPath])` → `useDataStore((s) => s.adjustedData[fieldPath])`
7. `PlaybackBar.tsx` — `const data = useDataStore((s) => s.data)`

**Important**: `fetchFields` and other data-mutating functions should still use `data` (not `adjustedData`). Only the read/display side switches. The `CustomFunctionEditorTab.tsx` preview also uses `data` directly — keep that as `data` since it evaluates expressions on raw timestamps.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: switch all plot consumers from data to adjustedData"
```

---

## Task 5: PlaybackBar time mode dropdown

**Files:**
- Modify: `frontend/src/components/PlaybackBar.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add time mode dropdown to PlaybackBar**

Import `useSettingsStore` and `useFileStore`. Add a dropdown next to the speed control:

```tsx
const timeMode = useSettingsStore((s) => s.timeMode)
const setTimeMode = useSettingsStore((s) => s.setTimeMode)
const files = useFileStore((s) => s.files)
const gpsAvailable = files.length > 0 && files.every((f) => f.gpsOffsetUs != null)

// In JSX, add after the speed dropdown:
<select
  className="playback-time-mode"
  value={timeMode}
  onChange={(e) => setTimeMode(e.target.value as 'boot' | 'gps')}
>
  <option value="boot">Boot Time</option>
  <option value="gps" disabled={!gpsAvailable}>
    GPS Time{!gpsAvailable ? ' (no GPS data)' : ''}
  </option>
</select>
```

- [ ] **Step 2: Add CSS**

Append to `frontend/src/index.css`:

```css
/* ---- Time Mode Dropdown ---- */
.playback-time-mode {
  background: var(--bg-btn);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  padding: 2px 4px;
  cursor: pointer;
}
.playback-time-mode:disabled {
  opacity: 0.4;
  cursor: default;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlaybackBar.tsx frontend/src/index.css
git commit -m "feat: add time mode dropdown to PlaybackBar"
```

---

## Task 6: Manual testing

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun &
cd frontend && npm run dev
```

- [ ] **Step 2: Test single file (Boot Time)**

1. Upload a .ulg file
2. Drag fields to plot — should work as before (T=0 start)
3. Verify PlaybackBar shows "Boot Time" dropdown
4. GPS Time should be disabled if file has no GPS data

- [ ] **Step 3: Test two files (Boot Time alignment)**

1. Upload a second .ulg file
2. Drag fields from both files to the same plot
3. If files have different boot times, series should be offset correctly
4. Verify time axis shows correct aligned timestamps

- [ ] **Step 4: Test GPS Time mode (if GPS data available)**

1. Load files with GPS data
2. Switch to GPS Time mode
3. Verify time axis changes
4. Verify cursor sync works across files

- [ ] **Step 5: Test mode switching**

1. Switch between Boot Time and GPS Time
2. Verify zoom resets
3. Verify cursor resets
4. Verify playback pauses

- [ ] **Step 6: Test edge cases**

1. Load GPS file, switch to GPS mode, then load non-GPS file → should auto-switch to Boot Time + toast
2. Delete all files, add new one → should work cleanly
3. Custom functions → should use main input's offset

- [ ] **Step 7: Commit any fixes**

```bash
git add -u
git commit -m "fix: time axis mode edge cases from testing"
```
