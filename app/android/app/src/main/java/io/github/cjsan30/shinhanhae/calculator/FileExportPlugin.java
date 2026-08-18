package io.github.cjsan30.shinhanhae.calculator;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {
    private static final String FOLDER = "Download/신청해 계산기";

    @com.getcapacitor.PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Android 10 이상에서 직접 저장할 수 있습니다.");
            return;
        }
        String fileName = call.getString("fileName");
        String data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || data == null) {
            call.reject("파일 이름과 데이터가 필요합니다.");
            return;
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, FOLDER);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("저장 위치를 만들지 못했습니다.");
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (stream == null) throw new IllegalStateException("파일을 열지 못했습니다.");
                stream.write(Base64.decode(data, Base64.DEFAULT));
            }
            ContentValues complete = new ContentValues();
            complete.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, complete, null, null);
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("fileName", fileName);
            result.put("relativePath", "Downloads/신청해 계산기");
            call.resolve(result);
        } catch (Exception error) {
            if (uri != null) getContext().getContentResolver().delete(uri, null, null);
            call.reject("파일을 저장하지 못했습니다.", error);
        }
    }
}
