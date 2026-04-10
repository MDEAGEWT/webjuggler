# SOLO/NAS Mode & NAS Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SOLO mode (no auth, local only) and NAS mode (Nextcloud auth + NAS file browsing) with runtime mode switching via application.properties.

**Architecture:** Backend mode property controls SecurityConfig (permitAll vs JWT), AuthController (Nextcloud OCS vs DB), and NasController (NAS browse/open). Frontend reads mode from /api/config, skips login in SOLO, hides register in NAS, and renders NAS Browser as a tab.

**Tech Stack:** Spring Boot 3, Java 21, React 18, TypeScript, Zustand

**Spec:** `docs/superpowers/specs/2026-04-10-solo-nas-mode-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/.../config/WebJugglerProperties.java` | Add mode, nextcloud, nas fields |
| Modify | `backend/.../config/SecurityConfig.java` | SOLO: permitAll + SoloAuthFilter, NAS: JWT + disable register |
| Create | `backend/.../config/SoloAuthenticationFilter.java` | Inject fixed "local" user in SOLO mode |
| Modify | `backend/.../auth/AuthController.java` | NAS: Nextcloud OCS login, disable register |
| Modify | `backend/.../file/FileEntity.java` | Add source, nasRelativePath fields |
| Modify | `backend/.../file/FileService.java` | NAS file open, delete protection |
| Create | `backend/.../nas/NasController.java` | browse, open endpoints |
| Create | `backend/.../data/ConfigController.java` | /api/config endpoint |
| Modify | `backend/src/main/resources/application.yml` | Add mode, nextcloud, nas defaults |
| Create | `frontend/src/api/config.ts` | getConfig() |
| Create | `frontend/src/api/nas.ts` | browse(), openFiles() |
| Create | `frontend/src/stores/useConfigStore.ts` | mode storage |
| Modify | `frontend/src/api/client.ts` | Mode-aware 401 handling |
| Modify | `frontend/src/App.tsx` | Mode-based login/skip + NAS tab rendering |
| Modify | `frontend/src/components/LoginPage.tsx` | hideRegister prop |
| Modify | `frontend/src/components/TopBar.tsx` | NAS button, hide logout in SOLO |
| Create | `frontend/src/components/NasBrowser/NasBrowser.tsx` | NAS browser tab |
| Modify | `frontend/src/stores/useLayoutStore.ts` | Add 'nas-browser' tab type |

---

## Task 1: Backend — mode property + config endpoint

**Files:**
- Modify: `backend/.../config/WebJugglerProperties.java`
- Create: `backend/.../data/ConfigController.java`
- Modify: `backend/src/main/resources/application.yml`

- [ ] **Step 1: Extend WebJugglerProperties**

Add `mode`, `Nextcloud`, and `Nas` nested records:

```java
@ConfigurationProperties(prefix = "webjuggler")
public record WebJugglerProperties(
    String mode,
    Upload upload,
    Cache cache,
    Jwt jwt,
    Browse browse,
    Nextcloud nextcloud,
    Nas nas
) {
    public record Upload(String path, int maxSizeMb) {}
    public record Cache(int maxSizeMb) {}
    public record Jwt(String secret, int expirationHours) {}
    public record Browse(List<String> allowedPaths) {}
    public record Nextcloud(String url) {}
    public record Nas(String path) {}
}
```

- [ ] **Step 2: Add defaults to application.yml**

```yaml
webjuggler:
  mode: solo
  # ... existing fields ...
  nextcloud:
    url: ""
  nas:
    path: ""
```

- [ ] **Step 3: Create ConfigController**

```java
package com.webjuggler.data;

import com.webjuggler.config.WebJugglerProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class ConfigController {

    private final WebJugglerProperties properties;

    public ConfigController(WebJugglerProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/api/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        return ResponseEntity.ok(Map.of(
            "mode", properties.mode(),
            "nextcloudUrl", properties.nextcloud() != null ? properties.nextcloud().url() : ""
        ));
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add mode property and /api/config endpoint"
```

