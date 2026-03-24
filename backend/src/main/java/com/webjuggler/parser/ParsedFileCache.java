package com.webjuggler.parser;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Cache;
import com.webjuggler.parser.ulog.ULogFile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import com.webjuggler.config.WebJugglerProperties;

import java.util.Optional;

@Component
public class ParsedFileCache {
    private final Cache<String, ULogFile> cache;

    @Autowired
    public ParsedFileCache(WebJugglerProperties props) {
        this(props.cache().maxSizeMb());
    }

    // Test-only constructor
    public ParsedFileCache(int maxSizeMb) {
        this.cache = Caffeine.newBuilder()
            .maximumWeight((long) maxSizeMb * 1024L * 1024L)
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
            size += ts.timestamps().length * 8;
            for (var field : ts.data()) {
                size += field.values().length * 8;
            }
        }
        return Math.max(size, 1);
    }
}
