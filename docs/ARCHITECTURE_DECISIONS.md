# Architectural Decision Records (ADRs) & Unresolved Decisions

> **Project:** Ethiopian Personal Finance & AI Expense Tracker (Money Tracker)  
> **Status:** Architecture Approved / Pre-Implementation Alignment  
> **Date:** October 2026  

---

## Part 1: Final Architectural Decisions

### ADR 01: Elimination of In-App Conversational Chatbot in Favor of Purpose-Specific Local-Data-Grounded AI Operations

- **Context:** An open-ended conversational assistant ("Ask Your Money") was initially proposed to answer questions like *"How much did I spend on food yesterday?"*.
- **Decision:** **Completely remove the conversational chatbot from V1.** AI will be utilized exclusively for purpose-specific, high-value operations:
  1. Multimodal receipt line-item extraction.
  2. Unknown SMS fallback parsing.
  3. Cryptic merchant name normalization.
  4. Category classification fallback.
  5. Spending anomaly detection.
  6. End-of-month structured financial analysis report.
- **Why We Chose It:**
  - Preserves user Gemini API quotas (especially on free tiers with strict 15 RPM limits).
  - Eliminates conversational token wastage and ungrounded hallucinations.
  - Local database aggregation queries answer simple questions (totals, averages, breakdowns) faster, offline, and with 100% mathematical precision.
- **Alternatives Considered:**
  - *Full conversational assistant*: Rejected due to high quota consumption and latency.
  - *On-device local LLM*: Rejected due to massive RAM/battery demands on typical Android devices in Ethiopia.
- **Tradeoffs:** Users cannot have freeform open chats with the app, but they gain a reliable, predictable, cost-controlled experience.
- **Future Expansion:** A lightweight query widget can be revisited in V2 if users explicitly request it and quota controls are proven.

---

### ADR 02: Transaction Ingestion Abstraction (`TransactionSource`) vs. Google Play SMS Restrictions

- **Context:** Background SMS interception (`READ_SMS`, `RECEIVE_SMS`) provides effortless capture of CBE and Telebirr debit alerts. However, Google Play Developer Policy strictly bans `READ_SMS` / `RECEIVE_SMS` for non-default SMS apps.
- **Decision:** Implement a modular **`TransactionSource` abstraction** supporting multiple decoupled ingestion channels:
  1. `NotificationListenerSource`: Listens for incoming bank notifications (CBE, Telebirr, Awash, SMS app alerts) using Android's policy-compliant `NotificationListenerService`.
  2. `SmsReceiverSource`: Direct SMS broadcast receiver (activated only for private APK / sideloaded builds).
  3. `ClipboardSource`: Automatically detects copied banking texts when the app is opened and offers 1-tap import.
  4. `ReceiptSource`: Camera / gallery scanning with multimodal extraction.
  5. `ManualEntrySource`: Fast direct entry.
- **Why We Chose It:**
  - Prevents the entire application from being held hostage by Google Play store permission policies.
  - Ensures the app runs reliably on any device, whether distributed via Google Play, direct APK download, or Telegram.
- **Alternatives Considered:**
  - *Solely relying on READ_SMS*: Rejected as a critical Google Play policy compliance risk.
  - *Solely manual entry*: Defeats the primary core value of automated expense tracking.
- **Tradeoffs:** `NotificationListenerService` requires the user to grant notification access in Android settings during onboarding.
- **Future Expansion:** Seamlessly add CSV/Excel bank statement parsers as new `TransactionSource` implementations without touching the ledger.

---

### ADR 03: Local-First Private Vault & Zero-Cloud Account Model

- **Context:** Standard fintech apps require cloud accounts (Google sign-in, Firebase Auth, cloud databases).
- **Decision:** **The application is 100% local-first.** User account data (Name, Email, Master Password) forms a device-local Private Vault.
  - Passwords are never stored in plaintext; they are hashed using **PBKDF2 (SHA-256)** with a 128-bit unique salt and 100,000 iterations.
  - The database is local embedded SQLite.
  - Secrets (Gemini API Key, vault keys) reside in hardware-backed storage (Android Keystore / iOS Keychain).
  - No company servers, telemetry relays, or third-party tracking libraries exist.
- **Why We Chose It:**
  - Complete user data sovereignty and privacy for sensitive Ethiopian banking transactions.
  - Zero server maintenance bills or cloud hosting liabilities for the product creator.
  - Full offline ledger availability.
