package io.github.cjsan30.shinhanhae.calculator;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;

final class WidgetDropBitmap {
    private WidgetDropBitmap() {}

    static Bitmap create(int progress) {
        final int size = 512;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Path drop = new Path();
        drop.moveTo(256f, 6f);
        drop.cubicTo(470f, 166f, 492f, 288f, 452f, 390f);
        drop.cubicTo(414f, 472f, 334f, 506f, 256f, 506f);
        drop.cubicTo(178f, 506f, 98f, 472f, 60f, 390f);
        drop.cubicTo(20f, 288f, 42f, 166f, 256f, 6f);
        drop.close();

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(20, 43, 72));
        canvas.drawPath(drop, paint);
        canvas.save();
        canvas.clipPath(drop);
        float top = 480f - (Math.max(0, Math.min(1000, progress)) / 1000f * 450f);
        paint.setShader(new LinearGradient(0, top, 0, 494, Color.rgb(118, 234, 219), Color.rgb(43, 146, 188), Shader.TileMode.CLAMP));
        canvas.drawRect(12f, top, 500f, 512f, paint);
        paint.setShader(null);
        canvas.restore();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(6f);
        paint.setColor(Color.rgb(142, 241, 226));
        canvas.drawPath(drop, paint);
        return bitmap;
    }
}