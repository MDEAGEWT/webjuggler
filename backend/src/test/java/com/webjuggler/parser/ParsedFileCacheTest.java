package com.webjuggler.parser;

import com.webjuggler.parser.ulog.ULogFile;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

class ParsedFileCacheTest {
    @Test
    void cachesParsedFile() {
        ParsedFileCache cache = new ParsedFileCache(100);
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