- **Alternatives Considered:**
  - *Firebase Authentication + Firestore*: Rejected because storing financial transactions on a cloud server creates regulatory, privacy, and ongoing hosting cost burdens.
- **Tradeoffs:** If the user loses their phone without an encrypted local backup, data cannot be recovered via a remote "forgot password" email.
- **Mitigation:** Built-in 1-click encrypted local backup (JSON) exported to the user's Downloads or external storage.

---

### ADR 04: Explicit Ledger Modeling of Opening Balances and Internal Transfers

- **Context:** When users enter initial account balances during onboarding (e.g. CBE: 7,250 ETB, Telebirr: 3,100 ETB), naive apps store this as a mutable property on the Account record.
- **Decision:**
  - Opening balances are modeled as **immutable starting ledger transactions** (`type = OPENING_BALANCE`) with explicit start timestamps.
  - Internal transfers between user accounts (e.g., withdrawing cash from CBE or loading Telebirr from CBE) are modeled as `type = TRANSFER` with source and destination accounts.
- **Why We Chose It:**
  - Distinguishes initial capital from subsequent earned income.
  - Prevents internal transfers between personal accounts from being falsely recorded as monthly expenses or spending.
  - Enables audit trails and clean balance reconciliation when reviewing historical months.
- **Alternatives Considered:**
  - *Mutable column `Account.balance`*: Rejected because it prevents reconstructing historical balances and corrupts cash-flow analytics.
- **Tradeoffs:** Requires double-entry ledger handling in the local repository layer.

---

### ADR 05: Provider-Agnostic AI Architecture & Dynamic Gemini Model Configuration

- **Context:** Older Gemini models (such as early 2.0 Flash or 1.5 Flash iterations) are phased out or superseded by modern model series (e.g., Gemini 3.8 Flash, Gemini 3.5 Flash-Lite). Hardcoding model names creates brittle apps.
- **Decision:** Implement a clean abstraction:
  ```text
  AiProvider (Interface)
      └── GeminiProvider (Implementation)
             └── Dynamic Model Discovery & User Configuration
  ```
  - The model ID is a configurable setting stored in preferences, defaulting to a verified GA model.
  - The app includes a dynamic model discovery endpoint (`GET /v1beta/models`) to let the user select among active models supported by their API key.
- **Why We Chose It:**
  - Decouples business logic from external API shifts.
  - Allows seamless switching between speed-optimized and quality-optimized models without app code updates.
- **Alternatives Considered:**
  - *Hardcoding model strings*: Rejected due to inevitable breaking changes upon Google model deprecations.
- **Tradeoffs:** Requires maintaining a fallback model list in case the dynamic model query fails offline.

---

### ADR 06: Deterministic-First Parsing & Merchant Normalization

- **Context:** Incoming debit notifications arrive multiple times a day.
- **Decision:** Employ a **two-tier parsing pipeline**:
  - **Tier 1 (Deterministic Local Regex & Rule Lookup)**: Matches known templates for CBE, Telebirr, and Awash Bank, and checks local merchant aliases in SQLite. Executes in ~2ms with zero internet and zero token usage.
  - **Tier 2 (Gemini Fallback)**: Invoked *only* if the regex fails to extract essential fields (amount, merchant, date) AND the user has enabled "Unknown SMS Fallback".
- **Why We Chose It:**
  - Avoids exhausting user API rate limits (15 RPM free tier).
  - Maximizes battery efficiency and provides instant offline capture.
- **Alternatives Considered:**
  - *Calling Gemini for every notification*: Rejected as wasteful, slow, and dependent on constant internet.
- **Tradeoffs:** Edge-case SMS formats may require an initial Gemini parse before a local rule is stored.

---

### ADR 07: Client-Side Image Preprocessing & Multi-Modal Receipt Extraction Pipeline

- **Context:** Modern smartphone cameras generate 10MB–20MB photos. Uploading raw images over Ethiopian mobile data (3G/4G) causes significant latency and frequent timeout failures.
- **Decision:**
  - On-device downsampling: images are scaled to a maximum dimension of 1024px and compressed to JPEG at 80% quality (~180KB–250KB) before transmission.
  - Structured output enforced via Gemini response schema (`items`, `tax`, `total`, `date`, `merchant`).
  - **Mandatory User Review Screen**: Extracted data is presented for user verification and editing before any transaction is committed.
  - **Duplicate/Match Detection**: Scanned receipts are checked against recent transactions ($\pm 2$ hours, matching amount) to prompt the user to merge rather than duplicate.
