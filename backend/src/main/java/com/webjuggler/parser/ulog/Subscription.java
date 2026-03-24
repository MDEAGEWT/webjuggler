package com.webjuggler.parser.ulog;

public record Subscription(int msgId, int multiId, String messageName, Format format) {
}