---

## Task 2: Backend — SOLO mode security (SoloAuthenticationFilter)

**Files:**
- Create: `backend/.../config/SoloAuthenticationFilter.java`
- Modify: `backend/.../config/SecurityConfig.java`

- [ ] **Step 1: Create SoloAuthenticationFilter**

```java
package com.webjuggler.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.Collections;

public class SoloAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {
        // Always set "local" user — SOLO mode has no real auth
        var auth = new UsernamePasswordAuthenticationToken(
                "local", null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);
        filterChain.doFilter(request, response);
    }
}
```

- [ ] **Step 2: Update SecurityConfig**

Inject `WebJugglerProperties` and branch on mode:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final WebJugglerProperties properties;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          WebJugglerProperties properties) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.properties = properties;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(request -> {
                var config = new CorsConfiguration();
                config.setAllowedOrigins(List.of("*"));
                config.setAllowedMethods(List.of("*"));
                config.setAllowedHeaders(List.of("*"));
                return config;
            }))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        if ("solo".equals(properties.mode())) {
            // SOLO: permit all, inject fixed "local" user
            http
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .addFilterBefore(new SoloAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        } else {
            // NAS: JWT auth, /api/config and /api/auth/** public
            http
                .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/api/config").permitAll()
                    .requestMatchers("/api/auth/**").permitAll()
                    .requestMatchers("/api/**").authenticated()
                    .anyRequest().permitAll()
                )
                .addFilterBefore(jwtAuthenticationFilter,
                    UsernamePasswordAuthenticationFilter.class);
        }

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: SOLO mode permitAll with SoloAuthenticationFilter"
```

---

## Task 3: Backend — NAS mode Nextcloud auth

**Files:**
- Modify: `backend/.../auth/AuthController.java`

- [ ] **Step 1: Update AuthController**

Inject `WebJugglerProperties`. In NAS mode:
- `/register` → 404
- `/login` → verify via Nextcloud OCS API instead of DB

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final WebJugglerProperties properties;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          WebJugglerProperties properties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.properties = properties;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        if ("nas".equals(properties.mode())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        // ... existing register logic ...
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");

        if ("nas".equals(properties.mode())) {
            return loginViaNextcloud(username, password);
        }
        // ... existing DB login logic ...
    }

    private ResponseEntity<?> loginViaNextcloud(String username, String password) {
        try {
            String url = properties.nextcloud().url() + "/ocs/v1.php/cloud/user";
            var connection = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("OCS-APIRequest", "true");
            connection.setRequestProperty("Accept", "application/json");
            String encoded = java.util.Base64.getEncoder()
                    .encodeToString((username + ":" + password).getBytes());
            connection.setRequestProperty("Authorization", "Basic " + encoded);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);

            int status = connection.getResponseCode();
            if (status == 200) {
                String token = jwtService.generateToken(username);
                return ResponseEntity.ok(Map.of("token", token));
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "invalid credentials"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Nextcloud unavailable: " + e.getMessage()));
        }
    }

    // ... refresh method unchanged ...
}
```

- [ ] **Step 2: Run tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 3: Commit**

```bash
git add backend/
git commit -m "feat: NAS mode Nextcloud OCS login, disable register"
```

---

## Task 4: Backend — FileEntity source field + NAS delete protection

**Files:**
- Modify: `backend/.../file/FileEntity.java`
- Modify: `backend/.../file/FileService.java`

- [ ] **Step 1: Add source and nasRelativePath to FileEntity**

```java
// Add fields:
@Column(nullable = false)
private String source = "upload";  // "upload" | "nas"

private String nasRelativePath;    // NAS relative path for dedup, null for uploads

// Add getters/setters:
public String getSource() { return source; }
public void setSource(String source) { this.source = source; }
public String getNasRelativePath() { return nasRelativePath; }
public void setNasRelativePath(String nasRelativePath) { this.nasRelativePath = nasRelativePath; }
```

