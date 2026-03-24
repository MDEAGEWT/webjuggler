package com.webjuggler;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.webjuggler.config.WebJugglerProperties;

@SpringBootApplication
@EnableConfigurationProperties(WebJugglerProperties.class)
public class WebJugglerApplication {
    public static void main(String[] args) {
        SpringApplication.run(WebJugglerApplication.class, args);
    }
}
