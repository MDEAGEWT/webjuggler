# Custom Functions & Function Library Design Spec

## Overview

PlotJuggler의 Custom Function 기능을 WebJuggler에 구현한다. 사용자가 수학 표현식을 작성하거나 빌트인 함수 라이브러리에서 선택하여 기존 시리즈로부터 새로운 커스텀 시리즈를 생성할 수 있다.

## Scope

- **수식 에디터**: mathjs 기반, 포인트별 평가
- **함수 라이브러리**: 10개 템플릿 (derivative 2종, integral, quat→euler 3종, rad_to_deg, remove_offset, dist_2d, dist_3d)
- **사이드바 통합**: Custom Series 섹션에서 추가/편집/삭제
- **Persist**: localStorage에 커스텀 함수 정의 저장
- **Undo/redo**: v1에서는 미지원

## UI Design

### 사이드바 Custom Series 섹션

TopicTree 아래에 위치:

```
Custom Series: [+] [✏️] [🗑]
├── my_custom_pitch
├── roll_derivative
└── distance_xy
```

- [+] → Custom Function Editor 모달 열기
- [✏️] → 선택한 커스텀 시리즈 편집
- [🗑] → 선택한 커스텀 시리즈 삭제 (해당 시리즈가 포함된 모든 플롯 패널에서도 제거)
- 커스텀 시리즈를 드래그하여 플롯에 추가

#### 드래그 구현

- 동일한 `application/webjuggler-fields` MIME 타입 사용
- 드래그 데이터: `["custom:my_custom_pitch"]` 형태
- PlotPanel.handleDrop에서 `"custom:"` 접두어 키는 `fetchFields` 호출을 스킵하고, 대신 `evaluateFunction`으로 데이터 생성

#### 커스텀 시리즈 라벨

- 플롯 레전드, 커서 오버레이에서 커스텀 시리즈 표시: `"[fn] my_custom_pitch"` 형태
- `seriesLabel`, `displayName` 등 기존 라벨 함수에 `key.startsWith('custom:')` 가드 추가

#### 파일 삭제 시 동작

- 커스텀 시리즈가 참조하는 입력 시리즈의 파일이 삭제되면, 커스텀 시리즈를 비활성화 (회색 처리 + 툴팁 "입력 데이터 없음")
- data store에서 해당 커스텀 시리즈 데이터 제거

### Custom Function Editor 모달

```
┌─ Custom Function Editor ──────────────────────────┐
│                                                     │
│  Name: [my_custom_pitch          ]                 │
│                                                     │
│  Input timeseries (→ time, value):                 │
│  ┌─────────────────────────────────────────┐       │
│  │ drag & drop here                        │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  Additional source timeseries (→ v1, v2, v3...):   │
│  ┌─────────────────────────────────────────┐  [🗑] │
│  │  v1: vehicle_attitude/q[1]              │       │
│  │  v2: vehicle_attitude/q[2]              │       │
│  │  v3: vehicle_attitude/q[3]              │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  Function library:                                  │
│  ┌─────────────────────────────────────────┐       │
│  │  backward_difference_derivative         │       │
│  │  central_difference_derivative          │       │
│  │  integral                               │       │
│  │ ▶quat_to_pitch◀                        │       │
│  │  quat_to_roll                           │       │
│  │  quat_to_yaw                            │       │
│  │  rad_to_deg                             │       │
│  │  remove_offset                          │       │
│  │  dist_2d                                │       │
│  │  dist_3d                                │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  Expression:                                        │
│  ┌─────────────────────────────────────────┐       │
│  │ w = value                               │       │
│  │ x = v1                                  │       │
│  │ y = v2                                  │       │
│  │ z = v3                                  │       │
│  │ dcm20 = 2 * (x * z - w * y)            │       │
│  │ pitch = asin(-dcm20)                    │       │
│  │ pitch                                   │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  [에러 메시지 표시 영역 — 빨간 텍스트]              │
│                                                     │
│              [ Cancel ]  [ Create ]                 │
└─────────────────────────────────────────────────────┘
```

