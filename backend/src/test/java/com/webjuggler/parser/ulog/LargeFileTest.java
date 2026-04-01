package com.webjuggler.parser.ulog;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class LargeFileTest {
    @Test
    void parseLargeFile() throws Exception {
        Path dir = Path.of("uploads");
        if (!Files.isDirectory(dir)) return;
        var files = Files.list(dir).filter(p -> p.toString().endsWith(".ulg")).toList();
        var largest = files.stream().max((a, b) -> {
            try { return Long.compare(Files.size(a), Files.size(b)); } catch (Exception e) { return 0; }
        });
        if (largest.isEmpty()) return;
        byte[] data = Files.readAllBytes(largest.get());
        System.out.println("Parsing " + largest.get() + " (" + data.length + " bytes)");
        ULogFile file = ULogParser.parse(data);
        System.out.println("Topics: " + file.timeseries().size());
        assertFalse(file.timeseries().isEmpty());
    }
}
