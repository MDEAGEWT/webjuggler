# Time Axis Modes Design Spec

## Overview

멀티파일 시간 정렬을 위한 시간축 모드 시스템. Boot Time (기본)과 GPS Time 모드를 지원하여 여러 ULog 파일을 정확한 시간 기준으로 비교할 수 있게 한다.

## Motivation

현재 모든 파일이 T=0부터 시작하는 상대 시간을 사용하므로, 두 파일을 같은 플롯에 놓으면 시간이 겹쳐서 의미 있는 비교가 불가능하다. ULog 파일에는 절대 시간 정보(부트 타임스탬프, GPS UTC)가 포함되어 있으므로 이를 활용한다.

## Time Axis Modes

| 모드 | 조건 | 동작 |
|------|------|------|
| **Boot Time** | 항상 가능 (기본값) | 가장 빠른 fileStartTime 기준 T=0, 나머지 파일은 오프셋 적용 |
| **GPS Time** | 모든 로드된 파일에 GPS 데이터 있을 때만 활성 | GPS UTC 기준, 가장 빠른 GPS 시간을 T=0으로 표시 |

- 단일 파일일 때 Boot Time = 기존 Relative와 동일 (T=0부터 시작)
- GPS Time 모드는 하나라도 GPS 데이터가 없는 파일이 있으면 비활성화 (드롭다운에서 disabled + 툴팁)

## GPS Source Priority

파일별로 GPS 오프셋을 추출할 때 다음 우선순위:

1. **`sensor_gnss_relative.time_utc_usec`** — GNSS UTC 마이크로초. 우선 사용
2. **`piksi_rtk`** — RTK GPS 데이터. `time_utc_usec` 필드가 있으면 사용 (TOW는 GPS 주차 정보 없이 UTC 변환 불가하므로 `time_utc_usec` 필드 필요)
3. **없음** — 해당 파일은 GPS 미지원

GPS 오프셋 계산: 해당 토픽의 첫 번째 유효 메시지에서 `bootTimestamp`와 `gpsTimestamp`의 차이를 구함.

```
gpsOffsetUs = gpsTimestamp_us - bootTimestamp_us
```

참고: `piksi_rtk.tow`는 GPS time of week (주간 시간)으로, GPS 주차(week number) 없이는 UTC 절대 시간으로 변환할 수 없다. 따라서 UTC 마이크로초 필드(`time_utc_usec`)를 사용한다.

## Backend Changes

### `/api/files/{id}/info` 응답 확장

현재 `InfoResponse` 레코드에 필드 추가:

```json
{
  "fileId": "...",
  "filename": "...",
  "startTimeMicros": 1712700000000000,
  "gpsOffsetUs": 1712700005000000
}
```

- `startTimeMicros`: ULog 파일 헤더의 `timestamp` 필드 (int64, 부트 마이크로초). JavaScript Number로 안전 (2^53 이내)
- `gpsOffsetUs`: GPS-boot 시간 차이 (마이크로초). null이면 GPS 미지원. 계산: `gpsUtcUs - bootUs` (첫 번째 유효 GPS 메시지 기준)

### ULogParser / ParsedFile 변경

- `ParsedFile`에 `fileStartTime` (기존 내부 필드) + `gpsOffsetUs` 추가
- 파싱 완료 후 GPS 오프셋 추출:
  1. `sensor_gnss_relative` 토픽에서 `time_utc_usec` 필드 + 해당 메시지의 boot timestamp → 차이 계산
  2. 없으면 `piksi_rtk` 토픽에서 `time_utc_usec` 필드 시도
  3. 둘 다 없으면 `gpsOffsetUs = null`

### InfoResponse 변경

`backend/.../data/InfoResponse.java`에 `startTimeMicros` (long)과 `gpsOffsetUs` (Long, nullable) 필드 추가.

## Frontend Changes

### 오프셋 적용 전략: Data Store 레벨

**핵심 결정: 오프셋을 개별 컴포넌트가 아닌 data store에서 적용한다.**

이유: TimeSeriesPlot, XYPlot, ThreeDPlot, CompassView, AttitudeView, FieldItem, PlaybackBar 등 모든 timestamp 소비자가 오프셋을 알 필요 없이 이미 조정된 timestamps를 사용한다.

