package com.moneytracker.notification

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Collections
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class NotificationPayload(
    val rawText: String,
    val packageName: String,
    val title: String,
    val timestamp: String
)

class BankingNotificationListenerService : NotificationListenerService() {
    companion object {
        var onNotificationCallback: ((payload: NotificationPayload) -> Unit)? = null
        var isServiceConnected: Boolean = false
        val pendingNotifications: MutableList<NotificationPayload> = Collections.synchronizedList(mutableListOf())
        private const val MAX_PENDING_QUEUE = 25
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isServiceConnected = true
        Log.d("BankingNotification", "BankingNotificationListenerService connected to Android OS.")
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
        val notification = sbn.notification ?: return
        val extras = notification.extras

        val titleCharSequence = extras?.getCharSequence(Notification.EXTRA_TITLE)
            ?: extras?.getCharSequence(Notification.EXTRA_TITLE_BIG)
        val title = titleCharSequence?.toString() ?: ""

        val bigText = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val normalText = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val summaryText = extras?.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString() ?: ""
        val subText = extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val tickerText = notification.tickerText?.toString() ?: ""

        // Extract from Notification.MessagingStyle (Google Messages, Samsung Messages, Android 10+ SMS)
        val messagingTexts = mutableListOf<String>()
        try {
            val messages = extras?.getParcelableArray(Notification.EXTRA_MESSAGES)
            if (messages != null && messages.isNotEmpty()) {
                for (item in messages) {
                    if (item is android.os.Bundle) {
                        // Standard Android Notification.MessagingStyle bundle key is "text"; also check "android.text"
                        val t = item.getCharSequence("text")?.toString()
                            ?: item.getCharSequence("android.text")?.toString()
                        if (!t.isNullOrBlank()) {
                            messagingTexts.add(t)
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // Extract from Notification.InboxStyle
        val linesTexts = mutableListOf<String>()
        try {
            val lines = extras?.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            if (lines != null && lines.isNotEmpty()) {
                for (l in lines) {
                    val lineStr = l?.toString()
                    if (!lineStr.isNullOrBlank()) {
                        linesTexts.add(lineStr)
                    }
                }
            }
        } catch (_: Exception) {}

        // Pick the richest text representation
        val candidates = mutableListOf<String>()
        if (bigText.isNotBlank()) candidates.add(bigText)
        if (normalText.isNotBlank()) candidates.add(normalText)
        if (summaryText.isNotBlank()) candidates.add(summaryText)
        if (subText.isNotBlank()) candidates.add(subText)
        if (tickerText.isNotBlank()) candidates.add(tickerText)
        messagingTexts.forEach { if (it.isNotBlank()) candidates.add(it) }
        linesTexts.forEach { if (it.isNotBlank()) candidates.add(it) }

        val rawText = candidates.maxByOrNull { it.length } ?: ""

        val textLower = rawText.lowercase()
        val titleLower = title.lowercase()

        // 1. Known Ethiopian Banking, Wallet & Messaging packages
        val isCandidatePackage = pkg.contains("tydic.ethiopay") ||
                pkg.contains("telebirr") ||
                pkg.contains("combanketh") ||
                pkg.contains("cbebirr") ||
                pkg.contains("cbe") ||
                pkg.contains("awash") ||
                pkg.contains("boa") ||
                pkg.contains("abyssinia") ||
                pkg.contains("dashen") ||
                pkg.contains("wegagen") ||
                pkg.contains("hibret") ||
                pkg.contains("coop") ||
                pkg.contains("zemen") ||
                pkg.contains("nib") ||
                pkg.contains("oromia") ||
                pkg.contains("bank") ||
                pkg.contains("wallet") ||
                pkg.contains("pay") ||
                pkg.contains("messaging") ||
                pkg.contains("message") ||
                pkg.contains("mms") ||
                pkg.contains("sms") ||
                pkg.contains("truecaller") ||
                pkg.contains("inbox") ||
                pkg.contains("telecom")

        // 2. Comprehensive Financial Keywords Gate (English & Amharic)
        val containsBankingKeywords = textLower.contains("cbe") ||
                textLower.contains("telebirr") ||
                textLower.contains("awash") ||
                textLower.contains("awashbirr") ||
                textLower.contains("birr") ||
                textLower.contains("etb") ||
                textLower.contains("debited") ||
                textLower.contains("credited") ||
                textLower.contains("transferred") ||
                textLower.contains("transfer") ||
                textLower.contains("sent") ||
                textLower.contains("paid") ||
                textLower.contains("received") ||
                textLower.contains("deposit") ||
                textLower.contains("withdrawn") ||
                textLower.contains("balance") ||
                textLower.contains("account") ||
                textLower.contains("txn") ||
                textLower.contains("ref") ||
                textLower.contains("reference") ||
                textLower.contains("127") ||
                textLower.contains("8900") ||
                textLower.contains("951") ||
                textLower.contains("ወጪ") ||
                textLower.contains("ገቢ") ||
                textLower.contains("ብር") ||
                textLower.contains("ክፍያ") ||
                textLower.contains("አስተላልፈዋል") ||
                textLower.contains("ተቀብለዋል") ||
                textLower.contains("ቀሪ") ||
                textLower.contains("ቴሌብር") ||
                textLower.contains("አዋሽ") ||
                textLower.contains("የሂሳብ") ||
                textLower.contains("ሒሳብ") ||
                titleLower.contains("cbe") ||
                titleLower.contains("telebirr") ||
                titleLower.contains("awash") ||
                titleLower.contains("awashbirr") ||
                titleLower.contains("127") ||
                titleLower.contains("8900") ||
                titleLower.contains("951") ||
                titleLower.contains("bank") ||
                titleLower.contains("ቴሌብር") ||
                titleLower.contains("አዋሽ")

        val isCandidate = (isCandidatePackage || containsBankingKeywords) && rawText.isNotBlank()

        // Development diagnostic log per user requirement
        val preview = if (rawText.length > 50) rawText.take(50) + "..." else rawText
        Log.i("BankingNotification", "[NOTIF:NATIVE] posted: pkg=$pkg, title=$title, rawTextLen=${rawText.length}, isCandidate=$isCandidate")

        if (!isCandidate) {
            return
        }

        Log.i("BankingNotification", "[NOTIF:NATIVE] candidate accepted -> enqueued: pkg=$pkg, title=$title, preview=$preview")

        val timestamp = sbn.postTime
        val isoTimestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(timestamp))

        val payload = NotificationPayload(
            rawText = rawText,
            packageName = pkg,
            title = title,
            timestamp = isoTimestamp
        )

        // 1. Persist to Durable Storage (survives app backgrounding and process death)
        try {
            DurableNotificationStore.save(applicationContext, payload)
        } catch (e: Exception) {
            Log.e("BankingNotification", "Failed to save to DurableNotificationStore: ${e.message}", e)
        }

        // 2. Also keep in in-memory pending buffer
        synchronized(pendingNotifications) {
            if (pendingNotifications.size >= MAX_PENDING_QUEUE) {
                pendingNotifications.removeAt(0)
            }
            pendingNotifications.add(payload)
        }

        // 3. Dispatch directly if JS callback is attached (when app is in foreground)
        try {
            onNotificationCallback?.invoke(payload)
        } catch (e: Exception) {
            Log.e("BankingNotification", "Error invoking notification callback: ${e.message}", e)
        }
    }
}
