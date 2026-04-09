# Tabbed Plot Area & Sidebar Redesign Spec

## Overview

PlotJuggler 스타일의 탭 시스템 추가 및 사이드바 레이아웃 개선. Custom Function Editor를 모달에서 탭으로 변경하여 drag & drop 문제를 해결한다.

## Motivation

현재 Custom Function Editor가 모달로 열리면 사이드바가 가려져서 drag & drop이 불가능하다. 또한 Custom Series 섹션이 TopicTree와 같은 스크롤 영역에 있어서 아래로 밀려 접근이 불편하다.

## Scope

- **사이드바 분할**: TopicTree(flex:1 스크롤) + Custom Series(120px 고정 스크롤)
- **탭 시스템**: 플롯 영역에 탭 바 추가, 각 탭이 독립적인 split tree
- **에디터 탭**: Custom Function Editor를 모달 → 탭으로 변경
- **모달 제거**: 기존 CustomFunctionEditor 모달 삭제

## UI Design

### 사이드바 레이아웃

```
┌─ Sidebar (240px, flex column) ────────┐
│ [header] Topics            [◀ 접기]   │
│ [Filter...]                           │
│ ┌─ TopicTree zone (flex:1) ──────────┐│
│ │ (overflow-y: auto, 독립 스크롤)     ││
│ │ v vehicle_attitude                 ││
│ │   - q.00, q.01, rollspeed ...      ││
│ │ v sensor_accel                     ││
│ │   - x, y, z                        ││
│ └────────────────────────────────────┘│
│ ┌─ Custom Series zone (120px) ───────┐│
│ │ (overflow-y: auto, 독립 스크롤)     ││
│ │ Custom Series: [+] [✏️] [✕]        ││
│ │ my_pitch                           ││
│ │ roll_deg                           ││
│ └────────────────────────────────────┘│
└───────────────────────────────────────┘
```

- TopicTree 영역: `flex: 1` + `overflow-y: auto` + `min-height: 0`
- Custom Series 영역: `height: 120px` 고정 + `overflow-y: auto` + `flex-shrink: 0`
- 두 영역이 독립적으로 스크롤

### 탭 바

```
┌─ Tab Bar ──────────────────────────────────────────┐
│ [Tab 1 ✕] [Tab 2 ✕] [fn: my_pitch ✕]       [+]   │
└────────────────────────────────────────────────────┘
```

- 항상 표시, 기본 "Tab 1" 탭 존재
- [+] 클릭 → 새 플롯 탭 추가 (자동 번호: 기존 탭과 겹치지 않는 다음 번호 사용)
- 더블클릭으로 탭 이름 변경 (inline edit)
- 각 탭에 [✕] 닫기 버튼 (마지막 플롯 탭은 닫기 불가)
- 활성 탭 하이라이트 (밑줄 또는 배경색)

### 탭 종류

#### 플롯 탭 (type: 'plot')
- 기존 SplitLayout 렌더링
- 각 탭이 독립적인 LayoutNode 트리 보유
- 드래그, 우클릭 분할, 시리즈 관리 등 기존 기능 그대로

#### 에디터 탭 (type: 'editor')
- Custom Function Editor 렌더링 (기존 모달 에디터의 내용을 탭 형태로)
- [+] 새 함수 만들기 → 탭 이름: "New Function", Create 후 "fn: {name}"으로 업데이트
- [✏️] 편집 → 탭 이름: "fn: {name}"
- Create/Save 후 탭 유지 (사용자가 수동으로 닫기)
- 사이드바가 가려지지 않아 drag & drop 가능

## Data Structure Changes

### useLayoutStore

```typescript
// 변경
interface TabDef {
  id: string
  name: string
  type: 'plot' | 'editor'
  root: LayoutNode           // plot 탭: split tree
  undoStack: LayoutNode[]    // 탭별 undo 스택
  redoStack: LayoutNode[]    // 탭별 redo 스택
  editingFunctionId?: string  // editor 탭: 편집 중인 함수 ID (null이면 새로 만들기)
}

interface LayoutState {
  tabs: TabDef[]
  activeTabId: string
  focusedPanelId: string | null  // setActiveTab 시 null로 리셋
  colorOverrides: Record<string, string>  // 전역 — 모든 탭에서 같은 색상
  // 기존 액션들 유지 (activeTabId의 root를 대상으로 동작)
}
```

