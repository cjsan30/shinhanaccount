package io.github.cjsan30.shinhanhae.calculator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {
    @Test
    public void appUsesTheConfiguredPackage() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("io.github.cjsan30.shinhanhae.calculator", appContext.getPackageName());
    }

    @Test
    public void notificationListenerAndWidgetAreRegistered() throws PackageManager.NameNotFoundException {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager packageManager = appContext.getPackageManager();

        ComponentName listener = new ComponentName(appContext, ShinhanMessageNotificationListener.class);
        assertEquals(
            "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
            packageManager.getServiceInfo(listener, 0).permission
        );

        ComponentName widget = new ComponentName(appContext, SupportWidgetProvider.class);
        assertNotNull(packageManager.getReceiverInfo(widget, PackageManager.GET_META_DATA).metaData);
    }

    @Test
    public void encryptedSmsStoreCanPersistAndRemoveTemporaryValue() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences store = SecureSmsPreferencesKt.secureSmsPreferences(appContext);
        String key = "instrumentation-temporary-value";

        assertTrue(store.edit().putString(key, "ok").commit());
        assertEquals("ok", store.getString(key, null));
        assertTrue(store.edit().remove(key).commit());
    }
}
