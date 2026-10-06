package com.moneytracker.notification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.provider.Settings
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import android.util.Log

class BankingNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankingNotification")

    Events("onBankingNotificationReceived")

    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      try {
        val isEnabledViaCompat = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        if (isEnabledViaCompat) return@Function true

        val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        val pkgName = context.packageName
        flat != null && flat.contains(pkgName)
      } catch (e: Exception) {
        Log.w("BankingNotification", "Error checking permission: ${e.message}")
        false
      }
    }

    Function("isServiceConnected") {
      BankingNotificationListenerService.isServiceConnected
    }

    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function Unit
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      Unit
    }

    Function("drainPendingNotifications") {
      val context = appContext.reactContext
      val pendingList = mutableListOf<Map<String, String>>()

      // 1. Drain from durable storage (persisted across app backgrounding & process death)
      if (context != null) {
        val durableItems = DurableNotificationStore.drain(context)
        for (item in durableItems) {
          pendingList.add(
            mapOf(
              "rawText" to item.rawText,
              "packageName" to item.packageName,
              "title" to item.title,
              "timestamp" to item.timestamp
            )
          )
        }
      }

      // 2. Also drain any in-memory items (deduplicated against durable list)
      synchronized(BankingNotificationListenerService.pendingNotifications) {
        for (item in BankingNotificationListenerService.pendingNotifications) {
          val alreadyPresent = pendingList.any {
            it["rawText"] == item.rawText && it["title"] == item.title && it["packageName"] == item.packageName
          }
          if (!alreadyPresent) {
            pendingList.add(
              mapOf(
                "rawText" to item.rawText,
                "packageName" to item.packageName,
                "title" to item.title,
                "timestamp" to item.timestamp
              )
            )
          }
        }
        BankingNotificationListenerService.pendingNotifications.clear()
      }

      Log.i("BankingNotification", "[NOTIF:BRIDGE] drainPendingNotifications returning ${pendingList.size} item(s)")
      pendingList
    }

    OnCreate {
      BankingNotificationListenerService.onNotificationCallback = { payload ->
        try {
          Log.i("BankingNotification", "[NOTIF:BRIDGE] emitting onBankingNotificationReceived: pkg=${payload.packageName}, title=${payload.title}")
          this@BankingNotificationModule.sendEvent("onBankingNotificationReceived", mapOf(
            "rawText" to payload.rawText,
            "packageName" to payload.packageName,
            "title" to payload.title,
            "timestamp" to payload.timestamp
          ))
        } catch (e: Exception) {
          Log.w("BankingNotification", "Failed to sendEvent to JS: ${e.message}")
        }
      }
    }

    OnDestroy {
      BankingNotificationListenerService.onNotificationCallback = null
    }
  }
}
