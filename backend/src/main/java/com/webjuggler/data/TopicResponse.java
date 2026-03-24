package com.webjuggler.data;

import java.util.List;

public record TopicResponse(List<TopicEntry> topics) {

    public record TopicEntry(String name, List<String> fields, int dataPoints) {
    }
}
