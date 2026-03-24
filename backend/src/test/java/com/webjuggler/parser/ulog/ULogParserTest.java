package com.webjuggler.parser.ulog;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ULogParserTest {

    private static ULogFile ulog;

    @BeforeAll
    static void parseFile() throws IOException {
        byte[] data = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        ulog = ULogParser.parse(data);
    }

    @Test
    void parsesHeaderAndHasTopics() {
        assertTrue(ulog.fileStartTime() > 0, "file start time should be positive");
        assertFalse(ulog.timeseries().isEmpty(), "timeseries map should not be empty");
    }

    @Test
    void parsesFormats() {
        boolean hasVehicleAttitude = ulog.timeseries().keySet().stream()
                .anyMatch(k -> k.startsWith("vehicle_attitude"));
        assertTrue(hasVehicleAttitude, "should contain vehicle_attitude topic");
    }

    @Test
    void parsesInfo() {
        assertFalse(ulog.info().isEmpty(), "info map should not be empty");
    }

    @Test
    void parsesParameters() {
        assertFalse(ulog.parameters().isEmpty(), "parameters list should not be empty");
    }

    @Test
    void timeseriesHasData() {
        // At least one timeseries should have data
        boolean foundWithData = false;
        for (var entry : ulog.timeseries().entrySet()) {
            Timeseries ts = entry.getValue();
            if (ts.timestamps().length > 0) {
                assertFalse(ts.data().isEmpty(),
                        "topic " + entry.getKey() + " has timestamps but no fields");
                for (Timeseries.FieldData fd : ts.data()) {
                    assertEquals(ts.timestamps().length, fd.values().length,
                            "field " + fd.name() + " in topic " + entry.getKey()
                                    + " should have same length as timestamps");
                }
                foundWithData = true;
            }
        }
        assertTrue(foundWithData, "at least one timeseries should have data");
    }

    @Test
    void timestampsAreSecondsSinceStart() {
        // Find a well-known topic and verify its first timestamp is reasonable
        // (>= 0 and < 10 seconds since file start)
        for (var entry : ulog.timeseries().entrySet()) {
            if (entry.getKey().startsWith("vehicle_attitude")) {
                double[] ts = entry.getValue().timestamps();
                assertTrue(ts.length > 0, "vehicle_attitude should have timestamps");
                assertTrue(ts[0] >= 0, "first timestamp should be >= 0, got " + ts[0]);
                assertTrue(ts[0] < 10, "first timestamp should be < 10s, got " + ts[0]);
                return;
            }
        }
        fail("vehicle_attitude topic not found");
    }

    @Test
    void paddingFieldsAreSkipped() {
        for (var entry : ulog.timeseries().entrySet()) {
            for (Timeseries.FieldData fd : entry.getValue().data()) {
                assertFalse(fd.name().contains("_padding"),
                        "field name should not contain _padding but got: " + fd.name()
                                + " in topic " + entry.getKey());
            }
        }
    }

    @Test
    void fieldNamesStartWithSlash() {
        for (var entry : ulog.timeseries().entrySet()) {
            for (Timeseries.FieldData fd : entry.getValue().data()) {
                assertTrue(fd.name().startsWith("/"),
                        "field name should start with / but got: " + fd.name());
            }
        }
    }

    @Test
    void timestampsAreMonotonicallyNonDecreasing() {
        for (var entry : ulog.timeseries().entrySet()) {
            double[] ts = entry.getValue().timestamps();
            for (int i = 1; i < ts.length; i++) {
                if (!Double.isNaN(ts[i - 1]) && !Double.isNaN(ts[i])) {
                    assertTrue(ts[i] >= ts[i - 1],
                            "timestamps should be monotonically non-decreasing in topic "
                                    + entry.getKey() + " at index " + i);
                }
            }
        }
    }

    @Test
    void invalidMagicThrows() {
        byte[] bad = new byte[32];
        assertThrows(IllegalArgumentException.class, () -> ULogParser.parse(bad));
    }
}