- [ ] **Step 2: Update FileService.delete() for NAS protection**

```java
public void delete(String fileId, String username) throws IOException {
    FileEntity entity = getFile(fileId);

    if (!entity.getUploadedBy().equals(username)) {
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not the file owner");
    }

    if ("nas".equals(entity.getSource())) {
        // NAS file: only remove DB record, don't touch filesystem
        parsedFileCache.evict(fileId);
        fileRepository.delete(entity);
    } else {
        // Uploaded file: delete from disk + DB
        Path filePath = Path.of(entity.getStoragePath());
        Files.deleteIfExists(filePath);
        parsedFileCache.evict(fileId);
        fileRepository.delete(entity);
    }
}
```

- [ ] **Step 3: Add openNasFile method to FileService**

```java
public FileEntity openNasFile(String nasBasePath, String relativePath, String username) {
    // Check for duplicate
    var existing = fileRepository.findAll().stream()
            .filter(f -> relativePath.equals(f.getNasRelativePath()))
            .findFirst();
    if (existing.isPresent()) return existing.get();

    Path fullPath = Path.of(nasBasePath).resolve(relativePath).normalize();
    // Security: ensure path stays within nasBasePath
    if (!fullPath.startsWith(Path.of(nasBasePath))) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid path");
    }
    if (!Files.exists(fullPath)) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found on NAS");
    }

    FileEntity entity = new FileEntity();
    entity.setOriginalFilename(fullPath.getFileName().toString());
    entity.setStoragePath(fullPath.toString());
    entity.setUploadedBy(username);
    entity.setUploadedAt(LocalDateTime.now());
    try { entity.setFileSize(Files.size(fullPath)); } catch (IOException e) { entity.setFileSize(0); }
    entity.setSource("nas");
    entity.setNasRelativePath(relativePath);
    entity.setStatus(FileEntity.FileStatus.PARSING);
    entity = fileRepository.save(entity);

    try {
        byte[] data = Files.readAllBytes(fullPath);
        ULogFile parsed = ULogParser.parse(data);
        parsedFileCache.put(entity.getId(), parsed);
        entity.setStatus(FileEntity.FileStatus.READY);
    } catch (Exception e) {
        entity.setStatus(FileEntity.FileStatus.ERROR);
        entity.setErrorMessage(e.getMessage());
    }

    return fileRepository.save(entity);
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: FileEntity source field, NAS delete protection, openNasFile"
```

---

## Task 5: Backend — NasController (browse + open)

**Files:**
- Create: `backend/.../nas/NasController.java`

- [ ] **Step 1: Create NasController**

