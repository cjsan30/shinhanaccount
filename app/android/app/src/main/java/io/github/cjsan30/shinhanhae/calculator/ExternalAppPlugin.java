package io.github.cjsan30.shinhanhae.calculator;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalApp")
public class ExternalAppPlugin extends Plugin {
    @com.getcapacitor.PluginMethod
    public void open(PluginCall call) {
        String packageId = call.getString("packageId");
        String playStoreUrl = call.getString("playStoreUrl");
        if (packageId == null || playStoreUrl == null) {
            call.reject("열 앱 정보가 필요합니다.");
            return;
        }

        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageId);
        String target = "app";
        if (intent == null) {
            target = "store";
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageId));
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(playStoreUrl));
            }
        }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("target", target);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("신한카드 앱을 열지 못했습니다. 설치 여부를 확인해 주세요.", error);
        }
    }
}
