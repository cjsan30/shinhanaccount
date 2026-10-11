package io.github.cjsan30.shinhanhae.calculator;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppInformation")
public class AppInformationPlugin extends Plugin {
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("app_information", Context.MODE_PRIVATE);
    }
    @com.getcapacitor.PluginMethod
    public void getConfirmation(PluginCall call) {
        JSObject result = new JSObject();
        result.put("confirmed", preferences().getBoolean("notice_v1_confirmed", false));
        call.resolve(result);
    }
    @com.getcapacitor.PluginMethod
    public void confirm(PluginCall call) {
        // Complete the disk write before closing the notice. WebView storage and
        // SharedPreferences.apply() can lose a just-written flag on force-stop.
        if (!preferences().edit().putBoolean("notice_v1_confirmed", true).commit()) {
            call.reject("안내 확인 여부를 저장하지 못했습니다.");
            return;
        }
        JSObject result = new JSObject();
        result.put("confirmed", true);
        call.resolve(result);
    }
}