```java
package com.webjuggler.nas;

import com.webjuggler.config.WebJugglerProperties;
import com.webjuggler.file.FileEntity;
import com.webjuggler.file.FileService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/nas")
public class NasController {

    private final WebJugglerProperties properties;
    private final FileService fileService;

    public NasController(WebJugglerProperties properties, FileService fileService) {
        this.properties = properties;
        this.fileService = fileService;
    }

    @GetMapping("/browse")
    public ResponseEntity<?> browse(@RequestParam(defaultValue = "") String path) {
        if (!"nas".equals(properties.mode())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        String nasPath = properties.nas().path();
        if (nasPath == null || nasPath.isEmpty()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "NAS path not configured"));
        }

        Path basePath = Path.of(nasPath);
        if (!Files.isDirectory(basePath)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "NAS storage not available"));
        }

        // Security: prevent path traversal
        if (path.contains("..")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid path"));
        }

        Path targetDir = basePath.resolve(path).normalize();
        if (!targetDir.startsWith(basePath)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid path"));
        }

        if (!Files.isDirectory(targetDir)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Directory not found"));
        }

        List<Map<String, Object>> entries = new ArrayList<>();
        try (Stream<Path> stream = Files.list(targetDir)) {
            stream.sorted((a, b) -> {
                // Directories first, then reverse alphabetical (newest date first)
                boolean aDir = Files.isDirectory(a), bDir = Files.isDirectory(b);
                if (aDir != bDir) return aDir ? -1 : 1;
                return b.getFileName().toString().compareTo(a.getFileName().toString());
            }).forEach(p -> {
                String name = p.getFileName().toString();
                boolean isDir = Files.isDirectory(p);
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("name", name);
                entry.put("type", isDir ? "dir" : "file");
                if (!isDir) {
                    try { entry.put("size", Files.size(p)); } catch (IOException e) { entry.put("size", 0); }
                }
                entries.add(entry);
            });
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to list directory"));
        }

        // Check for summary.json
        Map<String, Object> summary = null;
        Path summaryPath = targetDir.resolve("summary.json");
        if (Files.exists(summaryPath)) {
            try {
                String json = Files.readString(summaryPath);
                summary = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
            } catch (Exception e) { /* ignore malformed summary */ }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("path", path);
        response.put("entries", entries);
        response.put("summary", summary);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/open")
    public ResponseEntity<?> open(@RequestBody Map<String, List<String>> body,
                                   Authentication authentication) {
        if (!"nas".equals(properties.mode())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        List<String> paths = body.get("paths");
        if (paths == null || paths.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No paths provided"));
        }

        String username = authentication.getName();
        String nasPath = properties.nas().path();

        List<Map<String, Object>> files = new ArrayList<>();
        for (String relativePath : paths) {
            if (relativePath.contains("..")) continue;
            try {
                FileEntity entity = fileService.openNasFile(nasPath, relativePath, username);
                files.add(Map.of(
                    "fileId", entity.getId(),
                    "filename", entity.getOriginalFilename(),
                    "size", entity.getFileSize(),
                    "status", entity.getStatus().name()
                ));
            } catch (Exception e) {
                files.add(Map.of(
                    "filename", relativePath,
                    "error", e.getMessage()
                ));
            }
        }

        return ResponseEntity.ok(Map.of("files", files));
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew test
```

- [ ] **Step 3: Commit**

```bash
git add backend/
git commit -m "feat: NAS browse and open endpoints"
```

---

## Task 6: Frontend — config store + mode-aware auth

**Files:**
- Create: `frontend/src/api/config.ts`
- Create: `frontend/src/stores/useConfigStore.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/LoginPage.tsx`
- Modify: `frontend/src/components/TopBar.tsx`

- [ ] **Step 1: Create api/config.ts**

```typescript
export async function getConfig(): Promise<{ mode: 'solo' | 'nas'; nextcloudUrl: string }> {
  const res = await fetch('/api/config')
  return res.json()
}
```

- [ ] **Step 2: Create useConfigStore.ts**

```typescript
import { create } from 'zustand'
import { getConfig } from '../api/config'

interface ConfigState {
  mode: 'solo' | 'nas'
  nextcloudUrl: string
  loaded: boolean
  loadConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  mode: 'solo',
  nextcloudUrl: '',
  loaded: false,
  loadConfig: async () => {
    try {
      const config = await getConfig()
      set({ mode: config.mode, nextcloudUrl: config.nextcloudUrl, loaded: true })
      // In SOLO mode, set fake auth so app skips login
      if (config.mode === 'solo') {
        localStorage.setItem('token', 'solo')
        localStorage.setItem('username', 'local')
        const { useAuthStore } = await import('./useAuthStore')
        useAuthStore.getState().setAuth('solo', 'local')
      }
    } catch {
      set({ loaded: true }) // Default to solo on error
    }
  },
}))
```

- [ ] **Step 3: Update client.ts — mode-aware 401**

In the 401 handler, check if mode is solo and skip the reload:

