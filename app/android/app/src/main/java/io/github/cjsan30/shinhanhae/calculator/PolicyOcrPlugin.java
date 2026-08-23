package io.github.cjsan30.shinhanhae.calculator;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Rect;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
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

    private static final class OcrLine {
        final String value;
        final Rect bounds;

        OcrLine(String value, Rect bounds) {
            this.value = value;
            this.bounds = bounds;
        }
    }

    private String toVisualRows(Text result) {
        List<OcrLine> lines = new ArrayList<>();
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect bounds = line.getBoundingBox();
                if (bounds != null && !line.getText().trim().isEmpty()) lines.add(new OcrLine(line.getText(), bounds));
            }
        }
        lines.sort(Comparator.comparingInt((OcrLine line) -> line.bounds.centerY()).thenComparingInt(line -> line.bounds.left));

        List<List<OcrLine>> rows = new ArrayList<>();
        for (OcrLine line : lines) {
            if (rows.isEmpty()) {
                List<OcrLine> first = new ArrayList<>();
                first.add(line);
                rows.add(first);
                continue;
            }
            List<OcrLine> current = rows.get(rows.size() - 1);
            int rowCenter = current.stream().mapToInt(item -> item.bounds.centerY()).sum() / current.size();
            if (Math.abs(line.bounds.centerY() - rowCenter) <= 32) current.add(line);
            else {
                List<OcrLine> next = new ArrayList<>();
                next.add(line);
                rows.add(next);
            }
        }

        StringBuilder output = new StringBuilder();
        for (List<OcrLine> row : rows) {
            row.sort(Comparator.comparingInt(line -> line.bounds.left));
            for (OcrLine line : row) {
                if (output.length() > 0 && output.charAt(output.length() - 1) != '\n') output.append(' ');
                output.append(line.value);
            }
            output.append('\n');
        }
        return output.toString().trim();
    }
    private void recognize(PluginCall call, Uri uri) {
        try {
            InputImage image = InputImage.fromFilePath(getContext(), uri);
            TextRecognizer recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
            recognizer.process(image)
                .addOnSuccessListener(text -> {
                    JSObject output = new JSObject();
                    output.put("text", toVisualRows(text));
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