package com.webjuggler.data;

import java.util.List;
import java.util.Map;

public record InfoResponse(
        Map<String, String> info,
        List<ParameterEntry> parameters,
        double duration,
        int topicCount,
        long totalDataPoints,
        long startTimeMicros,
        Long gpsOffsetUs) {

    public record ParameterEntry(String name, String type, float floatValue, int intValue) {
    }
}
