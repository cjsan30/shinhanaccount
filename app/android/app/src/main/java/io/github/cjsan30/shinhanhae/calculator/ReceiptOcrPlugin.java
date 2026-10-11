package io.github.cjsan30.shinhanhae.calculator;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;

@CapacitorPlugin(name = "ReceiptOcr")
public class ReceiptOcrPlugin extends Plugin {
    @com.getcapacitor.PluginMethod
    public void recognize(PluginCall call) {
        String base64Data = call.getString("base64Data");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("영수증 이미지가 필요합니다.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) throw new IllegalArgumentException("이미지를 읽지 못했습니다.");
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build())
                .process(image)
                .addOnSuccessListener(result -> {
                    bitmap.recycle();
                    JSObject output = new JSObject();
                    output.put("text", result.getText());
                    call.resolve(output);
                })
                .addOnFailureListener(error -> {
                    bitmap.recycle();
                    call.reject("영수증 글자를 읽지 못했습니다.", error);
                });
        } catch (Exception error) {
            call.reject("영수증 이미지를 준비하지 못했습니다.", error);
        }
    }
}
