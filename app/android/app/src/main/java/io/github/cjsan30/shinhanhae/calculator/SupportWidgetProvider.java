package io.github.cjsan30.shinhanhae.calculator;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
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

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, render(context, id, widgetLayout()));
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        super.onAppWidgetOptionsChanged(context, manager, id, options);
        manager.updateAppWidget(id, render(context, id, widgetLayout()));
    }

    protected int widgetLayout() { return R.layout.widget_4x2; }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        updateProvider(context, manager, SupportWidgetProvider.class, R.layout.widget_4x2);
        updateProvider(context, manager, SupportWidget4x1Provider.class, R.layout.widget_4x1);
        updateProvider(context, manager, SupportWidget2x1Provider.class, R.layout.widget_2x1);
        updateProvider(context, manager, SupportWidget1x1Provider.class, R.layout.widget_1x1);
    }

    private static void updateProvider(Context context, AppWidgetManager manager, Class<? extends SupportWidgetProvider> provider, int layout) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        for (int id : ids) manager.updateAppWidget(id, render(context, id, layout));
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

    private static int progress(int spent, int limit) {
        if (limit <= 0) return 0;
        return Math.max(0, Math.min(MAX, Math.round((spent * 1f / limit) * MAX)));
    }
    private static String percent(int progress) { return String.format(Locale.KOREA, "%.1f%%", progress / 10f); }
    private static String won(int amount) { return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "\uC6D0"; }
}