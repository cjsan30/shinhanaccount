package io.github.cjsan30.shinhanhae.calculator;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.Locale;

public class SupportWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "support_widget_snapshot";
    private static final int MAX = 1000;
    private static final String POLICY_REQUIRED = "\uC815\uCC45\uC744 \uD655\uC815\uD574 \uC8FC\uC138\uC694";
    private static final String HIDDEN = "\uAE08\uC561 \uC228\uAE40";
    private static final String TOTAL_USAGE = "\uC804\uCCB4 \uC0AC\uC6A9";
    private static final String UNDECIDED = "\uBBF8\uC815 ";
    private static final String TITLE = "\uC9C0\uC6D0\uAE08 \uAD00\uB9AC";
    private static final String RESIDENT = "\uC815\uC8FC\uBE44";
    private static final String STUDY = "\uD559\uC2B5\uACF5\uAC04\uBE44";
    private static final String COUNT = "\uAC74";
    private static final String RESIZE_HINT_PREFIX = "widget_resize_hint_";
    private static final String INITIAL_WIDTH_PREFIX = "widget_initial_width_";
    private static final String INITIAL_HEIGHT_PREFIX = "widget_initial_height_";

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            storeInitialSize(context, id, options);
            manager.updateAppWidget(id, render(context, id, layoutForSize(width(options), height(options))));
        }
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        super.onAppWidgetOptionsChanged(context, manager, id, options);
        dismissResizeHintAfterResize(context, id, options);
        manager.updateAppWidget(id, render(context, id, layoutForSize(width(options), height(options))));
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
            manager.updateAppWidget(id, render(context, id, layoutForSize(width(options), height(options))));
        }
    }

    static int layoutForSize(int widthDp, int heightDp) {
        if (widthDp < 110) return R.layout.widget_1x1;
        if (widthDp < 170) return R.layout.widget_2x1;
        if (heightDp >= 95) return R.layout.widget_4x2;
        if (widthDp < 230) return R.layout.widget_4x1;
        if (widthDp < 290) return R.layout.widget_4x1_detail;
        return R.layout.widget_5x1;
    }

    private static RemoteViews render(Context context, int id, int layout) {
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
            if (layout == R.layout.widget_2x1) {
                views.setTextViewText(R.id.widget_resident_title, POLICY_REQUIRED);
                views.setTextViewText(R.id.widget_study_title, "");
            } else {
                views.setTextViewText(R.id.widget_title, POLICY_REQUIRED);
            }
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
            views.setTextViewText(R.id.widget_title, TOTAL_USAGE);
            views.setTextViewText(R.id.widget_percent, percent(totalProgress));
            views.setImageViewBitmap(R.id.widget_drop, WidgetDropBitmap.create(totalProgress));
        } else if (layout == R.layout.widget_2x1) {
            views.setTextViewText(R.id.widget_resident_title, RESIDENT);
            views.setTextViewText(R.id.widget_study_title, STUDY);
            views.setTextViewText(R.id.widget_resident_percent, percent(residentProgress));
            views.setImageViewBitmap(R.id.widget_resident_drop, WidgetDropBitmap.create(residentProgress));
            views.setTextViewText(R.id.widget_study_percent, percent(studyProgress));
            views.setImageViewBitmap(R.id.widget_study_drop, WidgetDropBitmap.create(studyProgress));
        } else if (layout == R.layout.widget_4x1) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setTextViewText(R.id.widget_percent, percent(totalProgress));
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
        } else if (layout == R.layout.widget_4x1_detail) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setTextViewText(R.id.widget_percent, percent(totalProgress));
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
            views.setTextViewText(R.id.widget_breakdown, breakdown(hide, residentRemaining, studyRemaining));
            boolean resized = prefs.getBoolean(RESIZE_HINT_PREFIX + id, false);
            views.setViewVisibility(R.id.widget_resize_hint, resized ? View.GONE : View.VISIBLE);
        } else if (layout == R.layout.widget_5x1) {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setTextViewText(R.id.widget_percent, percent(totalProgress));
            views.setProgressBar(R.id.widget_progress, MAX, totalProgress, false);
            views.setTextViewText(R.id.widget_breakdown, breakdown(hide, residentRemaining, studyRemaining));
            views.setTextViewText(R.id.widget_undecided, UNDECIDED + undecided + COUNT);
        } else {
            views.setTextViewText(R.id.widget_title, TITLE);
            views.setTextViewText(R.id.widget_amount, totalAmount);
            views.setTextViewText(R.id.widget_percent, percent(totalProgress));
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
    private static String breakdown(boolean hide, int residentRemaining, int studyRemaining) {
        return RESIDENT + " " + (hide ? HIDDEN : won(residentRemaining)) + "   ·   " + STUDY + " " + (hide ? HIDDEN : won(studyRemaining));
    }
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
    private static String won(int amount) { return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "\uC6D0"; }
}
