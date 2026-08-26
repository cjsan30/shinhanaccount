package io.github.cjsan30.shinhanhae.calculator;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.Locale;

public class SupportWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "support_widget_snapshot";
    private static final int MAX = 1000;
    private static final String POLICY_REQUIRED = "\uC815\uCC45\uC744 \uD655\uC815\uD574 \uC8FC\uC138\uC694";
    private static final String HIDDEN = "\uAE08\uC561 \uC228\uAE40";
    private static final String TOTAL_REMAINING = "\uCD1D \uC794\uC561";
    private static final String UNDECIDED = "\uBBF8\uC815 ";
    private static final String TITLE = "\uC9C0\uC6D0\uAE08 \uAD00\uB9AC";
    private static final String RESIDENT = "\uC815\uC8FC\uBE44";
    private static final String STUDY = "\uD559\uC2B5\uACF5\uAC04\uBE44";
    private static final String COUNT = "\uAC74";
    private static final String RESIZE_HINT_PREFIX = "widget_resize_hint_";
    private static final String INITIAL_WIDTH_PREFIX = "widget_initial_width_";
    private static final String INITIAL_HEIGHT_PREFIX = "widget_initial_height_";

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) updateAll(context);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            storeInitialSize(context, id, options);
            manager.updateAppWidget(id, render(context, id, layoutForSize(width(options), height(options)), height(options)));
        }
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        super.onAppWidgetOptionsChanged(context, manager, id, options);
        dismissResizeHintAfterResize(context, id, options);
        manager.updateAppWidget(id, render(context, id, layoutForSize(width(options), height(options)), height(options)));
    }

    @Override public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) {
            editor.remove(RESIZE_HINT_PREFIX + id);
            editor.remove(INITIAL_WIDTH_PREFIX + id);
            editor.remove(INITIAL_HEIGHT_PREFIX + id);
        }
        editor.apply();
        super.onDeleted(context, ids);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SupportWidgetProvider.class));
        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            int layout = layoutForSize(width(options), height(options));
            Log.d("SupportWidget", "update id=" + id + " width=" + width(options) + " height=" + height(options) + " layout=" + layout);
            manager.updateAppWidget(id, render(context, id, layout, height(options)));
        }
    }

    static int layoutForSize(int widthDp, int heightDp) {
        if (widthDp < 110) return R.layout.widget_1x1;
        if (widthDp < 220) return R.layout.widget_2x1;
        if (heightDp >= 354) return R.layout.widget_tall_7;
        if (heightDp >= 281) return R.layout.widget_tall_4;
        if (heightDp >= 208) return R.layout.widget_tall_3;
        if (heightDp >= 135) return R.layout.widget_4x2;
        return R.layout.widget_wide_1row;
    }

    private static RemoteViews render(Context context, int id, int layout, int heightDp) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean ready = prefs.getBoolean("ready", false);
        boolean hide = prefs.getBoolean("hideAmounts", false);
        int totalLimit = prefs.getInt("totalLimit", 0);
        int totalSpent = prefs.getInt("totalSpent", 0);
        int residentLimit = prefs.getInt("residentLimit", 0);
        int residentSpent = prefs.getInt("residentSpent", 0);
        int studyLimit = prefs.getInt("studyLimit", 0);
        int studySpent = prefs.getInt("studySpent", 0);
        int undecided = prefs.getInt("undecidedCount", 0);
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        if (!ready) {
            views.setTextViewText(R.id.widget_title, POLICY_REQUIRED);
            views.setOnClickPendingIntent(R.id.widget_root, launchIntent(context));
            return views;
        }
        int totalRemaining = Math.max(0, totalLimit - totalSpent);
        int residentRemaining = Math.max(0, residentLimit - residentSpent);
        int studyRemaining = Math.max(0, studyLimit - studySpent);
        int totalProgress = progress(totalSpent, totalLimit);
        int residentProgress = progress(residentSpent, residentLimit);
        int studyProgress = progress(studySpent, studyLimit);
        String totalAmount = hide ? HIDDEN : won(totalRemaining);
        if (layout == R.layout.widget_1x1) {
            views.setTextViewText(R.id.widget_title, TOTAL_REMAINING);
            views.setTextViewText(R.id.widget_percent, totalAmount);
            views.setImageViewBitmap(R.id.widget_drop, WidgetDropBitmap.create(totalProgress));
        } else if (layout == R.layout.widget_2x1) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
        } else if (layout == R.layout.widget_4x1) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
        } else if (layout == R.layout.widget_wide_1row) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
            views.setTextViewText(R.id.widget_resident_amount, RESIDENT + " " + (hide ? HIDDEN : won(residentRemaining)));
            views.setTextViewText(R.id.widget_study_amount, STUDY + " " + (hide ? HIDDEN : won(studyRemaining)));
        } else if (isDetailLayout(layout)) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
            views.setTextViewText(R.id.widget_resident_amount, RESIDENT + " · " + (hide ? HIDDEN : won(residentRemaining)));
            views.setTextViewText(R.id.widget_study_amount, STUDY + " · " + (hide ? HIDDEN : won(studyRemaining)));
            views.setTextViewText(R.id.widget_undecided, UNDECIDED + undecided + COUNT);
            int rowCount = detailRowCount(layout, heightDp);
            setDetailRow(views, R.id.widget_detail_1, R.id.widget_detail_1_progress, prefs, 0, rowCount >= 1, hide);
            setDetailRow(views, R.id.widget_detail_2, R.id.widget_detail_2_progress, prefs, 1, rowCount >= 2, hide);
            if (rowCount >= 3) setDetailRow(views, R.id.widget_detail_3, R.id.widget_detail_3_progress, prefs, 2, true, hide);
            if (rowCount >= 4) setDetailRow(views, R.id.widget_detail_4, R.id.widget_detail_4_progress, prefs, 3, true, hide);
            if (rowCount >= 5) setDetailRow(views, R.id.widget_detail_5, R.id.widget_detail_5_progress, prefs, 4, true, hide);
            if (rowCount >= 6) setDetailRow(views, R.id.widget_detail_6, R.id.widget_detail_6_progress, prefs, 5, true, hide);
            if (rowCount >= 7) setDetailRow(views, R.id.widget_detail_7, R.id.widget_detail_7_progress, prefs, 6, true, hide);
        } else {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
            views.setTextViewText(R.id.widget_resident_amount, RESIDENT + " \u00B7 " + (hide ? HIDDEN : won(residentRemaining)));
            views.setTextViewText(R.id.widget_study_amount, STUDY + " \u00B7 " + (hide ? HIDDEN : won(studyRemaining)));
            views.setTextViewText(R.id.widget_undecided, UNDECIDED + undecided + COUNT);
        }
        views.setOnClickPendingIntent(R.id.widget_root, launchIntent(context));
        return views;
    }

    private static PendingIntent launchIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 77, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int progress(int spent, int limit) {
        if (limit <= 0) return 0;
        return Math.max(0, Math.min(MAX, Math.round((spent * 1f / limit) * MAX)));
    }
    static String percent(int progress) { return String.format(Locale.KOREA, "%.1f%%", progress / 10f); }
    private static int width(Bundle options) { return options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250); }
    private static int height(Bundle options) { return options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 40); }
    private static void storeInitialSize(Context context, int id, Bundle options) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(INITIAL_WIDTH_PREFIX + id)) {
            prefs.edit().putInt(INITIAL_WIDTH_PREFIX + id, width(options)).putInt(INITIAL_HEIGHT_PREFIX + id, height(options)).apply();
        }
    }
    private static void dismissResizeHintAfterResize(Context context, int id, Bundle options) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(INITIAL_WIDTH_PREFIX + id)) {
            storeInitialSize(context, id, options);
            return;
        }
        int changedWidth = Math.abs(width(options) - prefs.getInt(INITIAL_WIDTH_PREFIX + id, width(options)));
        int changedHeight = Math.abs(height(options) - prefs.getInt(INITIAL_HEIGHT_PREFIX + id, height(options)));
        if (changedWidth >= 20 || changedHeight >= 20) prefs.edit().putBoolean(RESIZE_HINT_PREFIX + id, true).apply();
    }
    private static boolean isDetailLayout(int layout) { return layout == R.layout.widget_tall_2 || layout == R.layout.widget_tall_3 || layout == R.layout.widget_tall_4 || layout == R.layout.widget_tall_7; }
    static int detailRowCount(int layout, int heightDp) {
        if (layout == R.layout.widget_tall_7) {
            if (heightDp >= 500) return 7;
            if (heightDp >= 427) return 6;
            return 5;
        }
        return layout == R.layout.widget_tall_4 ? 4 : layout == R.layout.widget_tall_3 ? 3 : 2;
    }
    private static void setDetailRow(RemoteViews views, int textId, int progressId, SharedPreferences prefs, int index, boolean shouldShow, boolean hide) {
        String label = prefs.getString("detailLabel" + index, "");
        int limit = prefs.getInt("detailLimit" + index, 0);
        if (!shouldShow || label == null || label.isEmpty() || limit <= 0) {
            views.setViewVisibility(textId, View.GONE);
            views.setViewVisibility(progressId, View.GONE);
            return;
        }
        int spent = prefs.getInt("detailSpent" + index, 0);
        views.setViewVisibility(textId, View.VISIBLE);
        views.setViewVisibility(progressId, View.VISIBLE);
        views.setTextViewText(textId, label + " · " + (hide ? HIDDEN : won(Math.max(0, limit - spent))));
        views.setProgressBar(progressId, MAX, progress(spent, limit), false);
    }
    private static String won(int amount) { return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "\uC6D0"; }
}
