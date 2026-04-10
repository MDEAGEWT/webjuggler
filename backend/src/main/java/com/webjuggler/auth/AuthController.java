package com.webjuggler.auth;

import com.webjuggler.config.WebJugglerProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final WebJugglerProperties properties;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          WebJugglerProperties properties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.properties = properties;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        if ("nas".equals(properties.mode())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        String username = body.get("username");
        String password = body.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "username and password required"));
        }

        if (userRepository.findByUsername(username).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "username already taken"));
        }

        User user = new User();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        userRepository.save(user);

        String token = jwtService.generateToken(username);
        return ResponseEntity.ok(Map.of("token", token));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");

        if ("nas".equals(properties.mode())) {
            return loginViaNextcloud(username, password);
        }

        return userRepository.findByUsername(username)
                .filter(user -> passwordEncoder.matches(password, user.getPasswordHash()))
                .map(user -> {
                    String token = jwtService.generateToken(username);
                    return ResponseEntity.ok((Object) Map.of("token", token));
                })
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "invalid credentials")));
    }

    private ResponseEntity<?> loginViaNextcloud(String username, String password) {
        try {
            String url = properties.nextcloud().url() + "/ocs/v1.php/cloud/user";
            var connection = (java.net.HttpURLConnection) new java.net.URI(url).toURL().openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("OCS-APIRequest", "true");
            connection.setRequestProperty("Accept", "application/json");
            String encoded = java.util.Base64.getEncoder()
                    .encodeToString((username + ":" + password).getBytes());
            connection.setRequestProperty("Authorization", "Basic " + encoded);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);

            int status = connection.getResponseCode();
            if (status == 200) {
                String token = jwtService.generateToken(username);
                return ResponseEntity.ok(Map.of("token", token));
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "invalid credentials"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Nextcloud unavailable: " + e.getMessage()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@RequestHeader("Authorization") String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "missing or invalid Authorization header"));
        }

        try {
            String token = authHeader.substring(7);
            String username = jwtService.validateToken(token);
            String newToken = jwtService.generateToken(username);
            return ResponseEntity.ok(Map.of("token", newToken));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "invalid or expired token"));
        }
    }
}
