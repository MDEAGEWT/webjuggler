package com.webjuggler.file;

import com.webjuggler.config.WebJugglerProperties;
import com.webjuggler.parser.ParsedFileCache;
import com.webjuggler.parser.ulog.ULogFile;
import com.webjuggler.parser.ulog.ULogParser;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class FileService {

    private final FileRepository fileRepository;
    private final ParsedFileCache parsedFileCache;
    private final Path uploadDir;

    public FileService(FileRepository fileRepository,
                       ParsedFileCache parsedFileCache,
                       WebJugglerProperties props) {
        this.fileRepository = fileRepository;
        this.parsedFileCache = parsedFileCache;
        this.uploadDir = Path.of(props.upload().path());
    }

    @PostConstruct
    void initUploadDir() throws IOException {
        Files.createDirectories(uploadDir);
    }

    public FileEntity upload(MultipartFile file, String username) throws IOException {
        String fileId = UUID.randomUUID().toString();
        String storageName = fileId + ".ulg";
        Path target = uploadDir.resolve(storageName);

        Files.copy(file.getInputStream(), target);

        FileEntity entity = new FileEntity();
        entity.setOriginalFilename(file.getOriginalFilename());
        entity.setStoragePath(target.toString());
        entity.setUploadedBy(username);
        entity.setUploadedAt(LocalDateTime.now());
        entity.setFileSize(file.getSize());
        entity.setStatus(FileEntity.FileStatus.PARSING);
        entity = fileRepository.save(entity);

        try {
            byte[] data = Files.readAllBytes(target);
            ULogFile parsed = ULogParser.parse(data);
            parsedFileCache.put(entity.getId(), parsed);
            entity.setStatus(FileEntity.FileStatus.READY);
        } catch (Exception e) {
            entity.setStatus(FileEntity.FileStatus.ERROR);
            entity.setErrorMessage(e.getMessage());
        }

        return fileRepository.save(entity);
    }

    public List<FileEntity> list() {
        return fileRepository.findAll();
    }

    public FileEntity getFile(String fileId) {
        return fileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found"));
    }

    public ULogFile getParsed(String fileId) {
        FileEntity entity = getFile(fileId);
        return parsedFileCache.get(fileId).orElseGet(() -> {
            try {
                byte[] data = Files.readAllBytes(Path.of(entity.getStoragePath()));
                ULogFile parsed = ULogParser.parse(data);
                parsedFileCache.put(fileId, parsed);
                return parsed;
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Failed to read file from disk: " + e.getMessage());
            }
        });
    }

    public void delete(String fileId, String username) throws IOException {
        FileEntity entity = getFile(fileId);

        if (!entity.getUploadedBy().equals(username)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not the file owner");
        }

        Path filePath = Path.of(entity.getStoragePath());
        Files.deleteIfExists(filePath);
        parsedFileCache.evict(fileId);
        fileRepository.delete(entity);
    }
}
