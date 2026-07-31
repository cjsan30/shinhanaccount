package io.github.cjsan30.shinhanhae.calculator;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;

@CapacitorPlugin(name = "PolicyOcr")
public class PolicyOcrPlugin extends Plugin {
    @com.getcapacitor.PluginMethod
    public void pickAndRecognize(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(call, intent, "imageSelected");
    }

    @ActivityCallback
    private void imageSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("No image selected");
            return;
        }
        recognize(call, result.getData().getData());
    }

    private void recognize(PluginCall call, Uri uri) {
        try {
            InputImage image = InputImage.fromFilePath(getContext(), uri);
            TextRecognizer recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
            recognizer.process(image)
                .addOnSuccessListener(text -> {
                    JSObject output = new JSObject();
                    output.put("text", text.getText());
                    call.resolve(output);
                    recognizer.close();
                })
                .addOnFailureListener(error -> {
                    recognizer.close();
                    call.reject("Text recognition failed", error);
                });
        } catch (Exception error) {
            call.reject("Unable to read image", error);
        }
    }
}