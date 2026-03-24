package com.webjuggler.file;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FileRepository extends JpaRepository<FileEntity, String> {
    List<FileEntity> findByUploadedBy(String username);
}
