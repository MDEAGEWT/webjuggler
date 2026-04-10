package com.webjuggler.nas;

import com.webjuggler.config.WebJugglerProperties;
import com.webjuggler.file.FileEntity;
import com.webjuggler.file.FileService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

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

        String nasPath = properties.nas() != null ? properties.nas().path() : "";
        if (nasPath == null || nasPath.isEmpty()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "NAS path not configured"));
        }

        Path basePath = Path.of(nasPath);
        if (!Files.isDirectory(basePath)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "NAS storage not available"));
        }

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
                Map<String, Object> fileInfo = new LinkedHashMap<>();
                fileInfo.put("fileId", entity.getId());
                fileInfo.put("filename", entity.getOriginalFilename());
                fileInfo.put("size", entity.getFileSize());
                fileInfo.put("status", entity.getStatus().name());
                files.add(fileInfo);
            } catch (Exception e) {
                Map<String, Object> errInfo = new LinkedHashMap<>();
                errInfo.put("filename", relativePath);
                errInfo.put("error", e.getMessage());
                files.add(errInfo);
            }
        }

        return ResponseEntity.ok(Map.of("files", files));
    }
}
