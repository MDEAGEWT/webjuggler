# WebJuggler Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based ulog file viewer with time-series plotting, recursive split layout, drag-and-drop, cursor sync, and simple JWT auth.

**Architecture:** Spring Boot 3 backend serves a REST API that parses ulog files (Java port of PlotJuggler's C++ parser) and returns full-resolution data as JSON. React frontend with uPlot renders plots client-side. Recursive binary tree layout with right-click split/resize.

**Tech Stack:** Java 21, Spring Boot 3, Spring Security (JWT), Caffeine cache, Gradle | React 18, TypeScript, Vite, uPlot, react-resizable-panels

**Spec:** `docs/superpowers/specs/2026-03-24-webjuggler-design.md`

**Reference parser:** `ref/PlotJuggler/plotjuggler_plugins/DataLoadULog/ulog_parser.cpp` and `ulog_parser.h`

**Test data:** `ref/PlotJuggler/datasamples/sample.ulg.zip` — unzip to `backend/src/test/resources/sample.ulg`

---

## File Structure

### Backend (`backend/`)

| File | Responsibility |
|------|---------------|
| `build.gradle` | Gradle build with Spring Boot 3, Caffeine, jjwt dependencies |
| `src/main/java/com/webjuggler/WebJugglerApplication.java` | Spring Boot entry point |
| `src/main/java/com/webjuggler/config/SecurityConfig.java` | Spring Security filter chain, JWT filter, CORS |
| `src/main/java/com/webjuggler/config/WebJugglerProperties.java` | `@ConfigurationProperties` for upload size, cache, browse paths |
| `src/main/java/com/webjuggler/auth/AuthController.java` | POST /api/auth/login, /register, /refresh |
| `src/main/java/com/webjuggler/auth/JwtService.java` | JWT token creation, validation, refresh |
| `src/main/java/com/webjuggler/auth/User.java` | JPA entity |
| `src/main/java/com/webjuggler/auth/UserRepository.java` | Spring Data JPA repository |
| `src/main/java/com/webjuggler/file/FileController.java` | POST /api/files/upload, GET /api/files, DELETE |
| `src/main/java/com/webjuggler/file/FileService.java` | Upload storage, file listing, metadata |
| `src/main/java/com/webjuggler/file/FileEntity.java` | JPA entity for file metadata |
| `src/main/java/com/webjuggler/file/FileRepository.java` | Spring Data JPA repository |
| `src/main/java/com/webjuggler/data/DataController.java` | GET /topics, GET /info, POST /data |
| `src/main/java/com/webjuggler/parser/ulog/ULogParser.java` | Main parser: reads byte stream, produces ULogFile |
| `src/main/java/com/webjuggler/parser/ulog/ULogFile.java` | Parsed result: topics, parameters, info, logs, dropouts |
| `src/main/java/com/webjuggler/parser/ulog/ULogMessageType.java` | Enum for all 13 message types |
| `src/main/java/com/webjuggler/parser/ulog/FieldType.java` | Enum: UINT8..DOUBLE, BOOL, CHAR, OTHER |
| `src/main/java/com/webjuggler/parser/ulog/Format.java` | Parsed FORMAT message: name, fields, timestampIdx |
| `src/main/java/com/webjuggler/parser/ulog/Field.java` | Single field: name, type, otherTypeName, arraySize |
| `src/main/java/com/webjuggler/parser/ulog/Subscription.java` | Subscription: msgId, multiId, messageName, format |
| `src/main/java/com/webjuggler/parser/ulog/Timeseries.java` | timestamps[] + values[] for one field path |
| `src/main/java/com/webjuggler/parser/ParsedFileCache.java` | Caffeine LRU cache wrapping ULogFile results |
| `src/main/resources/application.yml` | Server config: port, H2, upload path, cache, browse paths |
| `src/test/java/com/webjuggler/parser/ulog/ULogParserTest.java` | Parser unit tests against sample.ulg |
| `src/test/java/com/webjuggler/file/FileControllerTest.java` | Upload/list/delete integration tests |
| `src/test/java/com/webjuggler/data/DataControllerTest.java` | Topics/info/data integration tests |
| `src/test/java/com/webjuggler/auth/AuthControllerTest.java` | Login/register integration tests |
| `src/test/resources/sample.ulg` | Test ulog file (unzipped from ref/) |

### Frontend (`frontend/`)

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies: react, uplot, react-resizable-panels |
| `vite.config.ts` | Vite config with API proxy to backend |
| `tsconfig.json` | TypeScript config |
| `src/main.tsx` | React entry point |
| `src/App.tsx` | App shell: TopBar + Sidebar + PlotArea |
| `src/types/index.ts` | Shared TypeScript types (Topic, Field, LayoutNode, etc.) |
| `src/api/client.ts` | Fetch wrapper: auth headers, error handling |
| `src/api/auth.ts` | Login, register, token storage |
| `src/api/files.ts` | Upload, list, delete, topics, info, data |
| `src/stores/useAuthStore.ts` | Zustand store for auth state |
| `src/stores/useFileStore.ts` | Zustand store for current file + topic tree |
| `src/stores/useLayoutStore.ts` | Zustand store for layout tree + series assignments |
| `src/stores/useCursorStore.ts` | Zustand store for shared cursor position |
| `src/stores/useDataStore.ts` | Zustand store for fetched field data (Float64Arrays) |
| `src/components/TopBar.tsx` | Logo, upload button, file selector, user info |
| `src/components/LoginPage.tsx` | Login/register form |
| `src/components/Sidebar/Sidebar.tsx` | Collapsible sidebar container |
| `src/components/Sidebar/TopicTree.tsx` | Hierarchical topic/field tree with filter |
| `src/components/Sidebar/FieldItem.tsx` | Draggable field leaf with color chip |
| `src/components/PlotArea/SplitLayout.tsx` | Recursive binary tree renderer using react-resizable-panels |
| `src/components/PlotArea/PlotPanel.tsx` | Single plot container: drop target, context menu host |
| `src/components/PlotArea/TimeSeriesPlot.tsx` | uPlot wrapper for time-series |
| `src/components/PlotArea/EmptyPlot.tsx` | Empty drop zone with "+Drop fields here" |
| `src/components/ContextMenu.tsx` | Right-click menu: split V/H, maximize, close |
| `src/index.css` | Global dark theme styles |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/build.gradle`, `backend/settings.gradle`, `backend/src/main/java/com/webjuggler/WebJugglerApplication.java`, `backend/src/main/resources/application.yml`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`
- Create: `.gitignore`

- [ ] **Step 1: Create backend Gradle project**

Create `backend/build.gradle`:
```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.4.3'
    id 'io.spring.dependency-management' version '1.1.7'
}

group = 'com.webjuggler'
version = '0.1.0'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'com.github.ben-manes.caffeine:caffeine:3.1.8'
    implementation 'io.jsonwebtoken:jjwt-api:0.12.6'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.6'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.6'
    runtimeOnly 'com.h2database:h2'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.security:spring-security-test'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

Create `backend/settings.gradle`:
```groovy
rootProject.name = 'webjuggler-backend'
```

Create `backend/src/main/java/com/webjuggler/WebJugglerApplication.java`:
```java
package com.webjuggler;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.webjuggler.config.WebJugglerProperties;

@SpringBootApplication
@EnableConfigurationProperties(WebJugglerProperties.class)
public class WebJugglerApplication {
    public static void main(String[] args) {
        SpringApplication.run(WebJugglerApplication.class, args);
    }
}
```

Create `backend/src/main/resources/application.yml`:
```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:h2:file:./data/webjuggler
    driver-class-name: org.h2.Driver
    username: sa
    password:
  jpa:
    hibernate:
      ddl-auto: update
    database-platform: org.hibernate.dialect.H2Dialect
  servlet:
    multipart:
      max-file-size: 500MB
      max-request-size: 500MB

webjuggler:
  upload:
    path: ./uploads
    max-size-mb: 500
  cache:
    max-size-mb: 1024
  jwt:
    secret: change-this-in-production-to-a-secure-random-key-at-least-256-bits
    expiration-hours: 24
  browse:
    allowed-paths: []
```

- [ ] **Step 2: Verify backend builds and starts**

Run: `cd backend && ./gradlew build -x test`
Expected: BUILD SUCCESSFUL

Note: May need to generate Gradle wrapper first:
```bash
cd backend && gradle wrapper --gradle-version 8.12
```

- [ ] **Step 3: Create frontend Vite + React project**

Create `frontend/package.json`:
```json
{
  "name": "webjuggler-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-resizable-panels": "^2.1.7",
    "uplot": "^1.6.31",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.7.2",
    "vite": "^6.1.0"
  }
}
```

Create `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

