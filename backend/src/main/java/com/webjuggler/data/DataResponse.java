package com.webjuggler.data;

import java.util.List;
import java.util.Map;

public record DataResponse(
        Map<String, FieldTimeseries> fields,
        List<DropoutEntry> dropouts) {

    public record FieldTimeseries(double[] timestamps, double[] values) {
    }

    public record DropoutEntry(double timestamp, int durationMs) {
    }
}
