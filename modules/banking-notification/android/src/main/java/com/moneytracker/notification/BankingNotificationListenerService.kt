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
        if (rawText.isBlank()) return

        val textLower = rawText.lowercase()
        val titleLower = title.lowercase()

        // 1. Immediately drop non-financial apps (Telegram, WhatsApp, social apps)
        val isNonFinancialApp = pkg.contains("telegram") ||
                pkg.contains("challegram") ||
                pkg.contains("whatsapp") ||
                pkg.contains("facebook") ||
                pkg.contains("instagram") ||
                pkg.contains("twitter") ||
                pkg.contains("viber") ||
                pkg.contains("discord") ||
                pkg.contains("tiktok")
        if (isNonFinancialApp) {
            return
        }

        // 2. Strict Trusted Financial Source Identification
        // Official Android apps: Telebirr, CBE, Awash
        val isOfficialBankingApp = pkg.contains("tydic.ethiopay") ||
                pkg.contains("telebirr") ||
                pkg.contains("ethiomobilemoney") ||
                pkg.contains("combanketh") ||
                pkg.contains("cbebirr") ||
                pkg.contains("awashpay") ||
                pkg.contains("awash")

        // Trusted SMS senders for banking notifications (Telebirr 127, Awash 8900, CBE 951)
        val isTrustedSmsSender = titleLower == "127" ||
                titleLower == "8900" ||
                titleLower == "951" ||
                titleLower.contains("telebirr") ||
                titleLower.contains("ቴሌብር") ||
                titleLower.contains("awash") ||
                titleLower.contains("አዋሽ") ||
                titleLower.contains("cbe") ||
                titleLower.contains("commercial bank")

        // Reject notifications from untrusted sources (131, friends' SMS, random apps)
        if (!isOfficialBankingApp && !isTrustedSmsSender) {
            Log.d("BankingNotification", "[NOTIF:NATIVE] Ignored non-trusted source: pkg=$pkg, title=$title")
            return
        }

        // 3. Security, OTP, and PIN Error Guard (even from trusted senders)
        val isSecurityOrPinError = textLower.contains("incorrect") ||
                textLower.contains("wrong") ||
                textLower.contains("sorry") ||
                textLower.contains("ተሳስቷል") ||
                textLower.contains("verification code") ||
                textLower.contains("your otp") ||
                textLower.contains("is your otp") ||
                textLower.contains("security code") ||
                textLower.contains("reset your password") ||
                textLower.contains("የማረጋገጫ ኮድ") ||
                textLower.contains("package has been activated") ||
                textLower.contains("internet package") ||
                textLower.contains("service notification")

        // 4. Financial Movement Verification
        val hasMovementKeywords = textLower.contains("debited") ||
                textLower.contains("credited") ||
                textLower.contains("transferred") ||
                textLower.contains("transfer") ||
                textLower.contains("paid") ||
                textLower.contains("received") ||
                textLower.contains("bought") ||
                textLower.contains("payment of") ||
                textLower.contains("ወጪ") ||
                textLower.contains("ገቢ") ||
                textLower.contains("ክፍያ") ||
                textLower.contains("አስተላልፈዋል") ||
                textLower.contains("ተቀብለዋል")

        if (isSecurityOrPinError && !hasMovementKeywords) {
            Log.i("BankingNotification", "[NOTIF:NATIVE] Discarded security/auth/service alert from trusted sender: pkg=$pkg, title=$title")
            return
        }

        if (!hasMovementKeywords) {
            Log.d("BankingNotification", "[NOTIF:NATIVE] Ignored message without financial movement: pkg=$pkg, title=$title")
            return
        }

        val isCandidate = true

        // Development diagnostic log per user requirement
        val preview = if (rawText.length > 50) rawText.take(50) + "..." else rawText
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