### activeRoot 셀렉터

기존 코드에서 `s.root`를 참조하는 컴포넌트가 많으므로, 하위 호환을 위해 헬퍼 셀렉터 제공:

```typescript
// useLayoutStore에 추가
export function selectActiveRoot(state: LayoutState): LayoutNode {
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  return tab?.root ?? makePlotNode()
}
```

기존 `useLayoutStore((s) => s.root)` 호출을 `useLayoutStore(selectActiveRoot)`로 변경.

영향 받는 파일:
- `AxisConfigDialog.tsx`
- `EditCurvesDialog.tsx`
- `XYPlot.tsx`
- `ThreeDPlot.tsx`
- `TimeSeriesPlot.tsx`
- `App.tsx`

### 기존 액션 변경

기존 `root`를 직접 조작하던 모든 액션이 `tabs[activeTabId].root`를 대상으로 동작하도록 변경:

- `splitPanel`, `closePanel` → 활성 플롯 탭의 root에서 수행
- `addSeries`, `removeSeries`, `clearSeries` → 활성 플롯 탭의 root
- `setPlotMode`, `setDisplayMode` 등 → 활성 플롯 탭의 root
- `undo/redo` → 활성 탭의 undoStack/redoStack 사용

### 크로스탭 액션

다음 액션은 **모든 탭**을 대상으로 동작 (활성 탭만이 아님):

- `removeSeriesFromAll(field)` → 모든 탭의 root에서 field 제거
- `renameSeriesInAll(oldField, newField)` → 모든 탭의 root에서 field 이름 변경

### 새 액션

```typescript
addTab: (type: 'plot' | 'editor', editingFunctionId?: string | null) => void
closeTab: (tabId: string) => void
setActiveTab: (tabId: string) => void  // focusedPanelId를 null로 리셋
renameTab: (tabId: string, name: string) => void
closeEditorTabForFunction: (functionId: string) => void  // 해당 함수의 에디터 탭 닫기
```

### localStorage persist

```typescript
partialize: (state) => ({
  tabs: state.tabs.map((t) => ({
    ...t,
    undoStack: [],   // undo/redo는 persist하지 않음
    redoStack: [],
  })),
  activeTabId: state.activeTabId,
  colorOverrides: state.colorOverrides,
}),
```

### localStorage 마이그레이션

기존 persist 데이터의 `root: LayoutNode`를 `tabs: [{ id, name: 'Tab 1', type: 'plot', root, undoStack: [], redoStack: [] }]`로 마이그레이션. `onRehydrateStorage`에서 모든 `tabs[].root`를 순회하여 `nextId` 갱신.

## Component Changes

### 제거
- `frontend/src/components/CustomFunction/CustomFunctionEditor.tsx` — 모달 버전

### 변경
- **App.tsx** — `.plot-area` 안에 `<TabBar>` + 탭 콘텐츠 구조. `s.root` → `selectActiveRoot` 셀렉터 사용
- **Sidebar.tsx** — TopicTree/CustomSeries 분리, `editorOpen`/`editingId` 상태 제거, [+]/[✏️] 클릭 시 `addTab('editor', ...)` 호출
- **useLayoutStore.ts** — `root` → `tabs[]` + `activeTabId`, 기존 액션 리타겟, 새 탭 액션 추가, persist 마이그레이션, undo/redo 탭별
- **useCustomFunctionStore.ts** — `removeFunction`에서 `closeEditorTabForFunction` 호출 추가
- **AxisConfigDialog.tsx** — `s.root` → `selectActiveRoot`
- **EditCurvesDialog.tsx** — `s.root` → `selectActiveRoot`
- **XYPlot.tsx** — `s.root` → `selectActiveRoot`
- **ThreeDPlot.tsx** — `s.root` → `selectActiveRoot`
- **TimeSeriesPlot.tsx** — `s.root` → `selectActiveRoot`
- **index.css** — 사이드바 split CSS, 탭 바 CSS 추가, 모달 CSS 제거

