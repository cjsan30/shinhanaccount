package io.github.cjsan30.shinhanhae.calculator;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "EvidenceVault")
public class EvidenceVaultPlugin extends Plugin {
    private File vault() {
        File directory = new File(getContext().getFilesDir(), "evidence");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("증빙 보관함을 만들지 못했습니다.");
        return directory;
    }

    private String safeId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{8,80}")) throw new IllegalArgumentException("증빙 식별자가 올바르지 않습니다.");
        return id;
    }

    @com.getcapacitor.PluginMethod
    public void save(PluginCall call) {
        try {
            String id = safeId(call.getString("id"));
            String data = call.getString("base64Data");
            if (data == null) throw new IllegalArgumentException("증빙 데이터가 필요합니다.");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (FileOutputStream output = new FileOutputStream(new File(vault(), id))) { output.write(bytes); }
            JSObject result = new JSObject(); result.put("id", id); result.put("size", bytes.length); call.resolve(result);
        } catch (Exception error) { call.reject("증빙 파일을 보관하지 못했습니다.", error); }
    }

    @com.getcapacitor.PluginMethod
    public void read(PluginCall call) {
        try {
            String id = safeId(call.getString("id"));
            File file = new File(vault(), id);
            if (!file.exists()) { call.reject("보관된 증빙 파일을 찾지 못했습니다."); return; }
            byte[] bytes = new byte[(int) file.length()];
            try (FileInputStream input = new FileInputStream(file)) {
                int offset = 0; while (offset < bytes.length) { int read = input.read(bytes, offset, bytes.length - offset); if (read < 0) break; offset += read; }
            }
            JSObject result = new JSObject(); result.put("base64Data", Base64.encodeToString(bytes, Base64.NO_WRAP)); result.put("size", bytes.length); call.resolve(result);
        } catch (Exception error) { call.reject("증빙 파일을 읽지 못했습니다.", error); }
    }

    @com.getcapacitor.PluginMethod
    public void remove(PluginCall call) {
        try { String id = safeId(call.getString("id")); new File(vault(), id).delete(); call.resolve(); }
        catch (Exception error) { call.reject("증빙 파일을 삭제하지 못했습니다.", error); }
    }
}
