package io.github.cjsan30.shinhanhae.calculator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import org.junit.Test;

public class EvidenceVaultRemoveTest {
    @Test
    public void removesAFileAndTreatsAMissingOneAsRemoved() throws Exception {
        File directory = Files.createTempDirectory("vault").toFile();
        File stored = new File(directory, "evidence01");
        try (FileOutputStream output = new FileOutputStream(stored)) { output.write(new byte[] { 1, 2, 3 }); }
        assertTrue(EvidenceVaultPlugin.removeFile(stored));
        assertFalse(stored.exists());
        assertTrue(EvidenceVaultPlugin.removeFile(new File(directory, "evidence02")));
    }

    @Test
    public void reportsAFileThatCouldNotBeDeleted() throws Exception {
        // A non-empty directory under the same name cannot be deleted with File.delete().
        File directory = Files.createTempDirectory("vault").toFile();
        File stuck = new File(directory, "evidence03");
        assertTrue(stuck.mkdir());
        try (FileOutputStream output = new FileOutputStream(new File(stuck, "inner"))) { output.write(1); }
        assertFalse(EvidenceVaultPlugin.removeFile(stuck));
    }
}
