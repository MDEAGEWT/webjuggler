package com.webjuggler.file;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file,
                                    Authentication authentication) throws IOException {
        String username = authentication.getName();
        FileEntity entity = fileService.upload(file, username);
        return ResponseEntity.ok(Map.of(
                "fileId", entity.getId(),
                "filename", entity.getOriginalFilename(),
                "size", entity.getFileSize(),
                "status", entity.getStatus().name()
        ));
    }

    @GetMapping
    public ResponseEntity<List<FileEntity>> list() {
        return ResponseEntity.ok(fileService.list());
    }

    @GetMapping("/{fileId}/status")
    public ResponseEntity<?> status(@PathVariable String fileId) {
        FileEntity entity = fileService.getFile(fileId);
        return ResponseEntity.ok(Map.of(
                "status", entity.getStatus().name(),
                "errorMessage", entity.getErrorMessage() != null ? entity.getErrorMessage() : ""
        ));
    }

    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> delete(@PathVariable String fileId,
                                       Authentication authentication) throws IOException {
        String username = authentication.getName();
        fileService.delete(fileId, username);
        return ResponseEntity.noContent().build();
    }
}
