# SOLO/NAS Mode & NAS Browser Design Spec

## Overview

WebJuggler를 두 가지 실행 모드로 분리한다. SOLO 모드(로컬 개인 사용)와 NAS 모드(팀 공유, Nextcloud 인증 + NAS 파일 브라우징).

## Modes

### SOLO Mode (기본값)

- 인증 없음 — SecurityConfig에서 모든 경로 permitAll
- 프론트엔드: 로그인 화면 스킵, 바로 앱 진입
- 파일: 로컬 드래그 드롭 업로드만
- NAS 브라우저: 숨김
- TopBar에 "NAS" 버튼 없음
- 모든 파일 작업에 고정 유저 "local" 사용

### NAS Mode

- 인증: Nextcloud OCS API로 사용자 검증 → JWT 발급
- 회원가입 없음 — 로그인만 (Nextcloud 기존 계정 사용)
- 파일: 로컬 드래그 드롭 + NAS 브라우저
- TopBar에 "NAS" 버튼 표시

## Configuration

```properties
# application.properties
webjuggler.mode=solo

# NAS 모드 설정
webjuggler.nextcloud.url=https://suvnas.cbnu.ac.kr
webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs
```

실행 시 모드 오버라이드:
```bash
./gradlew bootRun --args='--webjuggler.mode=nas'
```

### WebJugglerProperties 확장

기존 record 구조 유지:

```java
@ConfigurationProperties(prefix = "webjuggler")
public record WebJugglerProperties(
    String mode,              // "solo" | "nas", default in application.properties
    Upload upload,
    Cache cache,
    Jwt jwt,
    Browse browse,
    Nextcloud nextcloud,      // NEW
    Nas nas                   // NEW
) {
    public record Upload(String path, int maxSizeMb) {}
    public record Cache(int maxSizeMb) {}
    public record Jwt(String secret, int expirationHours) {}
    public record Browse(List<String> allowedPaths) {}
    public record Nextcloud(String url) {}   // NEW
    public record Nas(String path) {}        // NEW
}
```

`application.properties` defaults:
```properties
webjuggler.mode=solo
webjuggler.nextcloud.url=
webjuggler.nas.path=
```

## Backend Changes

### SecurityConfig 변경

모드에 따라 분기:

- **SOLO**: 모든 경로 `permitAll()`. JWT 필터 비활성화. 대신 `SoloAuthenticationFilter` 등록 — 모든 요청에 고정 유저 "local"을 SecurityContext에 설정.
- **NAS**: 기존 JWT 기반 보안 유지. `/api/auth/register` 비활성화. `/api/config` 허용.

### SOLO 모드 인증 처리

```java
// SoloAuthenticationFilter.java
// 모든 요청에 "local" 유저의 Authentication을 SecurityContext에 주입
// → FileController.upload()의 authentication.getName()이 "local" 반환
// → FileController.delete()의 소유권 체크도 "local"로 통과
```

이렇게 하면 기존 컨트롤러 코드 변경 없이 SOLO 모드 동작.

### 인증 변경 (NAS 모드)

#### /api/auth/login

Nextcloud OCS API로 검증:

```java
GET {nextcloudUrl}/ocs/v1.php/cloud/user
Headers:
  Authorization: Basic base64(username:password)
  OCS-APIRequest: true
  Accept: application/json
```

응답 구조 (JSON):
```json
{
  "ocs": {
    "meta": { "status": "ok", "statuscode": 100 },
    "data": { "id": "username", "displayname": "..." }
  }
}
```

- `meta.status == "ok"` && `meta.statuscode == 100` → 유효한 사용자. JWT 발급
- HTTP 401 또는 `meta.status != "ok"` → 로그인 실패
- 네트워크 타임아웃, 503 등 → "Nextcloud unavailable" 에러 반환

비밀번호는 검증 후 **저장하지 않음**. JWT만 발급.

#### /api/auth/register

NAS 모드에서 404 반환.

### /api/config 엔드포인트 (신규)

```java
@GetMapping("/api/config")
// permitAll
public ResponseEntity<ConfigResponse> getConfig() {
    return ResponseEntity.ok(new ConfigResponse(
        properties.mode(),
        properties.mode().equals("nas") ? properties.nextcloud().url() : null
    ));
}

record ConfigResponse(String mode, String nextcloudUrl) {}
```

### NAS 시작 시 검증

