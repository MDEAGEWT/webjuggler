package com.webjuggler.data;

import com.webjuggler.config.WebJugglerProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class ConfigController {

    private final WebJugglerProperties properties;

    public ConfigController(WebJugglerProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/api/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        return ResponseEntity.ok(Map.of(
            "mode", properties.mode(),
            "nextcloudUrl", properties.nextcloud() != null ? properties.nextcloud().url() : ""
        ));
    }
}
