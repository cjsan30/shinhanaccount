package io.github.cjsan30.shinhanhae.calculator;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @com.getcapacitor.PluginMethod
    public void sync(PluginCall call) {
        SharedPreferences.Editor editor = getContext().getSharedPreferences(SupportWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        editor.putBoolean("ready", call.getBoolean("ready", false));
        editor.putBoolean("hideAmounts", call.getBoolean("hideAmounts", false));
        editor.putInt("totalLimit", call.getInt("totalLimit", 0));
        editor.putInt("totalSpent", call.getInt("totalSpent", 0));
        editor.putInt("residentLimit", call.getInt("residentLimit", 0));
        editor.putInt("residentSpent", call.getInt("residentSpent", 0));
        editor.putInt("studyLimit", call.getInt("studyLimit", 0));
        editor.putInt("studySpent", call.getInt("studySpent", 0));
        editor.putInt("undecidedCount", call.getInt("undecidedCount", 0));
        JSArray residentRows = call.getArray("residentRows");
        for (int index = 0; index < 4; index++) {
            JSONObject row = residentRows == null ? null : residentRows.optJSONObject(index);
            if (row == null) {
                editor.remove("residentRowLabel" + index).remove("residentRowLimit" + index).remove("residentRowSpent" + index);
            } else {
                editor.putString("residentRowLabel" + index, row.optString("label", ""));
                editor.putInt("residentRowLimit" + index, row.optInt("limit", 0));
                editor.putInt("residentRowSpent" + index, row.optInt("spent", 0));
            }
        }
        editor.apply();
        SupportWidgetProvider.updateAll(getContext());
        call.resolve();
    }
}
