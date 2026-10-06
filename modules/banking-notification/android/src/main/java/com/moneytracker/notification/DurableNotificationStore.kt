package com.moneytracker.notification

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * DurableNotificationStore.kt
 * Persistent queue for captured banking notifications.
 * 
 * Guarantees that notifications captured while MoneyTracker's React Native JS
 * is suspended, backgrounded, or killed are safely retained on disk (SharedPreferences)
 * until MoneyTracker starts/resumes and drains them into IngestionPipeline.
 */
object DurableNotificationStore {
    private const val PREFS_NAME = "moneytracker_banking_notifications"
    private const val KEY_PENDING = "pending_notifications"
    private const val MAX_STORED = 50
    private val lock = Any()

    /**
     * Persists an accepted banking notification payload to durable storage.
     */
    fun save(context: Context, payload: NotificationPayload) {
        synchronized(lock) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val rawJson = prefs.getString(KEY_PENDING, null)
                val array = if (rawJson != null) JSONArray(rawJson) else JSONArray()

                // Deduplicate within pending queue by rawText + packageName + title
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    if (obj.optString("rawText") == payload.rawText &&
                        obj.optString("packageName") == payload.packageName &&
                        obj.optString("title") == payload.title
                    ) {
                        Log.d("BankingNotification", "[DURABLE_STORE] Skip duplicate pending notification: ${payload.title}")
                        return
                    }
                }

                val obj = JSONObject().apply {
                    put("rawText", payload.rawText)
                    put("packageName", payload.packageName)
                    put("title", payload.title)
                    put("timestamp", payload.timestamp)
                }

                // Bound queue size to MAX_STORED
                if (array.length() >= MAX_STORED) {
                    val newArray = JSONArray()
                    for (i in 1 until array.length()) {
                        newArray.put(array.get(i))
                    }
                    newArray.put(obj)
                    prefs.edit().putString(KEY_PENDING, newArray.toString()).apply()
                } else {
                    array.put(obj)
                    prefs.edit().putString(KEY_PENDING, array.toString()).apply()
                }

                Log.i(
                    "BankingNotification",
                    "[DURABLE_STORE] Saved notification to disk (total=${array.length()}): pkg=${payload.packageName}, title=${payload.title}"
                )
            } catch (e: Exception) {
                Log.e("BankingNotification", "[DURABLE_STORE] Error saving notification: ${e.message}", e)
            }
        }
    }

    /**
     * Drains and removes all pending notifications from durable storage.
     */
    fun drain(context: Context): List<NotificationPayload> {
        synchronized(lock) {
            val result = mutableListOf<NotificationPayload>()
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val rawJson = prefs.getString(KEY_PENDING, null) ?: return result
                val array = JSONArray(rawJson)

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    result.add(
                        NotificationPayload(
                            rawText = obj.getString("rawText"),
                            packageName = obj.optString("packageName", ""),
                            title = obj.optString("title", ""),
                            timestamp = obj.optString("timestamp", "")
                        )
                    )
                }

                // Clear queue immediately upon successful read
                prefs.edit().remove(KEY_PENDING).commit()
                Log.i(
                    "BankingNotification",
                    "[DURABLE_STORE] Drained ${result.size} pending notification(s) from persistent storage"
                )
            } catch (e: Exception) {
                Log.e("BankingNotification", "[DURABLE_STORE] Error draining notifications: ${e.message}", e)
            }
            return result
        }
    }
}
