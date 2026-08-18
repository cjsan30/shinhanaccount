package io.github.cjsan30.shinhanhae.calculator;

import android.app.ActivityManager;
import android.app.ApplicationStartInfo;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

@CapacitorPlugin(name = "AppHealth")
public class AppHealthPlugin extends Plugin {
    private boolean consumed = false;

    @com.getcapacitor.PluginMethod
    public void getStartupStatus(PluginCall call) {
        boolean forceStopped = false;
        if (!consumed && Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            ActivityManager manager = getContext().getSystemService(ActivityManager.class);
            List<ApplicationStartInfo> starts = manager.getHistoricalProcessStartReasons(1);
            forceStopped = !starts.isEmpty() && starts.get(0).wasForceStopped();
        }
        consumed = true;
        JSObject result = new JSObject();
        result.put("forceStopped", forceStopped);
        call.resolve(result);
    }
}