- Function library에서 선택 → Expression 자동 채움
- Expression은 직접 편집 가능 (mathjs 문법)
- 입력 시리즈는 사이드바 TopicTree에서 drag & drop (동일 MIME 타입)
- 모달이 드롭 타겟으로 등록 — 드롭 영역(input / additional)에 따라 매핑
- Additional source의 v1, v2, v3... 순서는 드롭 순서로 결정
- 편집 모드에서는 [Create] 대신 [Save] 표시
- **수식 검증**: [Create/Save] 클릭 시 mathjs.compile() 시도, 실패 시 에러 영역에 에러 메시지 표시
- **이름 검증**: 영문, 숫자, 언더스코어, 하이픈만 허용. 빈 문자열/중복 이름 불가

## Data Flow

```
[사용자가 Custom Function 생성]
         │
         ▼
[입력 시리즈 데이터 가져오기]
  data["fileId:topic/field"] → { timestamps, values }
  (아직 fetch 안 됐으면 fetchFields 트리거)
         │
         ▼
[mathjs.compile()로 수식 1회 컴파일]
  const compiled = mathjs.compile(expression)
         │
         ▼
[컴파일된 수식으로 포인트별 평가]
  for each i:
    scope = {
      time:        timestamps[i],
      value:       values[i],
      v1..vN:      additionalSeries[n] at nearest timestamp (binary search),
      prev_value:  values[i-1]   (i=0일 때: NaN),
      prev_time:   timestamps[i-1] (i=0일 때: NaN),
      next_value:  values[i+1]   (마지막일 때: NaN),
      next_time:   timestamps[i+1] (마지막일 때: NaN),
      acc:         누적 변수 (초기값 0, 매 포인트 결과를 다음 포인트의 acc로 전달),
      first_value: values[0]
    }
    result[i] = compiled.evaluate(scope)
    if (isNaN(result[i])) result[i] = NaN  // 경계 조건 전파
         │
         ▼
[결과를 data store에 저장]
  key: "custom:my_custom_pitch"
  value: { timestamps: Float64Array, values: Float64Array }
         │
         ▼
[사이드바 Custom Series 목록에 표시]
  → 드래그하여 플롯에 추가
```

### 성능

- `mathjs.compile(expression)`을 1회 호출, 이후 `compiled.evaluate(scope)`를 포인트별 호출
- 파싱 오버헤드 제거로 50K~200K 포인트에서 ~50ms 수준 유지
- `mathjs/number` (number-only 빌드) 사용하여 번들 크기 최소화

### 타임스탬프 정렬

- 메인 입력 시리즈의 timestamps를 기준으로 사용
- 추가 시리즈(v1, v2...)는 binary search로 nearest-neighbor lookup
- 결과 시리즈의 timestamps = 메인 입력 시리즈의 timestamps

### 재계산

- 입력 시리즈 데이터가 변경되면 커스텀 시리즈 자동 재계산
- 파일이 삭제되어 입력 시리즈가 사라지면 커스텀 시리즈 비활성화

### `"custom:"` 키 가드가 필요한 파일들

기존 코드에서 `"fileId:topic/field"` 형식을 가정하는 곳에 `key.startsWith('custom:')` 가드 추가:

- `useDataStore.ts` — `fetchFields`: custom 키는 fetch 스킵
- `useDataStore.ts` — `clearFileData`: custom 키는 파일 삭제 시 별도 처리
- `TimeSeriesPlot.tsx` — `seriesLabel` / `shortLabel`
- `PlotLegend.tsx` — `displayName`
- `CompassView.tsx`, `AttitudeView.tsx` — field key 파싱

## Function Library

### 단일 입력 함수 (value만 사용)

#### backward_difference_derivative
```
(value - prev_value) / (time - prev_time)
```
i=0: NaN (prev_value가 NaN이므로 자연스럽게 NaN 전파)

#### central_difference_derivative
```
(next_value - prev_value) / (next_time - prev_time)
```
i=0, i=last: NaN 전파

#### integral
```
acc + value * (time - prev_time)
```
i=0: acc=0, `(time - prev_time)` = NaN → 결과 NaN. 특수 처리: i=0일 때 결과를 0으로 고정하고 acc=0으로 시작.

#### rad_to_deg
```
value * 180 / pi
```

#### remove_offset
```
value - first_value
```

