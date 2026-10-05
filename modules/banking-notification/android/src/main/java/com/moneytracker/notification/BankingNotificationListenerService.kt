package com.moneytracker.notification

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class BankingNotificationListenerService : NotificationListenerService() {
    companion object {
        var onNotificationCallback: ((sbn: StatusBarNotification) -> Unit)? = null
        var isServiceConnected: Boolean = false
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isServiceConnected = true
        Log.d("BankingNotification", "BankingNotificationListenerService successfully connected to Android OS!")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isServiceConnected = false
        Log.d("BankingNotification", "BankingNotificationListenerService disconnected from Android OS.")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkg = sbn.packageName?.lowercase() ?: ""

        // Preliminary memory-only gate:
        // Only forward candidates matching Ethiopian bank packages, SMS apps, or banking keywords
        val isCandidatePackage = pkg.contains("tydic.ethiopay") ||
                pkg.contains("telebirr") ||
                pkg.contains("combanketh") ||
                pkg.contains("cbebirr") ||
                pkg.contains("awash") ||
                pkg.contains("messaging") ||
                pkg.contains("mms") ||
                pkg.contains("sms")

        if (isCandidatePackage) {
            onNotificationCallback?.invoke(sbn)
        }
    }
}
