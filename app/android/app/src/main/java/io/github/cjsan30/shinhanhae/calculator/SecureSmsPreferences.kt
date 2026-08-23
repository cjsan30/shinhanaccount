package io.github.cjsan30.shinhanhae.calculator

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

private const val LEGACY_SMS_PREFS = "sms_approval_queue"
private const val SECURE_SMS_PREFS = "sms_approval_secure"
private const val MIGRATED_KEY = "legacy_migrated"

internal fun secureSmsPreferences(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    val secure = EncryptedSharedPreferences.create(
        context,
        SECURE_SMS_PREFS,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    if (!secure.getBoolean(MIGRATED_KEY, false)) {
        val legacy = context.getSharedPreferences(LEGACY_SMS_PREFS, Context.MODE_PRIVATE)
        val editor = secure.edit()
        legacy.all.forEach { (key, value) ->
            when (value) {
                is String -> editor.putString(key, value)
                is Int -> editor.putInt(key, value)
                is Long -> editor.putLong(key, value)
                is Float -> editor.putFloat(key, value)
                is Boolean -> editor.putBoolean(key, value)
            }
        }
        val migrated = editor.putBoolean(MIGRATED_KEY, true).commit()
        if (migrated) legacy.edit().clear().apply()
    }
    return secure
}