Create `frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

Create `frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebJuggler</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create `frontend/src/App.tsx`:
```tsx
export default function App() {
  return <div className="app">WebJuggler</div>
}
```

Create `frontend/src/index.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a14; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.app { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm install && npm run build`
Expected: Build succeeds, `dist/` created

- [ ] **Step 5: Create .gitignore and initial commit**

Create `.gitignore`:
```
# Backend
backend/build/
backend/.gradle/
backend/data/
backend/uploads/

# Frontend
frontend/node_modules/
frontend/dist/

# IDE
.idea/
*.iml
.vscode/

# OS
.DS_Store

# Superpowers
.superpowers/
```

```bash
git init
git add .gitignore backend/ frontend/ docs/
git commit -m "feat: project scaffolding - Spring Boot 3 + React/Vite"
```

---

## Task 2: ULog Parser — Data Structures

**Files:**
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/ULogMessageType.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/FieldType.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/Field.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/Format.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/Subscription.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/Timeseries.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/ULogFile.java`
- Test: `backend/src/test/java/com/webjuggler/parser/ulog/FieldTypeTest.java`

- [ ] **Step 1: Write FieldType test**

```java
package com.webjuggler.parser.ulog;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FieldTypeTest {
    @Test
    void parsesKnownTypes() {
        assertEquals(FieldType.UINT8, FieldType.fromString("uint8_t"));
        assertEquals(FieldType.INT32, FieldType.fromString("int32_t"));
        assertEquals(FieldType.FLOAT, FieldType.fromString("float"));
        assertEquals(FieldType.DOUBLE, FieldType.fromString("double"));
        assertEquals(FieldType.BOOL, FieldType.fromString("bool"));
        assertEquals(FieldType.CHAR, FieldType.fromString("char"));
    }

    @Test
    void unknownTypeReturnsOther() {
        assertEquals(FieldType.OTHER, FieldType.fromString("sensor_struct"));
    }

    @Test
    void byteSizeIsCorrect() {
        assertEquals(1, FieldType.UINT8.byteSize());
        assertEquals(2, FieldType.INT16.byteSize());
        assertEquals(4, FieldType.FLOAT.byteSize());
        assertEquals(8, FieldType.DOUBLE.byteSize());
        assertEquals(8, FieldType.UINT64.byteSize());
        assertEquals(0, FieldType.OTHER.byteSize());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests '*FieldTypeTest*'`
Expected: FAIL — classes don't exist yet

- [ ] **Step 3: Implement all data structures**

`ULogMessageType.java`:
```java
package com.webjuggler.parser.ulog;

public enum ULogMessageType {
    FORMAT('F'), DATA('D'), INFO('I'), INFO_MULTIPLE('M'),
    ADD_LOGGED_MSG('A'), REMOVE_LOGGED_MSG('R'),
    PARAMETER('P'), PARAMETER_DEFAULT('Q'),
    FLAG_BITS('B'), LOGGING('L'), LOGGING_TAGGED('C'),
    SYNC('S'), DROPOUT('O');

    private final byte code;
    ULogMessageType(char c) { this.code = (byte) c; }
    public byte code() { return code; }

    public static ULogMessageType fromByte(byte b) {
        for (var t : values()) {
            if (t.code == b) return t;
        }
        return null; // unknown type — skip
    }
}
```

`FieldType.java`:
```java
package com.webjuggler.parser.ulog;

public enum FieldType {
    UINT8(1), UINT16(2), UINT32(4), UINT64(8),
    INT8(1), INT16(2), INT32(4), INT64(8),
    FLOAT(4), DOUBLE(8), BOOL(1), CHAR(1), OTHER(0);

    private final int byteSize;
    FieldType(int byteSize) { this.byteSize = byteSize; }
    public int byteSize() { return byteSize; }

    public static FieldType fromString(String s) {
        return switch (s) {
            case "uint8_t" -> UINT8; case "uint16_t" -> UINT16;
            case "uint32_t" -> UINT32; case "uint64_t" -> UINT64;
            case "int8_t" -> INT8; case "int16_t" -> INT16;
            case "int32_t" -> INT32; case "int64_t" -> INT64;
            case "float" -> FLOAT; case "double" -> DOUBLE;
            case "bool" -> BOOL; case "char" -> CHAR;
            default -> OTHER;
        };
    }
}
```

`Field.java`:
```java
package com.webjuggler.parser.ulog;

public record Field(String name, FieldType type, String otherTypeName, int arraySize) {
    public Field(String name, FieldType type) {
        this(name, type, null, 1);
    }
}
```

`Format.java`:
```java
package com.webjuggler.parser.ulog;

import java.util.List;

public record Format(String name, List<Field> fields, int timestampIdx) {
}
```

`Subscription.java`:
```java
package com.webjuggler.parser.ulog;

public record Subscription(int msgId, int multiId, String messageName, Format format) {
}
```

`Timeseries.java`:
```java
package com.webjuggler.parser.ulog;

import java.util.List;

public record Timeseries(double[] timestamps, List<FieldData> fields) {
    public record FieldData(String name, double[] values) {}
}
```

`ULogFile.java`:
```java
package com.webjuggler.parser.ulog;

import java.util.List;
import java.util.Map;

public record ULogFile(
    Map<String, Timeseries> timeseries,  // key: topic name (with multi-id suffix)
    Map<String, String> info,
    List<Parameter> parameters,
    List<LogMessage> logs,
    List<Dropout> dropouts,
    long fileStartTime
) {
    public record Parameter(String name, FieldType type, float floatValue, int intValue) {}
    public record LogMessage(char level, long timestamp, String message) {}
    public record Dropout(double timestamp, int durationMs) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests '*FieldTypeTest*'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/webjuggler/parser/
git add backend/src/test/java/com/webjuggler/parser/
git commit -m "feat: ulog parser data structures (all message types, field types, records)"
```

---

## Task 3: ULog Parser — Header & Definition Section

**Files:**
- Create: `backend/src/main/java/com/webjuggler/parser/ulog/ULogParser.java`
- Test: `backend/src/test/java/com/webjuggler/parser/ulog/ULogParserTest.java`
- Test data: `backend/src/test/resources/sample.ulg`

Reference: `ref/PlotJuggler/plotjuggler_plugins/DataLoadULog/ulog_parser.cpp` lines 351-660 (readFileHeader, readFileDefinitions, readFlagBits, readFormat, readInfo, readParameter).

- [ ] **Step 1: Prepare test data**

```bash
cd backend/src/test/resources
unzip ../../../../ref/PlotJuggler/datasamples/sample.ulg.zip
```

- [ ] **Step 2: Write parser header test**

```java
package com.webjuggler.parser.ulog;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

class ULogParserTest {
    static byte[] sampleData;

    @BeforeAll
    static void loadSample() throws IOException {
        sampleData = Files.readAllBytes(
            Path.of("src/test/resources/sample.ulg"));
    }

    @Test
    void parsesHeaderAndHasTopics() {
        ULogFile file = ULogParser.parse(sampleData);
        assertNotNull(file);
        assertFalse(file.timeseries().isEmpty(), "should have at least one topic");
        assertTrue(file.fileStartTime() > 0, "should have a start timestamp");
    }

    @Test
    void parsesFormats() {
        ULogFile file = ULogParser.parse(sampleData);
        // vehicle_attitude is a common PX4 topic
        assertTrue(file.timeseries().containsKey("vehicle_attitude")
            || file.timeseries().keySet().stream().anyMatch(k -> k.startsWith("vehicle_attitude")),
            "should contain vehicle_attitude topic");
    }

    @Test
    void parsesInfo() {
        ULogFile file = ULogParser.parse(sampleData);
        assertFalse(file.info().isEmpty(), "should have info entries");
    }

    @Test
    void parsesParameters() {
        ULogFile file = ULogParser.parse(sampleData);
        assertFalse(file.parameters().isEmpty(), "should have parameters");
    }

    @Test
    void timeseriesHasData() {
        ULogFile file = ULogParser.parse(sampleData);
        var firstEntry = file.timeseries().values().iterator().next();
        assertTrue(firstEntry.timestamps().length > 0, "timestamps should not be empty");
        assertFalse(firstEntry.fields().isEmpty(), "should have field data");
        assertEquals(firstEntry.timestamps().length,
            firstEntry.fields().get(0).values().length,
            "timestamps and values should have same length");
    }

    @Test
    void timestampsAreSecondsSinceStart() {
        ULogFile file = ULogParser.parse(sampleData);
        var firstEntry = file.timeseries().values().iterator().next();
        double firstTs = firstEntry.timestamps()[0];
        // first timestamp should be close to 0 (seconds since file start)
        assertTrue(firstTs >= 0 && firstTs < 10,
            "first timestamp should be near 0, got: " + firstTs);
    }

    @Test
    void paddingFieldsAreSkipped() {
        ULogFile file = ULogParser.parse(sampleData);
        for (var entry : file.timeseries().entrySet()) {
            for (var field : entry.getValue().fields()) {
                assertFalse(field.name().contains("_padding"),
                    "padding field should not appear: " + field.name());
            }
        }
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && ./gradlew test --tests '*ULogParserTest*'`
Expected: FAIL — ULogParser.parse() doesn't exist

- [ ] **Step 4: Implement ULogParser**

Create `backend/src/main/java/com/webjuggler/parser/ulog/ULogParser.java`. This is the largest single file in the project. Port from the C++ reference parser.

Key methods to implement (reference line numbers from `ulog_parser.cpp`):
- `parse(byte[] data)` — entry point, returns ULogFile
- `readFileHeader()` — validate magic bytes `ULog01\x12\x35`, read start timestamp (ref: lines 351-373)
- `readFlagBits()` — check incompat flags, get appended data offsets (ref: lines 444-496)
- `readFormat()` — parse FORMAT messages: split on `:`, parse `type name` pairs, handle arrays `[N]`, detect `timestamp` field (ref: lines 498-660)
- `readInfo()` — parse key-value info with typed values (ref: lines 670-758)
- `readParameter()` — parse int32/float parameters (ref: lines 762-776, 820-851)
- `readDataSection()` — loop over DATA messages, dispatch to subscriptions (ref: lines 27-125)
- `parseDataMessage()` — handle multi-id naming, create timeseries (ref: lines 127-157)
- `parseSimpleDataMessage()` — recursive field extraction, skip padding, handle OTHER type (ref: lines 159-275)
- `createTimeseries()` — recursive field name builder with array suffix (ref: lines 778-818)
- `fieldsCount()` — recursive field counter (ref: lines 313-329)

Implementation notes:
- Use `java.nio.ByteBuffer` with `ByteOrder.LITTLE_ENDIAN` instead of C++ pointer casts
- Timestamps: convert `(raw_us - file_start_us) / 1_000_000.0` to double
- Multi-id: append `.%02d` suffix when topic has multi_id > 0
- Skip `_padding*` fields in both `createTimeseries` and `parseSimpleDataMessage`
- Handle `REMOVE_LOGGED_MSG` by removing subscription from the map

```java
package com.webjuggler.parser.ulog;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;

public class ULogParser {

    private static final byte[] MAGIC = {
        'U', 'L', 'o', 'g', 0x01, 0x12, 0x35
    };

    public static ULogFile parse(byte[] data) {
        ByteBuffer buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        ULogParser parser = new ULogParser(buf);
        return parser.doParse();
    }

    private final ByteBuffer buf;
    private long fileStartTime;
    private long readUntilPosition;
    private final Map<String, Format> formats = new HashMap<>();
    private final Map<Integer, Subscription> subscriptions = new HashMap<>();
    private final Map<String, MutableTimeseries> timeseries = new LinkedHashMap<>();
    private final Map<String, String> info = new LinkedHashMap<>();
    private final List<ULogFile.Parameter> parameters = new ArrayList<>();
    private final List<ULogFile.LogMessage> logs = new ArrayList<>();
    private final List<ULogFile.Dropout> dropouts = new ArrayList<>();
    private final Set<String> messageNameWithMultiId = new HashSet<>();

    private ULogParser(ByteBuffer buf) {
        this.buf = buf;
        this.readUntilPosition = Long.MAX_VALUE;
    }

    private ULogFile doParse() {
        readFileHeader();
        int dataSectionStart = readDefinitions();
        buf.position(dataSectionStart);
        readDataSection();
        return buildResult();
    }

    // --- Header ---

    private void readFileHeader() {
        byte[] magic = new byte[7];
        buf.get(magic);
        for (int i = 0; i < 7; i++) {
            if (magic[i] != MAGIC[i]) {
                throw new IllegalArgumentException("Not a ULog file: bad magic bytes");
            }
        }
        buf.get(); // version byte (magic[7])
        fileStartTime = buf.getLong();
    }

    // --- Definitions ---

    private int readDefinitions() {
        while (buf.hasRemaining()) {
            int msgSize = Short.toUnsignedInt(buf.getShort());
            byte msgType = buf.get();
            var type = ULogMessageType.fromByte(msgType);

            if (type == null) {
                buf.position(buf.position() + msgSize);
                continue;
            }

            switch (type) {
                case FLAG_BITS -> readFlagBits(msgSize);
                case FORMAT -> readFormat(msgSize);
                case INFO -> readInfo(msgSize);
                case PARAMETER -> readParameter(msgSize);
                case ADD_LOGGED_MSG -> {
                    return buf.position() - 3; // rewind to re-read in data section
                }
                default -> buf.position(buf.position() + msgSize); // skip INFO_MULTIPLE, PARAMETER_DEFAULT, etc
            }
        }
        throw new IllegalArgumentException("ULog: no data section found");
    }

    private void readFlagBits(int msgSize) {
        if (msgSize != 40) {
            throw new IllegalArgumentException("Invalid FLAG_BITS message size: " + msgSize);
        }
        byte[] compatFlags = new byte[8];
        byte[] incompatFlags = new byte[8];
        buf.get(compatFlags);
        buf.get(incompatFlags);

        boolean hasUnknownIncompat = (incompatFlags[0] & ~0x1) != 0;
        for (int i = 1; i < 8; i++) {
            if (incompatFlags[i] != 0) hasUnknownIncompat = true;
        }
        if (hasUnknownIncompat) {
            throw new IllegalArgumentException("ULog contains unknown incompat bits — refusing to parse");
        }

        long[] appendedOffsets = new long[3];
        for (int i = 0; i < 3; i++) {
            appendedOffsets[i] = buf.getLong();
        }

        boolean containsAppendedData = (incompatFlags[0] & 0x1) != 0;
        if (containsAppendedData && appendedOffsets[0] > 0) {
            readUntilPosition = appendedOffsets[0];
        }
    }

    private void readFormat(int msgSize) {
        byte[] raw = new byte[msgSize];
        buf.get(raw);
        String str = new String(raw).trim();

        int colonIdx = str.indexOf(':');
        if (colonIdx < 0) return;

        String name = str.substring(0, colonIdx);
        String fieldsStr = str.substring(colonIdx + 1);

        List<Field> fields = new ArrayList<>();
        int timestampIdx = -1;

        for (String fieldDef : fieldsStr.split(";")) {
            fieldDef = fieldDef.trim();
            if (fieldDef.isEmpty()) continue;

            String[] parts = fieldDef.split("\\s+", 2);
            if (parts.length < 2) continue;

            String typeStr = parts[0];
            String fieldName = parts[1];

            int arraySize = 1;
            String baseType = typeStr;

            // Check for array: type[N] or otherType[N]
            int bracketIdx = typeStr.indexOf('[');
            if (bracketIdx >= 0) {
                baseType = typeStr.substring(0, bracketIdx);
                String sizeStr = typeStr.substring(bracketIdx + 1, typeStr.indexOf(']'));
                arraySize = Integer.parseInt(sizeStr);
            }

            FieldType ft = FieldType.fromString(baseType);
            String otherTypeName = (ft == FieldType.OTHER) ? baseType : null;

            // timestamp field is special — not added to fields list
            if (ft == FieldType.UINT64 && fieldName.equals("timestamp")) {
                timestampIdx = fields.size();
            } else {
                fields.add(new Field(fieldName, ft, otherTypeName, arraySize));
            }
        }

        formats.put(name, new Format(name, fields, timestampIdx));
    }

    private void readInfo(int msgSize) {
        int start = buf.position();
        int keyLen = Byte.toUnsignedInt(buf.get());
        byte[] keyRaw = new byte[keyLen];
        buf.get(keyRaw);
        String rawKey = new String(keyRaw);

        int valueLen = msgSize - keyLen - 1;
        byte[] valueRaw = new byte[valueLen];
        buf.get(valueRaw);

        int spaceIdx = rawKey.indexOf(' ');
        if (spaceIdx < 0) return;
        String typeName = rawKey.substring(0, spaceIdx);
        String key = rawKey.substring(spaceIdx + 1);

        String value;
        ByteBuffer vBuf = ByteBuffer.wrap(valueRaw).order(ByteOrder.LITTLE_ENDIAN);
        if (typeName.startsWith("char[")) {
            value = new String(valueRaw).trim();
        } else {
            value = switch (typeName) {
                case "bool" -> String.valueOf(valueRaw[0] != 0);
                case "uint8_t" -> String.valueOf(Byte.toUnsignedInt(valueRaw[0]));
                case "int8_t" -> String.valueOf(valueRaw[0]);
                case "uint16_t" -> String.valueOf(Short.toUnsignedInt(vBuf.getShort()));
                case "int16_t" -> String.valueOf(vBuf.getShort());
                case "uint32_t" -> String.valueOf(Integer.toUnsignedLong(vBuf.getInt()));
                case "int32_t" -> String.valueOf(vBuf.getInt());
                case "uint64_t" -> Long.toUnsignedString(vBuf.getLong());
                case "int64_t" -> String.valueOf(vBuf.getLong());
                case "float" -> String.valueOf(vBuf.getFloat());
                case "double" -> String.valueOf(vBuf.getDouble());
                default -> "(unknown type: " + typeName + ")";
            };
        }

        info.put(key, value);
    }

    private void readParameter(int msgSize) {
        int start = buf.position();
        int keyLen = Byte.toUnsignedInt(buf.get());
        byte[] keyRaw = new byte[keyLen];
        buf.get(keyRaw);
        String rawKey = new String(keyRaw);

        int spaceIdx = rawKey.indexOf(' ');
        if (spaceIdx < 0) {
            buf.position(start + msgSize);
            return;
        }
        String typeName = rawKey.substring(0, spaceIdx);
        String paramName = rawKey.substring(spaceIdx + 1);

        int remaining = msgSize - keyLen - 1;

        if (typeName.equals("int32_t") && remaining >= 4) {
            int val = buf.getInt();
            parameters.add(new ULogFile.Parameter(paramName, FieldType.INT32, 0f, val));
        } else if (typeName.equals("float") && remaining >= 4) {
            float val = buf.getFloat();
            parameters.add(new ULogFile.Parameter(paramName, FieldType.FLOAT, val, 0));
        } else {
            buf.position(start + msgSize);
        }
    }

    // --- Data Section ---

    private void readDataSection() {
        while (buf.hasRemaining() && buf.position() < readUntilPosition) {
            if (buf.remaining() < 3) break;
            int msgSize = Short.toUnsignedInt(buf.getShort());
            byte msgType = buf.get();

            if (buf.remaining() < msgSize) break;

            var type = ULogMessageType.fromByte(msgType);
            if (type == null) {
                buf.position(buf.position() + msgSize);
                continue;
            }

            int msgStart = buf.position();

            switch (type) {
                case ADD_LOGGED_MSG -> {
                    int multiId = Byte.toUnsignedInt(buf.get());
                    int msgId = Short.toUnsignedInt(buf.getShort());
                    byte[] nameBytes = new byte[msgSize - 3];
                    buf.get(nameBytes);
                    String msgName = new String(nameBytes).trim();

                    Format fmt = formats.get(msgName);
                    subscriptions.put(msgId, new Subscription(msgId, multiId, msgName, fmt));

                    if (multiId > 0) {
                        messageNameWithMultiId.add(msgName);
                    }
                }
                case REMOVE_LOGGED_MSG -> {
                    int msgId = Short.toUnsignedInt(buf.getShort());
                    subscriptions.remove(msgId);
                    buf.position(msgStart + msgSize);
                }
                case DATA -> {
                    int msgId = Short.toUnsignedInt(buf.getShort());
                    var sub = subscriptions.get(msgId);
                    if (sub == null || sub.format() == null) {
                        buf.position(msgStart + msgSize);
                    } else {
                        parseDataMessage(sub);
                    }
                }
                case LOGGING -> {
                    char level = (char) buf.get();
                    long ts = buf.getLong();
                    byte[] msgBytes = new byte[msgSize - 9];
                    buf.get(msgBytes);
                    logs.add(new ULogFile.LogMessage(level, ts, new String(msgBytes).trim()));
                }
                case DROPOUT -> {
                    int durationMs = Short.toUnsignedInt(buf.getShort());
                    // estimate timestamp from current position ratio
                    double tsEstimate = 0; // simplified
                    dropouts.add(new ULogFile.Dropout(tsEstimate, durationMs));
                    buf.position(msgStart + msgSize);
                }
                case PARAMETER -> {
                    // In data section, parameters may update existing values (dedup)
                    int beforeSize = parameters.size();
                    readParameter(msgSize);
                    if (parameters.size() > beforeSize) {
                        var newParam = parameters.get(parameters.size() - 1);
                        // Check if we already have this parameter and overwrite
                        for (int pi = 0; pi < parameters.size() - 1; pi++) {
                            if (parameters.get(pi).name().equals(newParam.name())) {
                                parameters.set(pi, newParam);
                                parameters.remove(parameters.size() - 1);
                                break;
                            }
                        }
                    }
                }
                default -> buf.position(msgStart + msgSize);
            }
        }
    }

    private void parseDataMessage(Subscription sub) {
        String tsName = sub.messageName();
        if (messageNameWithMultiId.contains(tsName)) {
            tsName = tsName + String.format(".%02d", sub.multiId());
        }

        MutableTimeseries ts = timeseries.get(tsName);
        if (ts == null) {
            ts = createMutableTimeseries(sub.format());
            timeseries.put(tsName, ts);
        }

        int[] index = {0};
        parseFields(ts, sub.format(), index, true);
    }

    private void parseFields(MutableTimeseries ts, Format format, int[] index, boolean readTimestamp) {
        List<Field> fields = format.fields();
        int tsIdx = format.timestampIdx();

        for (int i = 0; i <= fields.size(); i++) {
            if (tsIdx == i) {
                long rawTs = buf.getLong();
                if (readTimestamp) {
                    double seconds = (rawTs - fileStartTime) / 1_000_000.0;
                    ts.timestamps.add(seconds);
                }
            }
            if (i == fields.size()) break;

            Field field = fields.get(i);

            if (field.name().startsWith("_padding")) {
                buf.position(buf.position() + field.arraySize());
                continue;
            }

            for (int a = 0; a < field.arraySize(); a++) {
                if (field.type() == FieldType.OTHER) {
                    Format childFormat = formats.get(field.otherTypeName());
                    if (childFormat != null) {
                        parseFields(ts, childFormat, index, false);
                    }
                } else {
                    double value = readTypedValue(field.type());
                    ts.fieldValues.get(index[0]).add(value);
                    index[0]++;
                }
            }
        }

        if (readTimestamp && tsIdx < 0) {
            ts.timestamps.add(Double.NaN); // no timestamp for this format
        }
    }

    private double readTypedValue(FieldType type) {
        return switch (type) {
            case UINT8 -> Byte.toUnsignedInt(buf.get());
            case INT8 -> buf.get();
            case UINT16 -> Short.toUnsignedInt(buf.getShort());
            case INT16 -> buf.getShort();
            case UINT32 -> Integer.toUnsignedLong(buf.getInt());
            case INT32 -> buf.getInt();
            case UINT64 -> (double) buf.getLong(); // precision loss for values > 2^53, acceptable for plotting
            case INT64 -> buf.getLong();
            case FLOAT -> buf.getFloat();
            case DOUBLE -> buf.getDouble();
            case BOOL -> buf.get() != 0 ? 1.0 : 0.0;
            case CHAR -> buf.get();
            case OTHER -> 0; // handled separately
        };
    }

    // Note: UINT64 cast to double loses precision for values > 2^53.
    // This is acceptable since ulog uint64 fields (other than timestamp,
    // which is handled separately) are rare and used for plotting only.

    // --- Timeseries builder ---

    private MutableTimeseries createMutableTimeseries(Format format) {
        MutableTimeseries ts = new MutableTimeseries();
        appendFields(ts, format, "");
        return ts;
    }

    private void appendFields(MutableTimeseries ts, Format format, String prefix) {
        for (Field field : format.fields()) {
            if (field.name().startsWith("_padding")) continue;

            String newPrefix = prefix.isEmpty() ? "/" + field.name() : prefix + "/" + field.name();
            for (int i = 0; i < field.arraySize(); i++) {
                String arraySuffix = field.arraySize() > 1 ? String.format(".%02d", i) : "";
                if (field.type() != FieldType.OTHER) {
                    ts.fieldNames.add(newPrefix + arraySuffix);
                    ts.fieldValues.add(new ArrayList<>());
                } else {
                    Format childFormat = formats.get(field.otherTypeName());
                    if (childFormat != null) {
                        appendFields(ts, childFormat, newPrefix + arraySuffix);
                    }
                }
            }
        }
    }

    // --- Build result ---

    private ULogFile buildResult() {
        Map<String, Timeseries> result = new LinkedHashMap<>();
        for (var entry : timeseries.entrySet()) {
            MutableTimeseries mts = entry.getValue();
            double[] timestamps = mts.timestamps.stream().mapToDouble(Double::doubleValue).toArray();
            List<Timeseries.FieldData> fields = new ArrayList<>();
            for (int i = 0; i < mts.fieldNames.size(); i++) {
                double[] values = mts.fieldValues.get(i).stream().mapToDouble(Double::doubleValue).toArray();
                fields.add(new Timeseries.FieldData(mts.fieldNames.get(i), values));
            }
            result.put(entry.getKey(), new Timeseries(timestamps, fields));
        }
        return new ULogFile(result, info, parameters, logs, dropouts, fileStartTime);
    }

    // Mutable accumulator during parsing
    private static class MutableTimeseries {
        final List<Double> timestamps = new ArrayList<>();
        final List<String> fieldNames = new ArrayList<>();
        final List<List<Double>> fieldValues = new ArrayList<>();
    }
}
```

Note: The `readTypedValue` for UINT64 should be:
```java
case UINT64 -> {
    long raw = buf.getLong();
    yield raw >= 0 ? (double) raw : (double) Long.toUnsignedString(raw).length(); // simplified
}
```
Actually, just cast directly — `(double) buf.getLong()` — precision loss is acceptable for plotting.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./gradlew test --tests '*ULogParserTest*'`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/
git commit -m "feat: ulog parser — full binary parser ported from C++ reference"
```

---

## Task 4: Parsed File Cache

**Files:**
- Create: `backend/src/main/java/com/webjuggler/config/WebJugglerProperties.java`
- Create: `backend/src/main/java/com/webjuggler/parser/ParsedFileCache.java`
- Test: `backend/src/test/java/com/webjuggler/parser/ParsedFileCacheTest.java`

- [ ] **Step 1: Write cache test**

```java
package com.webjuggler.parser;

import com.webjuggler.parser.ulog.ULogFile;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

class ParsedFileCacheTest {
    @Test
    void cachesParsedFile() {
        ParsedFileCache cache = new ParsedFileCache(100); // 100MB
        ULogFile file = new ULogFile(Map.of(), Map.of(), List.of(), List.of(), List.of(), 0L);
        cache.put("test-id", file);
        assertTrue(cache.get("test-id").isPresent());
        assertEquals(file, cache.get("test-id").get());
    }

    @Test
    void returnEmptyOnMiss() {
        ParsedFileCache cache = new ParsedFileCache(100);
        assertTrue(cache.get("nonexistent").isEmpty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests '*ParsedFileCacheTest*'`
Expected: FAIL

- [ ] **Step 3: Implement**

`WebJugglerProperties.java`:
```java
package com.webjuggler.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

@ConfigurationProperties(prefix = "webjuggler")
public record WebJugglerProperties(
    Upload upload,
    Cache cache,
    Jwt jwt,
    Browse browse
) {
    public record Upload(String path, int maxSizeMb) {}
    public record Cache(int maxSizeMb) {}
    public record Jwt(String secret, int expirationHours) {}
    public record Browse(List<String> allowedPaths) {}
}
```

`ParsedFileCache.java`:
```java
package com.webjuggler.parser;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Cache;
import com.webjuggler.parser.ulog.ULogFile;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class ParsedFileCache {
    private final Cache<String, ULogFile> cache;

    @org.springframework.beans.factory.annotation.Autowired
    public ParsedFileCache(com.webjuggler.config.WebJugglerProperties props) {
        this(props.cache().maxSizeMb());
    }

    // Test-only constructor
    public ParsedFileCache(int maxSizeMb) {
        this.cache = Caffeine.newBuilder()
            .maximumWeight(maxSizeMb * 1024L * 1024L)
            .weigher((String key, ULogFile file) -> estimateSize(file))
            .build();
    }

    public void put(String fileId, ULogFile file) {
        cache.put(fileId, file);
    }

    public Optional<ULogFile> get(String fileId) {
        return Optional.ofNullable(cache.getIfPresent(fileId));
    }

    public void evict(String fileId) {
        cache.invalidate(fileId);
    }

    private static int estimateSize(ULogFile file) {
        int size = 0;
        for (var ts : file.timeseries().values()) {
            size += ts.timestamps().length * 8; // double[]
            for (var field : ts.fields()) {
                size += field.values().length * 8;
            }
        }
        return Math.max(size, 1);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests '*ParsedFileCacheTest*'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/webjuggler/config/WebJugglerProperties.java
git add backend/src/main/java/com/webjuggler/parser/ParsedFileCache.java
git add backend/src/test/java/com/webjuggler/parser/ParsedFileCacheTest.java
git commit -m "feat: parsed file cache with Caffeine LRU and weight-based eviction"
```

---

## Task 5: Auth — JWT Service + Controller

**Files:**
- Create: `backend/src/main/java/com/webjuggler/auth/User.java`
- Create: `backend/src/main/java/com/webjuggler/auth/UserRepository.java`
- Create: `backend/src/main/java/com/webjuggler/auth/JwtService.java`
- Create: `backend/src/main/java/com/webjuggler/auth/AuthController.java`
- Create: `backend/src/main/java/com/webjuggler/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/webjuggler/auth/AuthControllerTest.java`

- [ ] **Step 1: Write auth test**

```java
package com.webjuggler.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void registerAndLogin() throws Exception {
        // Register
        mvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"username":"testuser","password":"testpass123"}
            """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isString());

        // Login
        mvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"username":"testuser","password":"testpass123"}
            """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isString());
    }

    @Test
    void refreshToken() throws Exception {
        var result = mvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"username":"refreshuser","password":"pass123"}
            """))
            .andReturn();
        String token = new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(result.getResponse().getContentAsString())
            .get("token").asText();

        mvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isString());
    }

    @Test
    void loginWithWrongPasswordFails() throws Exception {
        mvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"username":"testuser2","password":"correctpass"}
            """))
            .andExpect(status().isOk());

        mvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"username":"testuser2","password":"wrongpass"}
            """))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests '*AuthControllerTest*'`
Expected: FAIL

- [ ] **Step 3: Implement auth classes**

`User.java` — JPA entity with id, username, passwordHash.

`UserRepository.java` — `findByUsername(String)`.

`JwtService.java` — uses jjwt to create/validate tokens. Secret from `WebJugglerProperties.jwt().secret()`, expiry from `expirationHours`.

`AuthController.java`:
- `POST /api/auth/register` — hash password with BCrypt, save user, return token
- `POST /api/auth/login` — verify password, return token
- `POST /api/auth/refresh` — validate existing token from Authorization header, issue new token with fresh expiry

`SecurityConfig.java`:
- Permit `/api/auth/**` without auth
- All other `/api/**` require JWT Bearer token
- Add `JwtAuthenticationFilter` that extracts token from `Authorization: Bearer <token>` header
- CORS: allow frontend origin

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests '*AuthControllerTest*'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/webjuggler/auth/
git add backend/src/main/java/com/webjuggler/config/SecurityConfig.java
git add backend/src/test/java/com/webjuggler/auth/
git commit -m "feat: JWT auth — register, login, token validation"
```

---

## Task 6: File Upload & Management API

**Files:**
- Create: `backend/src/main/java/com/webjuggler/file/FileEntity.java`
- Create: `backend/src/main/java/com/webjuggler/file/FileRepository.java`
- Create: `backend/src/main/java/com/webjuggler/file/FileService.java`
- Create: `backend/src/main/java/com/webjuggler/file/FileController.java`
- Test: `backend/src/test/java/com/webjuggler/file/FileControllerTest.java`

- [ ] **Step 1: Write file upload test**

```java
package com.webjuggler.file;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class FileControllerTest {

    @Autowired MockMvc mvc;

    private String getAuthToken() throws Exception {
        var result = mvc.perform(post("/api/auth/register")
            .contentType("application/json")
            .content("""
                {"username":"fileuser","password":"pass123"}
            """))
            .andReturn();
        return "Bearer " + com.fasterxml.jackson.databind.ObjectMapper
            .readTree(result.getResponse().getContentAsString())
            .get("token").asText();
    }

    @Test
    void uploadAndListFiles() throws Exception {
        String token = getAuthToken();
        byte[] sampleData = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        MockMultipartFile file = new MockMultipartFile("file", "test.ulg", "application/octet-stream", sampleData);

        // Upload
        mvc.perform(multipart("/api/files/upload").file(file)
            .header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fileId").isString())
            .andExpect(jsonPath("$.filename").value("test.ulg"));

        // List
        mvc.perform(get("/api/files")
            .header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].filename").value("test.ulg"));
    }
}
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Implement file management**

`FileEntity.java` — JPA: id (UUID string), originalFilename, storagePath, uploadedBy, uploadedAt, fileSize.

`FileRepository.java` — Spring Data JPA.

`FileService.java`:
- `upload(MultipartFile, username)` — save to upload dir with UUID filename, create FileEntity, parse with ULogParser, cache result
- `list()` — return all FileEntities
- `delete(fileId, username)` — verify ownership, delete file + entity + cache entry
- `getFile(fileId)` — return FileEntity or throw 404
- `getParsed(fileId)` — check cache, if miss re-parse from disk

`FileController.java`:
- `POST /api/files/upload` — multipart, returns `{fileId, filename, size, status}`. Parsing is synchronous for files < 50MB, async for larger (sets status to "parsing").
- `GET /api/files` — returns list
- `GET /api/files/{fileId}/status` — returns `{"status": "parsing" | "ready" | "error", "errorMessage": null}`
- `DELETE /api/files/{fileId}` — 403 if not owner

`FileEntity.java` includes a `status` field (enum: PARSING, READY, ERROR) and `errorMessage` field.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/webjuggler/file/
git add backend/src/test/java/com/webjuggler/file/
git commit -m "feat: file upload, listing, and deletion API with ownership"
```

---

## Task 7: Data API — Topics, Info, Data

**Files:**
- Create: `backend/src/main/java/com/webjuggler/data/DataController.java`
- Create: `backend/src/main/java/com/webjuggler/data/TopicTreeResponse.java`
- Create: `backend/src/main/java/com/webjuggler/data/DataRequest.java`
- Create: `backend/src/main/java/com/webjuggler/data/DataResponse.java`
- Test: `backend/src/test/java/com/webjuggler/data/DataControllerTest.java`

- [ ] **Step 1: Write data API test**

```java
package com.webjuggler.data;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class DataControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    private String token;
    private String fileId;

    @BeforeEach
    void setup() throws Exception {
        // Register and get token
        var authResult = mvc.perform(post("/api/auth/register")
            .contentType("application/json")
            .content("""
                {"username":"datauser_%d","password":"pass123"}
            """.formatted(System.nanoTime())))
            .andReturn();
        token = "Bearer " + objectMapper.readTree(
            authResult.getResponse().getContentAsString()).get("token").asText();

        // Upload sample file
        byte[] sampleData = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        var uploadResult = mvc.perform(multipart("/api/files/upload")
            .file(new MockMultipartFile("file", "test.ulg", "application/octet-stream", sampleData))
            .header("Authorization", token))
            .andReturn();
        fileId = objectMapper.readTree(
            uploadResult.getResponse().getContentAsString()).get("fileId").asText();
    }

    @Test
    void getTopicsForUploadedFile() throws Exception {
        mvc.perform(get("/api/files/" + fileId + "/topics")
            .header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.topics").isArray())
            .andExpect(jsonPath("$.topics[0].name").isString())
            .andExpect(jsonPath("$.topics[0].fields").isArray());
    }

    @Test
    void getInfoForUploadedFile() throws Exception {
        mvc.perform(get("/api/files/" + fileId + "/info")
            .header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.info").isMap());
    }

    @Test
    void getDataReturnsFullResolution() throws Exception {
        // Get first topic and field
        var topicsResult = mvc.perform(get("/api/files/" + fileId + "/topics")
            .header("Authorization", token))
            .andReturn();
        JsonNode topics = objectMapper.readTree(
            topicsResult.getResponse().getContentAsString()).get("topics");
        String firstField = topics.get(0).get("name").asText()
            + topics.get(0).get("fields").get(0).asText();

        mvc.perform(post("/api/files/" + fileId + "/data")
            .header("Authorization", token)
            .contentType("application/json")
            .content(objectMapper.writeValueAsString(
                java.util.Map.of("fields", java.util.List.of(firstField)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fields").isMap());
    }

    @Test
    void getNonexistentFileReturns404() throws Exception {
        mvc.perform(get("/api/files/nonexistent/topics")
            .header("Authorization", token))
            .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Implement DataController**

`TopicTreeResponse.java`:
```java
public record TopicTreeResponse(List<TopicInfo> topics) {
    public record TopicInfo(String name, List<String> fields, int dataPoints) {}
}
```

`DataRequest.java`:
```java
public record DataRequest(List<String> fields) {}
```

`DataResponse.java`:
```java
public record DataResponse(
    Map<String, FieldData> fields,
    List<DropoutInfo> dropouts
) {
    public record FieldData(double[] timestamps, double[] values) {}
    public record DropoutInfo(double timestamp, int durationMs) {}
}
```

`DataController.java`:
- `GET /api/files/{fileId}/topics` — get parsed file from cache/service, build topic tree
- `GET /api/files/{fileId}/info` — return info map + parameters + duration + estimatedDataSizeMb
- `POST /api/files/{fileId}/data` — look up requested field paths in timeseries, return full data

The field path in the request (e.g. `"vehicle_attitude/rollspeed"`) maps to the timeseries key `"vehicle_attitude"` + field name `"/rollspeed"`.

- [ ] **Step 4: Run test, verify it passes**

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/webjuggler/data/
git add backend/src/test/java/com/webjuggler/data/
git commit -m "feat: data API — topics tree, file info, full-resolution data endpoint"
```

---

## Task 8: Frontend — Types, API Client, Auth Store

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/files.ts`
- Create: `frontend/src/stores/useAuthStore.ts`

- [ ] **Step 1: Define TypeScript types**

```typescript
// types/index.ts
export interface Topic {
  name: string
  fields: string[]
  dataPoints: number
}

export interface FieldData {
  timestamps: Float64Array
  values: Float64Array
}

export interface DropoutInfo {
  timestamp: number
  durationMs: number
}

export interface FileInfo {
  fileId: string
  filename: string
  size: number
  uploadedBy: string
  uploadedAt: string
}

// Layout tree
export type LayoutNode = SplitNode | PlotNode

export interface SplitNode {
  type: 'split'
  direction: 'vertical' | 'horizontal'
  ratio: number
  children: [LayoutNode, LayoutNode]
}

export interface PlotNode {
  type: 'plot'
  id: string
  series: string[] // field paths like "vehicle_attitude/rollspeed"
}
```

- [ ] **Step 2: Implement API client with JWT**

```typescript
// api/client.ts
const BASE = '/api'

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token')
      window.location.reload()
    }
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || res.statusText)
  }
  return res.json()
}
```

- [ ] **Step 3: Implement auth API + store**

```typescript
// api/auth.ts
import { apiFetch } from './client'

export const authApi = {
  login: (username: string, password: string) =>
    apiFetch<{ token: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
  register: (username: string, password: string) =>
    apiFetch<{ token: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
}
```

```typescript
// stores/useAuthStore.ts
import { create } from 'zustand'

interface AuthState {
  token: string | null
  username: string | null
  setAuth: (token: string, username: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  setAuth: (token, username) => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
    set({ token, username })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    set({ token: null, username: null })
  },
}))
```

- [ ] **Step 4: Implement files API**

```typescript
// api/files.ts
import { apiFetch } from './client'
import type { FileInfo, Topic, FieldData, DropoutInfo } from '../types'

export const filesApi = {
  upload: async (file: File): Promise<FileInfo> => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch('/files/upload', { method: 'POST', body: form })
  },
  list: () => apiFetch<FileInfo[]>('/files'),
  delete: (fileId: string) => apiFetch(`/files/${fileId}`, { method: 'DELETE' }),
  topics: (fileId: string) => apiFetch<{ topics: Topic[] }>(`/files/${fileId}/topics`),
  info: (fileId: string) => apiFetch<Record<string, unknown>>(`/files/${fileId}/info`),
  data: async (fileId: string, fields: string[]) => {
    const res = await apiFetch<{
      fields: Record<string, { timestamps: number[]; values: number[] }>
      dropouts: DropoutInfo[]
    }>(`/files/${fileId}/data`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    })
    // Convert to Float64Array for performance
    const converted: Record<string, FieldData> = {}
    for (const [key, val] of Object.entries(res.fields)) {
      converted[key] = {
        timestamps: new Float64Array(val.timestamps),
        values: new Float64Array(val.values),
      }
    }
    return { fields: converted, dropouts: res.dropouts }
  },
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/ frontend/src/api/ frontend/src/stores/useAuthStore.ts
git commit -m "feat: frontend types, API client, auth store"
```

---

## Task 9: Frontend — Login Page + App Shell

**Files:**
- Create: `frontend/src/components/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/TopBar.tsx`

- [ ] **Step 1: Implement LoginPage**

Simple form with username/password, login + register buttons. On success, call `useAuthStore.setAuth()`.

- [ ] **Step 2: Implement TopBar**

Shows: WebJuggler logo, Upload button (file input), current filename, username, logout button.

- [ ] **Step 3: Update App.tsx**

```tsx
import { useAuthStore } from './stores/useAuthStore'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'

export default function App() {
  const token = useAuthStore(s => s.token)
  if (!token) return <LoginPage />
  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        {/* Sidebar + PlotArea will go here */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          Upload a .ulg file to begin
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

Run backend + frontend, open browser. Should see login page, register, login, see top bar.

Run: `cd backend && ./gradlew bootRun &` and `cd frontend && npm run dev`
Expected: Login page at localhost:3000, can register and login

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: login page, app shell with top bar"
```

---

## Task 10: Frontend — File Store + Topic Sidebar

**Files:**
- Create: `frontend/src/stores/useFileStore.ts`
- Create: `frontend/src/components/Sidebar/Sidebar.tsx`
- Create: `frontend/src/components/Sidebar/TopicTree.tsx`
- Create: `frontend/src/components/Sidebar/FieldItem.tsx`

- [ ] **Step 1: Implement useFileStore**

Zustand store: `currentFileId`, `topics`, `setFile(fileId)` which fetches topics.

- [ ] **Step 2: Implement Sidebar with TopicTree**

Collapsible sidebar. TopicTree renders topics as expandable groups, each containing FieldItem leaves. FieldItem shows a color chip and is `draggable`.

Filter input at top filters topics by name.

- [ ] **Step 3: Implement drag start**

FieldItem sets `dataTransfer` with field path on drag start. Multiple fields selected with Ctrl+click.

```tsx
// FieldItem.tsx key drag logic
const handleDragStart = (e: React.DragEvent) => {
  const selectedFields = useFieldSelection.getState().selected
  const paths = selectedFields.length > 0 ? selectedFields : [fieldPath]
  e.dataTransfer.setData('application/webjuggler-fields', JSON.stringify(paths))
}
```

- [ ] **Step 4: Wire upload → parse → sidebar**

In TopBar: on file upload success, call `useFileStore.setFile(fileId)` which fetches topics and populates sidebar.

- [ ] **Step 5: Verify manually**

Upload a ulog file, see topic tree in sidebar.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/useFileStore.ts frontend/src/components/Sidebar/
git commit -m "feat: topic tree sidebar with drag-and-drop field selection"
```

---

## Task 11: Frontend — Layout Store + Split Layout

**Files:**
- Create: `frontend/src/stores/useLayoutStore.ts`
- Create: `frontend/src/components/PlotArea/SplitLayout.tsx`
- Create: `frontend/src/components/PlotArea/PlotPanel.tsx`
- Create: `frontend/src/components/PlotArea/EmptyPlot.tsx`
- Create: `frontend/src/components/ContextMenu.tsx`

- [ ] **Step 1: Implement useLayoutStore**

Zustand store managing the binary tree:
```typescript
interface LayoutState {
  root: LayoutNode
  splitPanel: (plotId: string, direction: 'vertical' | 'horizontal') => void
  closePanel: (plotId: string) => void
  addSeries: (plotId: string, fields: string[]) => void
  clearSeries: (plotId: string) => void
}
```

Initial state: single PlotNode with empty series.

`splitPanel`: replace the target PlotNode with a SplitNode containing the original + a new empty PlotNode.

`closePanel`: remove PlotNode, replace parent SplitNode with the sibling.

- [ ] **Step 2: Implement SplitLayout**

Recursive component using `react-resizable-panels`:

```tsx
function SplitLayout({ node }: { node: LayoutNode }) {
  if (node.type === 'plot') return <PlotPanel node={node} />

  const { direction, children } = node
  return (
    <PanelGroup direction={direction}>
      <Panel defaultSize={node.ratio * 100}>
        <SplitLayout node={children[0]} />
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      <Panel>
        <SplitLayout node={children[1]} />
      </Panel>
    </PanelGroup>
  )
}
```

- [ ] **Step 3: Implement PlotPanel + EmptyPlot**

PlotPanel: drop target. On drop, read field paths from dataTransfer, call `useLayoutStore.addSeries()`.

If series is empty, show EmptyPlot ("Drop fields here, 1=time, 2=X-Y, 3=3D").

- [ ] **Step 4: Implement ContextMenu**

Right-click on PlotPanel opens context menu with: Split Vertical, Split Horizontal, Maximize, Clear Series, Close Panel.

Keyboard shortcuts: V for split vertical, H for split horizontal (when plot is focused).

- [ ] **Step 5: Verify manually**

Upload file, right-click on plot area → Split Vertical. Should see two panels.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/useLayoutStore.ts frontend/src/components/PlotArea/ frontend/src/components/ContextMenu.tsx
git commit -m "feat: recursive split layout with context menu and resize"
```

---

## Task 12: Frontend — Data Store + Time Series Plot

**Files:**
- Create: `frontend/src/stores/useDataStore.ts`
- Create: `frontend/src/components/PlotArea/TimeSeriesPlot.tsx`

- [ ] **Step 1: Implement useDataStore**

Zustand store that caches fetched field data:
```typescript
interface DataState {
  data: Record<string, FieldData>  // key: "fileId:fieldPath"
  loading: Set<string>
  fetchFields: (fileId: string, fields: string[]) => Promise<void>
}
```

On `fetchFields`: check cache first, only fetch missing fields via `filesApi.data()`.

- [ ] **Step 2: Implement TimeSeriesPlot**

uPlot wrapper component:
- Receives `series: string[]` (field paths) from PlotPanel
- On mount / series change: fetch data via useDataStore, create uPlot instance
- X axis = timestamps (seconds since file start)
- Y axis = values
- Multiple series = multiple lines with different colors
- Show cursor value tooltip with exact numbers

```tsx
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

function TimeSeriesPlot({ series, plotId }: { series: string[], plotId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const data = useDataStore(s => s.data)
  const fileId = useFileStore(s => s.currentFileId)

  useEffect(() => {
    if (!containerRef.current || series.length === 0 || !fileId) return

    // Build uPlot data: [timestamps, values1, values2, ...]
    const fieldData = series.map(s => data[`${fileId}:${s}`]).filter(Boolean)
    if (fieldData.length === 0) return

    const timestamps = fieldData[0].timestamps
    const uData: uPlot.AlignedData = [
      Array.from(timestamps),
      ...fieldData.map(f => Array.from(f.values))
    ]

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      series: [
        { label: 'Time (s)' },
        ...series.map((s, i) => ({
          label: s.split('/').pop(),
          stroke: COLORS[i % COLORS.length],
        })),
      ],
      cursor: { sync: { key: 'webjuggler' } },
    }

    plotRef.current?.destroy()
    plotRef.current = new uPlot(opts, uData, containerRef.current)

    return () => plotRef.current?.destroy()
  }, [series, data, fileId])

  return <div ref={containerRef} className="plot-container" />
}
```

- [ ] **Step 3: Wire PlotPanel → TimeSeriesPlot**

When PlotPanel has 1 series (or multiple from same drag), render TimeSeriesPlot. Trigger data fetch on series change.

- [ ] **Step 4: Verify manually**

Upload file → expand topic → drag field to plot → should see time-series chart.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/useDataStore.ts frontend/src/components/PlotArea/TimeSeriesPlot.tsx
git commit -m "feat: time-series plot with uPlot — full resolution rendering"
```

---

## Task 13: Frontend — Cursor Sync

**Files:**
- Create: `frontend/src/stores/useCursorStore.ts`
- Modify: `frontend/src/components/PlotArea/TimeSeriesPlot.tsx`

- [ ] **Step 1: Implement useCursorStore**

```typescript
interface CursorState {
  timestamp: number | null
  sourceId: string | null
  setCursor: (timestamp: number | null, sourceId: string) => void
}
```

- [ ] **Step 2: Add cursor sync to TimeSeriesPlot**

Use uPlot's `cursor.sync` API:
- On cursor move in any plot: update `useCursorStore.setCursor()`
- Other plots subscribe to cursor store and update their cursor position
- Show value tooltip at cursor position with exact field values

uPlot has built-in cursor sync via `cursor: { sync: { key: 'webjuggler' } }` — all plots with the same sync key automatically sync cursors. Add a value readout below the plot showing current values at cursor.

- [ ] **Step 3: Verify manually**

Open two plots side by side, hover on one → cursor appears on both with synchronized position.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/useCursorStore.ts frontend/src/components/PlotArea/TimeSeriesPlot.tsx
git commit -m "feat: cursor sync across all plots via uPlot sync API"
```

---

## Task 14: Frontend — Drag & Drop Integration

**Files:**
- Modify: `frontend/src/components/PlotArea/PlotPanel.tsx`
- Modify: `frontend/src/components/Sidebar/FieldItem.tsx`
- Modify: `frontend/src/stores/useLayoutStore.ts`

- [ ] **Step 1: Implement drop target in PlotPanel**

```tsx
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault()
  const raw = e.dataTransfer.getData('application/webjuggler-fields')
  if (!raw) return
  const fields: string[] = JSON.parse(raw)

  if (fields.length === 1) {
    // Time series — add to this plot
    addSeries(plotId, fields)
  } else if (fields.length === 2) {
    // X-Y plot (Phase 2)
    addSeries(plotId, fields)
  }
  // Trigger data fetch
  fetchFields(fileId, fields)
}
```

- [ ] **Step 2: Add visual drop feedback**

On `dragOver`: show blue border highlight. On `dragLeave`: remove.

- [ ] **Step 3: Support dropping on existing plot to add series**

When dropping on a plot that already has series, append the new fields.

- [ ] **Step 4: Verify manually**

Drag a field from sidebar → drop on empty plot → chart appears. Drag another field → add to same plot → two lines.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: drag-and-drop fields from sidebar to plot panels"
```

---

## Task 15: Integration Test — End to End

**Files:**
- Modify: Various (bug fixes from integration testing)

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && ./gradlew bootRun &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test full workflow**

1. Open http://localhost:3000
2. Register a new user
3. Upload `ref/PlotJuggler/datasamples/sample.ulg` (unzipped)
4. Verify topic tree appears in sidebar
5. Drag a field to the plot area → time-series chart renders
6. Right-click → Split Vertical → two panels
7. Drag a different field to the new panel
8. Verify cursor sync works across both plots
9. Right-click → Close Panel → back to single view

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: WebJuggler Phase 1 MVP — ulog viewer with split layout and cursor sync"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Project Scaffolding | — |
| 2 | ULog Parser Data Structures | 1 |
| 3 | ULog Parser Implementation | 2 |
| 4 | Parsed File Cache | 3 |
| 5 | JWT Auth | 1 |
| 6 | File Upload API | 4, 5 |
| 7 | Data API | 6 |
| 8 | Frontend Types + API + Auth | 1 |
| 9 | Login Page + App Shell | 8 |
| 10 | Topic Sidebar | 7, 9 |
| 11 | Split Layout | 9 |
| 12 | Time Series Plot | 10, 11 |
| 13 | Cursor Sync | 12 |
| 14 | Drag & Drop | 12 |
| 15 | Integration Test | all |

Parallelizable: Tasks 2-4 (parser) and 5 (auth) can run in parallel. Tasks 8-9 (frontend) can start once Task 1 is done. Tasks 10, 11 can run in parallel.
