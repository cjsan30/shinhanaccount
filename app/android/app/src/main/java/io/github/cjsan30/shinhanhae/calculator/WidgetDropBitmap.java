package io.github.cjsan30.shinhanhae.calculator;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;

final class WidgetDropBitmap {
    private WidgetDropBitmap() {}
    static Bitmap create(int progress) {
        int size = 360;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Path drop = new Path();
        drop.moveTo(size / 2f, 28f);
        drop.cubicTo(290f, 122f, 305f, 185f, 295f, 240f);
        drop.cubicTo(285f, 305f, 228f, 332f, size / 2f, 332f);
        drop.cubicTo(132f, 332f, 75f, 305f, 65f, 240f);
        drop.cubicTo(55f, 185f, 70f, 122f, size / 2f, 28f);
        drop.close();
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(12, 31, 55));
        canvas.drawPath(drop, paint);
        canvas.save();
        canvas.clipPath(drop);
        float top = 315f - (progress / 1000f * 230f);
        paint.setShader(new LinearGradient(0, top, 0, 330, Color.rgb(112, 232, 215), Color.rgb(47, 151, 189), Shader.TileMode.CLAMP));
        canvas.drawRect(58, top, 302, 340, paint);
        paint.setShader(null);
        canvas.restore();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5f);
        paint.setColor(Color.rgb(137, 239, 225));
        canvas.drawPath(drop, paint);
        return bitmap;
    }
}