NAS 모드에서 서버 시작 시:
- `nas.path` 존재 여부 확인
- 접근 불가 시 WARNING 로그 (서버는 시작되되, browse 요청 시 503)

### NAS Browse API (NAS 모드 전용)

#### GET /api/nas/browse

```
GET /api/nas/browse?path=
GET /api/nas/browse?path=2026-04-10
GET /api/nas/browse?path=2026-04-10/swarm_kmk_120746_25drones
```

응답:
```json
{
  "path": "2026-04-10/swarm_kmk_120746_25drones",
  "entries": [
    { "name": "drone_60_03_07_46.ulg", "type": "file", "size": 4053364 },
    { "name": "drone_67_03_07_46.ulg", "type": "file", "size": 3891024 }
  ],
  "summary": {
    "session_id": "120746_25drones",
    "drone_count": 25,
    "date": "2026-04-10"
  }
}
```

- `nasPath + "/" + path` 디렉토리 목록 반환
- **path traversal 방지**: `..` 포함 시 400, resolve 후 nasPath 밖이면 400
- `summary.json` 있으면 파싱해서 `summary` 필드에 포함, 없으면 null
- 날짜 폴더 역순 정렬 (최신 먼저)
- SOLO 모드에서 호출 시 404
- NAS 마운트 없으면 503

#### POST /api/nas/open

```json
{ "paths": ["2026-04-10/swarm_.../drone_60.ulg", "2026-04-10/swarm_.../drone_67.ulg"] }
```

응답:
```json
{
  "files": [
    { "fileId": "uuid-1", "filename": "drone_60_03_07_46.ulg", "size": 4053364, "status": "READY" },
    { "fileId": "uuid-2", "filename": "drone_67_03_07_46.ulg", "size": 3891024, "status": "READY" }
  ]
}
```

**파일 저장 전략: NAS 경로 직접 참조 (복사 안 함)**

- `FileEntity`에 `source` 필드 추가: `'upload'` | `'nas'`
- NAS 소스 파일: `storagePath`에 NAS 절대 경로 저장 (예: `/mnt/nas_storage/Share/flight_logs/2026-04-10/.../drone_60.ulg`)
- **삭제 보호**: `source == 'nas'`인 파일은 `FileEntity` 레코드만 삭제, 실제 파일은 건드리지 않음
- 파싱: NAS 경로에서 직접 읽기 (기존 ParsedFileCache 활용)
- **중복 방지**: NAS 상대 경로(`nasRelativePath` 필드)로 중복 체크. 같은 NAS 파일이 이미 열려있으면 기존 fileId 반환
- path traversal 방지

### FileEntity 확장

```java
@Entity
public class FileEntity {
    // 기존 필드...
    private String source = "upload";       // "upload" | "nas"
    private String nasRelativePath;         // NAS 상대 경로 (중복 체크용), null이면 업로드 파일
}
```

### FileService.delete() 변경

```java
public void delete(String fileId, String username) {
    FileEntity entity = ...;
    if ("nas".equals(entity.getSource())) {
        // NAS 파일: DB 레코드만 삭제, 파일은 건드리지 않음
        repository.delete(entity);
    } else {
        // 업로드 파일: 기존 로직 (파일 삭제 + DB 삭제)
        Files.deleteIfExists(Path.of(entity.getStoragePath()));
        repository.delete(entity);
    }
}
```

## Frontend Changes

### /api/config 호출

앱 시작 시 (로그인 전) `/api/config` 호출:

```typescript
// api/config.ts
export async function getConfig(): Promise<{ mode: 'solo' | 'nas'; nextcloudUrl: string | null }> {
  const res = await fetch('/api/config')
  return res.json()
}
```

### useConfigStore (신규)

```typescript
interface ConfigState {
  mode: 'solo' | 'nas'
  nextcloudUrl: string | null
  loaded: boolean
  loadConfig: () => Promise<void>
}
```

### App.tsx 분기

```typescript
const { mode, loaded } = useConfigStore()
const token = useAuthStore((s) => s.token)

if (!loaded) return <div>Loading...</div>

if (mode === 'nas' && !token) return <LoginPage hideRegister />
// SOLO 모드: 로그인 스킵, 바로 앱
```

### LoginPage 변경

- `hideRegister` prop 추가 — NAS 모드에서 회원가입 버튼/링크 숨김

### 프론트엔드 401 처리