### 신규
- `frontend/src/components/TabBar.tsx` — 탭 바 (탭 클릭, 이름 편집, 닫기, [+])
- `frontend/src/components/CustomFunction/CustomFunctionEditorTab.tsx` — 탭 버전 에디터 (모달 코드 재활용, overlay/dialog 래퍼 제거)

## Component Structure

```
App.tsx
├── TopBar
├── workspace
│   ├── Sidebar
│   │   ├── sidebar-header + filter
│   │   ├── TopicTree zone (flex:1, scroll)
│   │   └── CustomSeries zone (120px, scroll)
│   ├── plot-area
│   │   ├── TabBar
│   │   └── tab-content
│   │       ├── (plot tab) → SplitLayout
│   │       └── (editor tab) → CustomFunctionEditorTab
│   └── RightSidebar
└── PlaybackBar
```

## Tab Lifecycle

### 플롯 탭
1. 앱 시작 → "Tab 1" 기본 생성
2. [+] 클릭 → "Tab N" 추가 (N = 기존 탭과 겹치지 않는 다음 번호), 활성화
3. 탭 클릭 → 활성 탭 전환, focusedPanelId 리셋
4. 더블클릭 → inline 이름 편집 (Enter 확정, Escape 취소, 빈 문자열 불가)
5. [✕] 클릭 → 탭 닫기 (마지막 플롯 탭이면 무시)

### 에디터 탭
1. Custom Series [+] 클릭 → "New Function" 에디터 탭 열기 + 활성화
2. Custom Series [✏️] 클릭 → "fn: {name}" 에디터 탭 열기 + 활성화
3. 같은 함수의 에디터 탭이 이미 열려 있으면 해당 탭으로 포커스
4. Create 클릭 → 함수 생성, 탭 이름 "fn: {name}"으로 업데이트, 탭 유지
5. Save 클릭 → 함수 업데이트, 탭 유지
6. Cancel 클릭 → 탭 닫기
7. [✕] 클릭 → 탭 닫기
8. 함수가 외부에서 삭제됨 → `closeEditorTabForFunction` 호출로 자동 닫기

## CSS Design

### 사이드바 split
```css
.sidebar-topics-zone {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.sidebar-custom-zone {
  height: 120px;
  flex-shrink: 0;
  overflow-y: auto;
  border-top: 1px solid var(--border);
}
```

### 탭 바
```css
.tab-bar {
  display: flex;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
  padding: 0 4px;
  flex-shrink: 0;
  overflow-x: auto;
}
.tab {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  margin-top: 2px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab.active {
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-color: var(--border);
  border-radius: 4px 4px 0 0;
}
.tab-close {
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
}
.tab-add {
  padding: 4px 8px;
  color: var(--text-muted);
  cursor: pointer;
  margin-left: auto;
}
```

## Edge Cases

- **마지막 플롯 탭 보호**: 플롯 탭이 1개뿐이면 닫기 불가
- **에디터 탭 중복 방지**: 같은 함수의 에디터가 이미 열려 있으면 해당 탭으로 포커스
- **함수 삭제 시**: `useCustomFunctionStore.removeFunction`이 `closeEditorTabForFunction` 호출하여 에디터 탭 자동 닫기
- **탭 이름 검증**: 빈 문자열 불가, 더블클릭 편집 시 Escape로 취소, Enter로 확정
- **탭 이름 자동 번호**: 기존 탭 이름과 겹치지 않는 다음 번호 사용 (단순 length+1 아님)
- **localStorage 마이그레이션**: 기존 `root` 데이터 → `tabs[0].root`로 자동 변환
- **onRehydrateStorage**: 모든 `tabs[].root`를 순회하여 `nextId` 갱신
- **undo/redo 범위**: 탭별 독립 스택, persist 시 제외
- **focusedPanelId**: 탭 전환 시 null로 리셋 (키보드 단축키 오작동 방지)
- **colorOverrides**: 전역 — 모든 탭에서 같은 필드는 같은 색상 (의도적 설계)
- **removeSeriesFromAll / renameSeriesInAll**: 모든 탭 대상 (활성 탭만이 아님)
- **에디터 탭에서 키보드 단축키**: focusedPanelId가 null이므로 V/H/Delete 등 무시됨