구현: `useDataStore`에 **derived/adjusted data** 셀렉터를 추가. 원본 데이터는 그대로 유지하고, 소비자는 adjusted 셀렉터로 접근.

```typescript
// useDataStore 확장
interface DataState {
  data: Record<string, FieldData>         // 원본 (부트 기준 상대)
  adjustedData: Record<string, FieldData> // 오프셋 적용된 데이터
  recomputeAdjusted: () => void           // 모드/파일 변경 시 재계산
}
```

`adjustedData`는 `data`와 같은 구조이지만 timestamps에 파일별 오프셋이 더해진 상태. 소비자 컴포넌트는 `data` 대신 `adjustedData`를 사용.

재계산 트리거:
- 시간 모드 변경 시
- 파일 추가/삭제 시 (earliest startTime 변경)
- 새 필드 데이터 fetch 완료 시

### useFileStore 확장

```typescript
interface LoadedFile {
  fileId: string
  filename: string
  shortName: string
  topics: Topic[]
  startTimeMicros: number    // ULog 부트 시작 시간 (마이크로초)
  gpsOffsetUs: number | null // GPS-boot 차이 (마이크로초), null이면 GPS 미지원
}
```

파일 로드 시 `/api/files/{id}/info`에서 `startTimeMicros`, `gpsOffsetUs` 받아서 저장.

### useSettingsStore 확장

```typescript
timeMode: 'boot' | 'gps'
setTimeMode: (mode: 'boot' | 'gps') => void
```

기본값: `'boot'`

### 오프셋 계산 유틸리티 (`frontend/src/utils/timeOffset.ts`)

```typescript
function getFileTimeOffset(
  fileId: string,
  files: LoadedFile[],
  timeMode: 'boot' | 'gps',
): number {
  const file = files.find((f) => f.fileId === fileId)
  if (!file) return 0

  if (timeMode === 'boot') {
    const earliest = Math.min(...files.map((f) => f.startTimeMicros))
    return (file.startTimeMicros - earliest) / 1_000_000
  }

  if (timeMode === 'gps' && file.gpsOffsetUs != null) {
    // GPS 모드: 부트 상대 시간 + startTimeMicros + gpsOffsetUs = GPS UTC 절대 시간
    // 표시를 위해 가장 빠른 GPS 절대 시간을 빼서 T=0 기준으로
    const gpsAbsolute = (us: number) => us + (file.gpsOffsetUs ?? 0)
    const allGpsStarts = files
      .filter((f) => f.gpsOffsetUs != null)
      .map((f) => gpsAbsolute(f.startTimeMicros))
    const earliestGps = Math.min(...allGpsStarts)
    return (gpsAbsolute(file.startTimeMicros) - earliestGps) / 1_000_000
  }

  return 0
}

function fileIdFromKey(compositeKey: string): string {
  if (compositeKey.startsWith('custom:')) return ''
  const idx = compositeKey.indexOf(':')
  return idx >= 0 ? compositeKey.substring(0, idx) : ''
}
```

### 소비자 컴포넌트 변경

모든 컴포넌트에서 `useDataStore((s) => s.data)` → `useDataStore((s) => s.adjustedData)` 변경:

- `TimeSeriesPlot.tsx`
- `XYPlot.tsx`
- `ThreeDPlot.tsx`
- `CompassView.tsx`
- `AttitudeView.tsx`
- `FieldItem.tsx`
- `PlaybackBar.tsx`

오프셋 로직은 data store 내부에서만 처리하므로 각 컴포넌트는 코드 변경 최소화 (import 변경 수준).

### Custom Function evaluator

커스텀 함수는 **원본 데이터(`data`)에서 평가**한다 (오프셋 미적용). 결과도 원본 기준 timestamps로 저장. `adjustedData` 재계산 시 커스텀 시리즈의 오프셋은 **main input 시리즈의 fileId 기준으로 적용**.

이를 위해 `CustomFunctionDef`에서 `mainInput`의 fileId를 추출하여 커스텀 시리즈의 오프셋을 결정:

