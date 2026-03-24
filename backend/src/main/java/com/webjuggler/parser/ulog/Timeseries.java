package com.webjuggler.parser.ulog;

import java.util.List;

public record Timeseries(double[] timestamps, List<FieldData> data) {

    public record FieldData(String name, double[] values) {
    }
}
