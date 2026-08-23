package io.github.cjsan30.shinhanhae.calculator;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "NotificationBridge", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class NotificationBridgePlugin extends Plugin {
    private static final String CHANNEL_ID = "budget_alerts_v2";
    private static final int BUDGET_ALERT_NOTIFICATION_ID = 1001;

    @com.getcapacitor.PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        call.resolve(new JSObject().put("granted", notificationsEnabled()));
    }

    @com.getcapacitor.PluginMethod
    public void getPermissionStatus(PluginCall call) {
        call.resolve(new JSObject().put("granted", notificationsEnabled()));
    }

    @com.getcapacitor.PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @com.getcapacitor.PluginMethod
    public void show(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is required");
            return;
        }
        createChannel();
        String title = call.getString("title", "지원금 알림");
        String body = call.getString("body", "예산 사용 현황을 확인해 주세요.");
        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE)
            .setAutoCancel(true);
        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(getContext());
        notificationManager.cancelAll();
        notificationManager.notify(BUDGET_ALERT_NOTIFICATION_ID, notification.build());
        call.resolve();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "지원금 경고", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("지원금 예산 사용 경고");
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
        channel.setSound(sound, attributes);
        channel.enableVibration(true);
        ((NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    private boolean notificationsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) return false;
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }
}