```typescript
if (res.status === 401) {
  const { useConfigStore } = await import('../stores/useConfigStore')
  if (useConfigStore.getState().mode === 'solo') {
    // Should not happen in SOLO mode, just warn
    console.warn('Unexpected 401 in SOLO mode')
    throw new ApiError(401, 'Unauthorized')
  }
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  const { useToastStore } = await import('../stores/useToastStore')
  useToastStore.getState().addToast('Session expired, please login again', 'error')
  window.location.reload()
  throw new ApiError(401, 'Unauthorized')
}
```

- [ ] **Step 4: Update App.tsx — load config on mount, mode branching**

Add config loading at app start. In SOLO mode, skip login. In NAS mode, show login without register:

```typescript
import { useConfigStore } from './stores/useConfigStore'

// At top of component:
const { mode, loaded } = useConfigStore()

// Add useEffect to load config on mount:
useEffect(() => {
  useConfigStore.getState().loadConfig()
}, [])

if (!loaded) return <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>Loading...</div>

// Replace: if (!token) return <LoginPage />
// With:
if (mode === 'nas' && !token) return <LoginPage hideRegister />
// SOLO mode: token is auto-set by loadConfig, so this check passes
```

- [ ] **Step 5: Update LoginPage.tsx — hideRegister prop**

```typescript
interface Props {
  hideRegister?: boolean
}

export default function LoginPage({ hideRegister }: Props) {
  // ... existing code ...

  // In JSX, conditionally render register button:
  {!hideRegister && (
    <button
      className="login-btn login-btn-secondary"
      onClick={() => handleSubmit('register')}
      disabled={loading}
    >
      Register
    </button>
  )}
}
```

- [ ] **Step 6: Update TopBar.tsx — NAS button + hide logout in SOLO**

```typescript
import { useConfigStore } from '../stores/useConfigStore'
import { useLayoutStore } from '../stores/useLayoutStore'

const mode = useConfigStore((s) => s.mode)
const addTab = useLayoutStore((s) => s.addTab)

// Add NAS button after Upload button (NAS mode only):
{mode === 'nas' && (
  <button className="topbar-btn" onClick={() => {
    // Dedup: check if NAS browser tab already open
    const tabs = useLayoutStore.getState().tabs
    const existing = tabs.find((t) => t.type === 'nas-browser')
    if (existing) {
      useLayoutStore.getState().setActiveTab(existing.id)
    } else {
      addTab('nas-browser' as any, null, 'NAS Browser')
    }
  }}>
    NAS
  </button>
)}

// Hide logout in SOLO mode:
{mode === 'nas' && (
  <>
    <span className="topbar-username">{username}</span>
    <button className="topbar-btn" onClick={logout}>Logout</button>
  </>
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: frontend config store, mode-aware auth, login/topbar updates"
```

---

## Task 7: Frontend — NAS Browser tab

**Files:**
- Create: `frontend/src/api/nas.ts`
- Create: `frontend/src/components/NasBrowser/NasBrowser.tsx`
- Modify: `frontend/src/stores/useLayoutStore.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create api/nas.ts**

```typescript
import { apiFetch } from './client'

interface NasEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
}

interface BrowseResponse {
  path: string
  entries: NasEntry[]
  summary: Record<string, any> | null
}

export function browse(path: string): Promise<BrowseResponse> {
  return apiFetch<BrowseResponse>(`/nas/browse?path=${encodeURIComponent(path)}`)
}

export function openFiles(paths: string[]): Promise<{ files: { fileId: string; filename: string; size: number; status: string; error?: string }[] }> {
  return apiFetch('/nas/open', {
    method: 'POST',
    body: JSON.stringify({ paths }),
  })
}
```

- [ ] **Step 2: Update useLayoutStore — add 'nas-browser' type**

Update the `addTab` method's type parameter to accept `'nas-browser'`. Update `partialize` to filter out NAS browser tabs (don't persist).

In the type union wherever `'plot' | 'editor'` appears, add `| 'nas-browser'`.

Add NAS browser dedup in `addTab`:
```typescript
// At start of addTab:
if (type === 'nas-browser') {
  const existing = get().tabs.find((t) => t.type === 'nas-browser')
  if (existing) {
    set({ activeTabId: existing.id })
    return
  }
}
```

Update `partialize` to filter:
```typescript
tabs: state.tabs
  .filter((t) => t.type === 'plot')  // exclude editor AND nas-browser
