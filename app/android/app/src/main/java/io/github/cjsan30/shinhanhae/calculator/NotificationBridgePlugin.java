package io.github.cjsan30.shinhanhae.calculator;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
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
    private static final String CHANNEL_ID = "budget_alerts";

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
        call.resolve(new JSObject().put("granted", getPermissionState("notifications") == PermissionState.GRANTED));
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
            .setAutoCancel(true);
        NotificationManagerCompat.from(getContext()).notify((int) System.currentTimeMillis(), notification.build());
        call.resolve();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "지원금 경고", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("지원금 예산 사용 경고");
        ((NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
}