```typescript
// adjustedData 재계산 시:
for (const [key, fd] of Object.entries(data)) {
  if (key.startsWith('custom:')) {
    // 커스텀 시리즈: main input의 fileId에서 오프셋 상속
    const fn = customFunctions.find((f) => `custom:${f.name}` === key)
    const mainFileId = fn ? fileIdFromKey(fn.mainInput) : ''
    offset = getFileTimeOffset(mainFileId, files, timeMode)
  } else {
    offset = getFileTimeOffset(fileIdFromKey(key), files, timeMode)
  }
  adjustedData[key] = {
    timestamps: Float64Array.from(fd.timestamps, (t) => t + offset),
    values: fd.values,  // values는 변경 없음
  }
}
```

### PlaybackBar 변경

- 시간 모드 드롭다운 추가: `[Boot Time ▾]`
- GPS 가능 시: `[Boot Time ▾]` 클릭하면 `Boot Time ✓` / `GPS Time` 옵션
- GPS 불가 시: GPS Time 항목 disabled + 툴팁 "All files must have GPS data"

### 모드 전환 시 상태 처리

- **줌 상태 리셋**: 시간 모드 변경 시 `useZoomStore` 리셋 (xMin/xMax가 새 좌표계에서 무의미)
- **플레이백 일시정지**: 재생 중 모드 전환 시 일시정지
- **커서 리셋**: `useCursorStore.timestamp`을 null로 리셋

## UI Design

### PlaybackBar 드롭다운

```
[◀] [▶] ━━━━●━━━━━━━━━ 23.5s / 69.8s  [Boot Time ▾] [1x ▾]
                                         ├─ Boot Time ✓
                                         └─ GPS Time (disabled)
```

## Edge Cases

- **단일 파일**: Boot Time에서 오프셋 = 0 (기존과 동일)
- **커스텀 시리즈**: main input 시리즈의 fileId에서 오프셋 상속
- **파일 추가/삭제 시**: earliest startTime 변경 → adjustedData 전체 재계산. GPS 가용성 재확인
- **GPS Time 모드에서 GPS 없는 파일 추가**: 자동으로 Boot Time 모드로 전환 + toast 알림
- **빈 GPS 데이터**: GPS 토픽은 있지만 유효 메시지가 0개인 경우 → GPS 미지원 처리
- **모드 전환**: 줌 리셋, 플레이백 일시정지, 커서 리셋
- **Float64 정밀도**: startTimeMicros (부트 마이크로초)와 gpsOffsetUs는 2^53 이내로 JavaScript Number 안전. GPS UTC 마이크로초 (~1.7e15)도 2^53 (9e15) 이내

## Component Changes

### Backend
- `InfoResponse.java` — `startTimeMicros` (long), `gpsOffsetUs` (Long nullable) 필드 추가
- `DataController.java` — info 응답에 startTimeMicros, gpsOffsetUs 포함
- `ULogParser.java` — fileStartTime 노출
- `ParsedFile.java` 또는 별도 클래스 — GPS 오프셋 추출 로직 (sensor_gnss_relative, piksi_rtk 스캔)

### Frontend 변경
- `frontend/src/api/files.ts` — info 응답 타입에 startTimeMicros, gpsOffsetUs 추가
- `frontend/src/stores/useFileStore.ts` — LoadedFile에 startTimeMicros, gpsOffsetUs 저장
- `frontend/src/stores/useSettingsStore.ts` — timeMode 추가
- `frontend/src/stores/useDataStore.ts` — adjustedData + recomputeAdjusted 추가
- `frontend/src/components/PlaybackBar.tsx` — 시간 모드 드롭다운
- `frontend/src/components/PlotArea/TimeSeriesPlot.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/components/PlotArea/XYPlot.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/components/PlotArea/ThreeDPlot.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/components/PlotArea/CompassView.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/components/PlotArea/AttitudeView.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/components/Sidebar/FieldItem.tsx` — `s.data` → `s.adjustedData`
- `frontend/src/index.css` — 드롭다운 CSS

### Frontend 신규
- `frontend/src/utils/timeOffset.ts` — getFileTimeOffset, fileIdFromKey 유틸리티
