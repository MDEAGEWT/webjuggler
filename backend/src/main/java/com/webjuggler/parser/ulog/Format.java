package com.webjuggler.parser.ulog;

import java.util.List;

public record Format(String name, List<Field> fields, int timestampIdx) {
}
