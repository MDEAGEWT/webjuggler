package com.webjuggler.file;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
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
class FileControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    private String getToken(String username) throws Exception {
        var result = mvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"pass123\"}"))
            .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
            .get("token").asText();
    }

    @Test
    void uploadAndListFiles() throws Exception {
        String token = getToken("fileuser_" + System.nanoTime());
        byte[] data = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        MockMultipartFile file = new MockMultipartFile("file", "test.ulg", "application/octet-stream", data);

        var uploadResult = mvc.perform(multipart("/api/files/upload").file(file)
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fileId").isString())
            .andExpect(jsonPath("$.filename").value("test.ulg"))
            .andExpect(jsonPath("$.status").value("READY"))
            .andReturn();

        mvc.perform(get("/api/files")
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isArray());
    }

    @Test
    void deleteOwnFile() throws Exception {
        String token = getToken("deluser_" + System.nanoTime());
        byte[] data = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        MockMultipartFile file = new MockMultipartFile("file", "del.ulg", "application/octet-stream", data);

        var result = mvc.perform(multipart("/api/files/upload").file(file)
            .header("Authorization", "Bearer " + token))
            .andReturn();
        String fileId = objectMapper.readTree(result.getResponse().getContentAsString())
            .get("fileId").asText();

        mvc.perform(delete("/api/files/" + fileId)
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());
    }

    @Test
    void cannotDeleteOtherUsersFile() throws Exception {
        String token1 = getToken("owner_" + System.nanoTime());
        String token2 = getToken("other_" + System.nanoTime());
        byte[] data = Files.readAllBytes(Path.of("src/test/resources/sample.ulg"));
        MockMultipartFile file = new MockMultipartFile("file", "own.ulg", "application/octet-stream", data);

        var result = mvc.perform(multipart("/api/files/upload").file(file)
            .header("Authorization", "Bearer " + token1))
            .andReturn();
        String fileId = objectMapper.readTree(result.getResponse().getContentAsString())
            .get("fileId").asText();

        mvc.perform(delete("/api/files/" + fileId)
            .header("Authorization", "Bearer " + token2))
            .andExpect(status().isForbidden());
    }
}