### 다중 입력 함수 (value + 추가 시리즈)

#### quat_to_pitch (value=w, v1=x, v2=y, v3=z)
```
asin(-2 * (v1 * v3 - value * v2))
```

#### quat_to_roll (value=w, v1=x, v2=y, v3=z)
```
atan2(2 * (value * v1 + v2 * v3), 1 - 2 * (v1^2 + v2^2))
```

#### quat_to_yaw (value=w, v1=x, v2=y, v3=z)
```
atan2(2 * (value * v3 + v1 * v2), 1 - 2 * (v2^2 + v3^2))
```

#### dist_2d (value=x1, v1=y1, v2=x2, v3=y2)
```
sqrt((value - v2)^2 + (v1 - v3)^2)
```

#### dist_3d (value=x1, v1=y1, v2=z1, v3=x2, v4=y2, v5=z2)
```
sqrt((value - v3)^2 + (v1 - v4)^2 + (v2 - v5)^2)
```

## Store Design

### useCustomFunctionStore (Zustand + persist)

```typescript
interface CustomFunctionDef {
  id: string;                    // uuid
  name: string;                  // 영문/숫자/언더스코어/하이픈만 허용
  expression: string;            // mathjs 표현식
  mainInput: string;             // "fileId:topic/field"
  additionalInputs: string[];    // ["fileId:topic/field", ...]
  libraryFunction?: string;      // 라이브러리 함수 이름 (있으면)
}

interface CustomFunctionStore {
  functions: Record<string, CustomFunctionDef>;

  addFunction: (def: Omit<CustomFunctionDef, 'id'>) => string;
  updateFunction: (id: string, def: Partial<CustomFunctionDef>) => void;
  removeFunction: (id: string) => void;
  // removeFunction 시 useLayoutStore의 모든 패널 series에서 해당 키 제거

  evaluateFunction: (id: string) => void;
  evaluateAll: () => void;
  // 결과는 useDataStore의 data map에 "custom:{name}" 키로 저장
}
```

### useDataStore 변경

- `fetchFields`: `"custom:"` 접두어 키는 스킵 (API 호출 안 함)
- `clearFileData`: `"custom:"` 키는 건드리지 않음 (별도 라이프사이클)
- 커스텀 시리즈 데이터는 `evaluateFunction`이 직접 data map에 기록

### useLayoutStore 변경

- `removeFunction` 호출 시 모든 패널의 `series` 배열에서 해당 `"custom:{name}"` 키 제거

## Component Structure

```
frontend/src/
├── components/
│   ├── Sidebar/
│   │   └── CustomSeriesSection.tsx    # [+][✏️][🗑] 리스트 + 드래그 소스
│   └── CustomFunction/
│       ├── CustomFunctionEditor.tsx    # 모달 에디터 (드롭 타겟)
│       ├── FunctionLibrary.tsx         # 함수 라이브러리 리스트
│       └── functionTemplates.ts       # 10개 함수 정의
├── stores/
│   └── useCustomFunctionStore.ts      # 커스텀 함수 정의 + 평가
```

## Dependencies

- `mathjs` — `mathjs/number` (number-only 빌드) 사용, 번들 크기 최소화

## Edge Cases

- **순환 참조**: 커스텀 시리즈가 다른 커스텀 시리즈를 참조하는 것은 v1에서는 허용하지 않음
- **누락 데이터**: 추가 시리즈에서 nearest-neighbor lookup 실패 시 해당 포인트는 NaN
- **빈 입력**: 입력 시리즈가 아직 fetch되지 않았으면 fetch 먼저 트리거
- **수식 오류**: [Create/Save] 클릭 시 compile 실패하면 에디터 하단에 에러 메시지 표시
- **이름 규칙**: 영문/숫자/언더스코어/하이픈만 허용, 빈 문자열/중복 불가
- **경계 조건**: prev_value/next_value가 없는 포인트에서는 NaN 전파 (integral은 i=0에서 0으로 특수 처리)
- **커스텀 시리즈 삭제**: data store에서 데이터 제거 + layout store의 모든 패널 series에서 키 제거
- **파일 삭제**: 입력 시리즈의 파일이 삭제되면 커스텀 시리즈 비활성화 (회색 처리)
