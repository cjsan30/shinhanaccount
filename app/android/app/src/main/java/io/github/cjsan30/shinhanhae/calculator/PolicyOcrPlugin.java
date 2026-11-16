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

    /**
     * Every recognized line with its position on the image. Reading the plan table is done in
     * TypeScript from these boxes (domain/planOcr.ts), so it can tell the amount column from the
     * ratio column and the notes below the table.
     */
    static com.getcapacitor.JSArray toLineBoxes(Text result) {
        com.getcapacitor.JSArray lines = new com.getcapacitor.JSArray();
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect bounds = line.getBoundingBox();
                if (bounds == null || line.getText().trim().isEmpty()) continue;
                JSObject item = new JSObject();
                item.put("text", line.getText());
                item.put("left", bounds.left);
                item.put("top", bounds.top);
                item.put("right", bounds.right);
                item.put("bottom", bounds.bottom);
                lines.put(item);
            }
        }
        return lines;
    }

    /** Screenshots narrower than this are enlarged before OCR; small plan text is misread otherwise. */
    static final int MIN_OCR_WIDTH = 1440;

    /**
     * The image to recognize. Images narrower than [MIN_OCR_WIDTH] are scaled up first: device
     * runs with the plan screenshot (docs/10, 2026-11-16) read 720 and 1080 px images correctly
     * only after enlarging. ImageDecoder applies the photo's rotation.
     */
    static InputImage preparedImage(android.content.Context context, Uri uri) throws java.io.IOException {
        android.graphics.Bitmap bitmap = android.graphics.ImageDecoder.decodeBitmap(
            android.graphics.ImageDecoder.createSource(context.getContentResolver(), uri),
            (decoder, info, source) -> {
                decoder.setAllocator(android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE);
                int width = info.getSize().getWidth();
                if (width > 0 && width < MIN_OCR_WIDTH) {
                    float scale = (float) MIN_OCR_WIDTH / width;
                    decoder.setTargetSize(MIN_OCR_WIDTH, Math.round(info.getSize().getHeight() * scale));
                }
            });
        return InputImage.fromBitmap(bitmap, 0);
    }

    /** Shared with the verification build's batch reader so both read the plan the same way. */
    static String toVisualRows(Text result) {
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
            InputImage image = preparedImage(getContext(), uri);
            TextRecognizer recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
            recognizer.process(image)
                .addOnSuccessListener(text -> {
                    JSObject output = new JSObject();
                    output.put("text", toVisualRows(text));
                    output.put("lines", toLineBoxes(text));
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