```

- [ ] **Step 3: Create NasBrowser.tsx**

```typescript
import React, { useState, useCallback, useEffect } from 'react'
import { browse, openFiles } from '../../api/nas'
import { useFileStore } from '../../stores/useFileStore'
import { useToastStore } from '../../stores/useToastStore'

interface Props {
  tabId: string
}

interface NasEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
}

interface TreeNode {
  path: string
  entries: NasEntry[]
  expanded: boolean
  summary: Record<string, any> | null
}

export default function NasBrowser({ tabId }: Props) {
  const addFile = useFileStore((s) => s.addFile)
  const [tree, setTree] = useState<Record<string, TreeNode>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load root on mount
  useEffect(() => {
    loadDir('')
  }, [])

  const loadDir = useCallback(async (path: string) => {
    try {
      const res = await browse(path)
      setTree((prev) => ({
        ...prev,
        [path]: { path, entries: res.entries, expanded: true, summary: res.summary },
      }))
    } catch (err) {
      useToastStore.getState().addToast('Failed to browse NAS', 'error')
    }
  }, [])

  const toggleDir = useCallback((path: string) => {
    setTree((prev) => {
      const node = prev[path]
      if (node) {
        return { ...prev, [path]: { ...node, expanded: !node.expanded } }
      }
      return prev
    })
    if (!tree[path]) loadDir(path)
  }, [tree, loadDir])

  const handleSelect = useCallback((filePath: string, mode: 'single' | 'toggle' | 'range') => {
    if (mode === 'toggle') {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(filePath)) next.delete(filePath)
        else next.add(filePath)
        return next
      })
      setLastSelected(filePath)
    } else if (mode === 'range' && lastSelected) {
      // Range selection within the visible .ulg files
      // Simplified: just toggle for now
      setSelected((prev) => {
        const next = new Set(prev)
        next.add(filePath)
        return next
      })
    } else {
      setSelected(new Set([filePath]))
      setLastSelected(filePath)
    }
  }, [lastSelected])

  const handleOpen = useCallback(async () => {
    if (selected.size === 0) return
    setLoading(true)
    try {
      const res = await openFiles(Array.from(selected))
      for (const f of res.files) {
        if (f.fileId) {
          await addFile(f.fileId, f.filename)
        }
        if (f.error) {
          useToastStore.getState().addToast(`Failed: ${f.filename}`, 'error')
        }
      }
      useToastStore.getState().addToast(`Opened ${res.files.filter(f => f.fileId).length} files`, 'success')
      setSelected(new Set())
    } catch (err) {
      useToastStore.getState().addToast('Failed to open files', 'error')
    } finally {
      setLoading(false)
    }
  }, [selected, addFile])

  const renderEntries = (parentPath: string, depth: number) => {
    const node = tree[parentPath]
    if (!node || !node.expanded) return null

    return node.entries.map((entry) => {
      const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
      const isUlg = entry.name.endsWith('.ulg')

      if (entry.type === 'dir') {
        const isExpanded = tree[fullPath]?.expanded ?? false
        return (
          <div key={fullPath}>
            <div
              className="nas-entry nas-dir"
              style={{ paddingLeft: depth * 16 + 8 }}
              onClick={() => toggleDir(fullPath)}
            >
              <span className="topic-arrow">{isExpanded ? '\u25BE' : '\u25B8'}</span>
              <span className="nas-name">{entry.name}</span>
              {tree[fullPath]?.summary && (
                <span className="nas-summary">
                  {tree[fullPath]!.summary!.drone_count} drones
                </span>
              )}
            </div>
            {isExpanded && renderEntries(fullPath, depth + 1)}
          </div>
        )
      }

      if (!isUlg) return null // Only show .ulg files

      return (
        <div
          key={fullPath}
          className={`nas-entry nas-file ${selected.has(fullPath) ? 'nas-file-selected' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={(e) => {
            if (e.shiftKey) handleSelect(fullPath, 'range')
            else if (e.ctrlKey || e.metaKey) handleSelect(fullPath, 'toggle')
            else handleSelect(fullPath, 'single')
          }}
        >
          <span className="nas-name">{entry.name}</span>
          {entry.size && (
            <span className="nas-size">{(entry.size / 1024 / 1024).toFixed(1)} MB</span>
          )}
        </div>
      )
    })
  }

  return (
    <div className="nas-browser">
      <div className="nas-browser-content">
        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px' }}>
          NAS Flight Logs
        </h3>
        <div className="nas-tree">
          {Object.keys(tree).length === 0 ? (
            <div className="nas-empty">Loading...</div>
          ) : (
            renderEntries('', 0)
          )}
        </div>
      </div>
      <div className="nas-browser-footer">
        <span className="nas-selected-count">
          {selected.size > 0 ? `${selected.size} file${selected.size > 1 ? 's' : ''} selected` : 'Select files to open'}
        </span>
        <button
          className="nas-open-btn"
          disabled={selected.size === 0 || loading}
          onClick={handleOpen}
        >
          {loading ? 'Opening...' : `Open ${selected.size > 0 ? selected.size + ' ' : ''}file${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update App.tsx — render NAS browser tab**

Add import and rendering in the tab content area:

```tsx
import NasBrowser from './components/NasBrowser/NasBrowser'

// In tab content:
{activeTab?.type === 'nas-browser' ? (
  <NasBrowser tabId={activeTab.id} />
) : activeTab?.type === 'editor' ? (
  <CustomFunctionEditorTab ... />
) : (
  <SplitLayout node={root} />
)}
```

- [ ] **Step 5: Add NAS browser CSS to index.css**

```css
/* ---- NAS Browser ---- */
.nas-browser {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.nas-browser-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.nas-tree {
  font-size: 12px;
}
.nas-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 3px;
  user-select: none;
}
.nas-dir:hover {
  background: var(--bg-hover);
}
.nas-file:hover {
  background: var(--bg-hover);
}
.nas-file-selected {
  background: var(--bg-selected) !important;
  border: 1px solid var(--accent);
}
.nas-name {
  color: var(--text-primary);
}
.nas-summary {
  color: var(--text-secondary);
  font-size: 10px;
  margin-left: auto;
}
.nas-size {
  color: var(--text-secondary);
  font-size: 10px;
  margin-left: auto;
}
.nas-empty {
  color: var(--text-muted);
  padding: 20px;
  text-align: center;
}
.nas-browser-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.nas-selected-count {
  color: var(--text-secondary);
  font-size: 12px;
}
.nas-open-btn {
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
}
.nas-open-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: NAS browser tab with file selection and open"
```

---

## Task 8: Manual testing

- [ ] **Step 1: Test SOLO mode**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun
# Default mode=solo
```

1. Open http://localhost:3000 → should skip login, go straight to app
2. Upload a file via drag & drop → should work (user = "local")
3. No "NAS" button in TopBar
4. No "Logout" button
5. No "Register" option

- [ ] **Step 2: Test NAS mode (if NAS available)**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun --args='--webjuggler.mode=nas --webjuggler.nextcloud.url=https://suvnas.cbnu.ac.kr --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs'
```

1. Open http://localhost:3000 → should show login page (no register button)
2. Login with Nextcloud credentials → should work
3. "NAS" button visible in TopBar
4. Click NAS → NAS Browser tab opens
5. Browse date folders → session folders → .ulg files
6. Select files → click Open → files appear in sidebar

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: mode system edge cases from testing"
```
