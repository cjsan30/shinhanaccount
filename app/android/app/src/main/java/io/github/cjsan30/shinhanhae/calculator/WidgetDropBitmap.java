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
        drop.moveTo(256f, 14f);
        drop.cubicTo(423f, 178f, 454f, 292f, 412f, 388f);
        drop.cubicTo(380f, 462f, 322f, 494f, 256f, 494f);
        drop.cubicTo(190f, 494f, 132f, 462f, 100f, 388f);
        drop.cubicTo(58f, 292f, 89f, 178f, 256f, 14f);
        drop.close();

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(20, 43, 72));
        canvas.drawPath(drop, paint);
        canvas.save();
        canvas.clipPath(drop);
        float top = 465f - (Math.max(0, Math.min(1000, progress)) / 1000f * 385f);
        paint.setShader(new LinearGradient(0, top, 0, 494, Color.rgb(118, 234, 219), Color.rgb(43, 146, 188), Shader.TileMode.CLAMP));
        canvas.drawRect(70f, top, 442f, 510f, paint);
        paint.setShader(null);
        canvas.restore();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(7f);
        paint.setColor(Color.rgb(142, 241, 226));
        canvas.drawPath(drop, paint);
        return bitmap;
    }
}