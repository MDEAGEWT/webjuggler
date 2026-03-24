package com.webjuggler.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DataControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    private String token;
    private String fileId;

    @BeforeEach
    void setup() throws Exception {
        String username = "datauser_" + System.nanoTime();
        var authResult = mvc.perform(post("/api/auth/register")
            .contentType("application/json")
            .content("{\"username\":\"" + username + "\",\"password\":\"pass123\"}"))
            .andReturn();
        token = objectMapper.readTree(authResult.getResponse().getContentAsString())
            .get("token").asText();

        byte[] data = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        var uploadResult = mvc.perform(multipart("/api/files/upload")
            .file(new MockMultipartFile("file", "test.ulg", "application/octet-stream", data))
            .header("Authorization", "Bearer " + token))
            .andReturn();
        fileId = objectMapper.readTree(uploadResult.getResponse().getContentAsString())
            .get("fileId").asText();
    }

    @Test
    void getTopics() throws Exception {
        mvc.perform(get("/api/files/" + fileId + "/topics")
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.topics").isArray())
            .andExpect(jsonPath("$.topics[0].name").isString())
            .andExpect(jsonPath("$.topics[0].fields").isArray())
            .andExpect(jsonPath("$.topics[0].dataPoints").isNumber());
    }

    @Test
    void getInfo() throws Exception {
        mvc.perform(get("/api/files/" + fileId + "/info")
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.info").isMap())
            .andExpect(jsonPath("$.topicCount").isNumber());
    }

    @Test
    void getData() throws Exception {
        // First get topics to find a valid field
        var topicsResult = mvc.perform(get("/api/files/" + fileId + "/topics")
            .header("Authorization", "Bearer " + token))
            .andReturn();
        var topics = objectMapper.readTree(topicsResult.getResponse().getContentAsString())
            .get("topics");
        String topicName = topics.get(0).get("name").asText();
        String fieldName = topics.get(0).get("fields").get(0).asText();
        String fullPath = topicName + fieldName;

        mvc.perform(post("/api/files/" + fileId + "/data")
            .header("Authorization", "Bearer " + token)
            .contentType("application/json")
            .content("{\"fields\":[\"" + fullPath + "\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fields").isMap())
            .andExpect(jsonPath("$.fields['" + fullPath + "'].timestamps").isArray())
            .andExpect(jsonPath("$.fields['" + fullPath + "'].values").isArray());
    }

    @Test
    void getNonexistentFile404() throws Exception {
        mvc.perform(get("/api/files/nonexistent/topics")
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound());
    }
}
