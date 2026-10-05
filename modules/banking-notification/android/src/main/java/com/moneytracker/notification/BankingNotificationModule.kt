package com.moneytracker.notification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.provider.Settings
import android.content.Intent
import android.app.Notification
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class BankingNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankingNotification")

    Events("onBankingNotificationReceived")

    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      val pkgName = context.packageName
      return@Function flat != null && flat.contains(pkgName)
    }

    Function("isServiceConnected") {
      return@Function BankingNotificationListenerService.isServiceConnected
    }

    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    OnCreate {
      BankingNotificationListenerService.onNotificationCallback = { sbn ->
        val extras = sbn.notification?.extras
        val title = extras?.getString(Notification.EXTRA_TITLE, "") ?: ""
        val text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
          ?: extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
          ?: ""
        val pkg = sbn.packageName ?: ""
        val timestamp = sbn.postTime

        val isoTimestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
          timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(timestamp))

        this@BankingNotificationModule.sendEvent("onBankingNotificationReceived", mapOf(
          "rawText" to text,
          "packageName" to pkg,
          "title" to title,
          "timestamp" to isoTimestamp
        ))
      }
    }

    OnDestroy {
      BankingNotificationListenerService.onNotificationCallback = null
    }
  }
}