- **Why We Chose It:**
  - Reduces upload latency from 20+ seconds to ~1.5 seconds.
  - Prevents inaccurate OCR from polluting financial records without human sign-off.
  - Eliminates duplicate entries caused by paying via Telebirr/CBE and subsequently scanning the paper receipt.
- **Alternatives Considered:**
  - *Direct automatic ledger insertion*: Rejected because receipt OCR is probabilistic and requires user validation.
- **Tradeoffs:** User must tap "Confirm" on the review screen, but accuracy and financial integrity are guaranteed.

---

### ADR 08: Inactivity & Background Auto-Lock with App-Switcher Obfuscation

- **Context:** Financial information is private and sensitive to shoulder-surfing or unauthorized device access.
- **Decision:**
  - **Default 5-minute auto-lock** triggered by background transitions or session inactivity.
  - App-switcher preview masking (`FLAG_SECURE` on Android) so that Android's recent-apps screen cannot take a screenshot of account balances.
  - Optional 4-digit PIN and Biometric unlock with a prominent warning if skipped.
- **Why We Chose It:**
  - Industry-standard fintech security baseline.
  - Protects users without being overly annoying (5-minute threshold allows multi-tasking between banking apps and Money Tracker).
- **Alternatives Considered:**
  - *Immediate lock on every background event*: Too disruptive when copying an SMS or switching to verify a receipt.
  - *No auto-lock*: Unacceptable security risk for a financial application.

---

## Part 2: Open & Unresolved Decisions for Partner Discussion

### 1. Technology Stack: Flutter vs. React Native (Expo)
- **Option A: React Native with Expo**
  - *Pros:* Node.js (v24.19) and npm (v11.17) are already installed and functional on your machine. You can immediately preview and test the app on your physical Android phone using Expo Go (by scanning a QR code) without installing gigabytes of Android Studio tools locally. Clean TypeScript, high ecosystem compatibility, and first-class SQLite/SecureStore support.
  - *Cons:* Background `NotificationListenerService` requires custom native configuration or an Expo development build (`prebuild`).
- **Option B: Flutter (Dart)**
  - *Pros:* Native background service control, pixel-perfect 120fps widget rendering, and strong offline SQLite/Drift ecosystem.
  - *Cons:* Neither Flutter SDK nor Android Studio is currently installed on your computer. Setting up Flutter from scratch requires downloading ~3GB of tools and configuring PATH, Java, and Android SDK licenses.
- *Partner Recommendation:* If you want instant rapid iteration and phone testing today, **React Native (Expo)** is the fastest path. If you are prepared to install the Flutter SDK, **Flutter** provides deeper native background receiver control. **Which direction do you prefer to lock in?**

---

### 2. Google Play Store vs. Private Sideloaded APK Distribution
- **Option A: Google Play Store Release**
  - Requires strict adherence to Google Play policies. Ingestion must use `NotificationListenerService` + Clipboard auto-paste; direct `READ_SMS` permission cannot be requested in the manifest.
- **Option B: Sideloaded / Direct APK Distribution (Telegram / GitHub / Website)**
  - Permitted to request `RECEIVE_SMS` directly on Android without Google Play restriction.
- *Partner Recommendation:* Build the **`TransactionSource` abstraction** so the app supports both: `NotificationListenerService` + Clipboard by default, with `SmsReceiverSource` ready if distributed as a direct APK.

---

### 3. Receipt Image Storage Policy
- **Option A: Retain compressed receipt images locally indefinitely**
  - *Pros:* User can always tap a transaction and view the physical receipt photo.
  - *Cons:* Consumes device storage over time (~200KB per receipt; 100 receipts = ~20MB).
- **Option B: Retain image by default, with an optional toggle: "Delete receipt photo after extraction"**
  - *Pros:* Gives user full control over device storage while keeping extracted line items in SQLite.
- *Partner Recommendation:* **Option B**. Store image locally by default, but provide a 1-tap setting to delete images and retain only structured data.

---

### 4. Amharic Script Support in V1 Ingestion
- **Context:** Many CBE and Telebirr debit alerts arrive in English, but some bank notifications and paper receipts include Ge'ez / Amharic text (e.g. *"ብር"*, *"ተከፍሏል"*).
- **Decision Point:** Should V1 Regex patterns support both English and Amharic SMS templates out of the box, with Gemini handling multilingual OCR for receipts?
- *Partner Recommendation:* **Yes**. The regex library should include both English and Amharic notification patterns for CBE and Telebirr. Multimodal Gemini already supports Amharic text extraction natively.
