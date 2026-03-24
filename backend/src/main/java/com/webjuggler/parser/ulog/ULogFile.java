package com.webjuggler.parser.ulog;

import java.util.List;
import java.util.Map;

public record ULogFile(
        Map<String, Timeseries> timeseries,
        Map<String, String> info,
        List<Parameter> parameters,
        List<MessageLog> logs,
        List<Dropout> dropouts,
        long fileStartTime) {

    public record Parameter(String name, FieldType type, int intValue, float floatValue) {
    }

    public record MessageLog(char level, long timestamp, String message) {
    }

    public record Dropout(int durationMs) {
    }
}
