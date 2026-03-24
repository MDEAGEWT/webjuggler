package com.webjuggler.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

@ConfigurationProperties(prefix = "webjuggler")
public record WebJugglerProperties(
    Upload upload,
    Cache cache,
    Jwt jwt,
    Browse browse
) {
    public record Upload(String path, int maxSizeMb) {}
    public record Cache(int maxSizeMb) {}
    public record Jwt(String secret, int expirationHours) {}
    public record Browse(List<String> allowedPaths) {}
}