`client.ts`의 401 핸들러를 모드 인식:
- NAS 모드: 기존 동작 (토큰 클리어 + 로그인 리다이렉트)
- SOLO 모드: 401 무시 (발생하면 안 됨, 발생 시 콘솔 경고만)

### TopBar 변경

- NAS 모드에서 "NAS" 버튼 추가 (Upload 버튼 옆)
- 클릭 시 NAS 브라우저 탭 열기 (이미 열려있으면 포커스)

### TabDef 확장

```typescript
type: 'plot' | 'editor' | 'nas-browser'
```

- `addTab` 타입 시그니처 확장
- NAS 브라우저 탭은 persist 안 함 (partialize에서 필터)
- 중복 방지: NAS 브라우저 탭이 이미 열려있으면 포커스

### NAS Browser 탭 컴포넌트

`frontend/src/components/NasBrowser/NasBrowser.tsx`

- 트리 구조: 날짜 → 세션 → 파일
- Lazy load: 폴더 클릭 시 `/api/nas/browse?path=...` 호출
- 파일 선택: 클릭 = 단일, Ctrl = 토글, Shift = 범위 (기존 FieldItem 선택 패턴)
- 선택된 파일: `bg-selected` 스타일 하이라이트
- 세션 폴더: `summary.json` 데이터로 드론 수, 시간 요약 표시
- 하단 고정: "Open N files" 버튼 → POST `/api/nas/open` → 파일 로드 → Topics에 나타남
- .ulg 파일만 선택 가능 (다른 파일은 표시하되 선택 불가)

### App.tsx 탭 렌더링 확장

```tsx
{activeTab?.type === 'nas-browser' ? (
  <NasBrowser tabId={activeTab.id} />
) : activeTab?.type === 'editor' ? (
  <CustomFunctionEditorTab ... />
) : (
  <SplitLayout node={root} />
)}
```

## Component Structure

### 백엔드
```
backend/src/main/java/com/webjuggler/
├── config/
│   ├── WebJugglerProperties.java  — mode, nextcloud, nas 추가
│   ├── SecurityConfig.java        — SOLO: permitAll + SoloAuthFilter, NAS: JWT
│   └── SoloAuthenticationFilter.java — SOLO 모드 고정 "local" 유저 주입 (NEW)
├── auth/
│   └── AuthController.java        — NAS: Nextcloud OCS 검증, register 비활성화
├── nas/
│   ├── NasController.java         — browse, open 엔드포인트 (NEW)
│   └── NasBrowseResponse.java     — 응답 DTO (NEW)
├── file/
│   ├── FileEntity.java            — source, nasRelativePath 필드 추가
│   └── FileService.java           — delete에서 NAS 파일 보호
└── data/
    └── DataController.java        — /api/config 엔드포인트 추가
```

### 프론트엔드
```
frontend/src/
├── api/
│   ├── config.ts                   — getConfig() (NEW)
│   └── nas.ts                      — browse(), openFiles() (NEW)
├── components/
│   ├── NasBrowser/
│   │   ├── NasBrowser.tsx          — 탭 컴포넌트 (NEW)
│   │   └── NasFileItem.tsx         — 파일/폴더 항목 (NEW)
│   ├── LoginPage.tsx               — hideRegister prop 추가
│   └── TopBar.tsx                  — NAS 버튼 추가
├── stores/
│   └── useConfigStore.ts           — mode 저장 (NEW)
```

## Edge Cases

- **NAS 마운트 없음**: `/api/nas/browse` 시 503 + "NAS storage not available"
- **NAS 모드 시작 시 마운트 검증**: 없으면 WARNING 로그 (서버는 시작)
- **Nextcloud 다운**: 로그인 실패 + "Nextcloud unavailable" 토스트
- **이미 열린 NAS 파일**: `nasRelativePath`로 중복 체크, 기존 fileId 반환
- **대량 파일 열기**: 순차 처리, 프론트에서 프로그레스 표시
- **SOLO 모드에서 NAS API 호출**: 404
- **path traversal**: `..` 및 nasPath 밖 경로 거부 (400)
- **NAS 파일 삭제**: FileEntity만 삭제, 실제 파일 보호
- **NAS 브라우저 탭 중복**: 이미 열려있으면 포커스
- **JWT 만료 (NAS)**: 재로그인 필요 (Nextcloud 비밀번호 재입력)
- **SOLO 모드 401 방지**: SoloAuthFilter가 모든 요청에 인증 주입, 401 발생 불가
