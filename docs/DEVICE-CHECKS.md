# Device checks — sleep reminders on a physical phone

Everything in Phase 4B was verified in a browser and in Jest. Local notifications cannot be: `expo-notifications`
has no web implementation, and a simulator does not reproduce Doze, Low Power Mode or a locked screen. This
document is the part a person has to run, plus what the platforms do and do not guarantee.

References used: the installed `expo-notifications@57.0.17` package and
<https://docs.expo.dev/versions/v57.0.0/sdk/notifications/>. Quotations below are from that page.

---

## Before you start

1. Start the API so the phone can reach it, and note the address it prints:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start-api-lan.ps1
   ```

2. Start the bundler with a cleared cache, so the new `EXPO_PUBLIC_API_URL` is inlined:

   ```powershell
   cd src\mobile; npx expo start -c
   ```

3. Scan the QR code with the iPhone camera and open the project in Expo Go. Phone and computer must be on the
   same Wi-Fi.

If the phone cannot load the health URL, work through **Phone troubleshooting** in the README before going
further — none of the checks below mean anything while the app cannot reach the API.

---

## What Expo Go can and cannot prove

| Layer | Where it comes from | Does Expo Go prove it for our build? |
|---|---|---|
| Scheduling, cancelling and reconciling a local notification | `expo-notifications` JavaScript API | **Yes** — the same code runs in Expo Go and in our build. |
| iOS permission prompt, banner, lock-screen delivery | Expo Go's own bundle id, entitlements and Info.plist | **No.** The permission belongs to *Expo Go*; iOS Settings will list the alert under "Expo Go", not "Libra". |
| Android channel, `POST_NOTIFICATIONS` prompt, boot re-scheduling | Expo Go's manifest | **No** — see autolinking below for what our own build gets. |
| Notification icon and colour | Expo Go's icon | **No.** Ours would come from a config plugin we have not added. |

The docs put the Expo Go boundary this way:

> "Push notifications (remote notifications) functionality provided by `expo-notifications` is unavailable in
> Expo Go on Android from SDK 53. A development build is required to use push notifications. Local
> notifications (in-app notifications) remain available in Expo Go."

We use local notifications only, so Expo Go is enough to exercise the behaviour — but a green run in Expo Go is
**not** evidence about our own native configuration. Repeat the checks in a development build before treating
notifications as shipped.

---

## Native configuration: what is already there, and what we deliberately did not add

The app is managed (no `ios/` or `android/` directory), so native configuration is produced at prebuild time.
This was inspected with `npx expo config --type introspect`, which runs the config-plugin mods in memory and
writes no native folders.

**From autolinking, without any configuration of ours.** `node_modules/expo-notifications/android/src/main/AndroidManifest.xml`
declares `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`, the `NotificationsService` receiver (which listens
for `BOOT_COMPLETED`, so scheduled notifications survive a restart) and `NotificationForwarderActivity`. These
merge into the app manifest at Gradle build time; they are **not** in the introspected prebuild manifest, which
is how you can tell they come from the library rather than from a plugin. The docs agree for the boot
permission: *"The `RECEIVE_BOOT_COMPLETED` permission is added automatically through the library's
AndroidManifest.xml."* On Apple, `expo-module.config.json` registers the modules and the
`NotificationsAppDelegateSubscriber`.

**From the config plugin, applied automatically.** `@expo/prebuild-config` applies the `expo-notifications`
plugin for any autolinked package in its versioned list, so it runs even though our `app.json` does not mention
it. Introspection confirms the effect: `ios.entitlements` already contains `aps-environment: development`
although `plugins` contains no notifications entry. That entitlement is a push concern — a local notification
needs none — but it means a development or production build of *our* app will carry the Push Notifications
capability in its provisioning profile. We add no push credentials and call no push APIs.

**What we did not add, and why.** The documented plugin properties are `icon`, `color`, `defaultChannel`,
`sounds` and `enableBackgroundRemoteNotifications`.

| Property | Decision |
|---|---|
| `icon`, `color` | Android small-icon appearance only. Needs a "96x96 all-white png with transparency". Cosmetic; deferred until there is a real Android build to look at. |
| `defaultChannel` | Documented as "Default channel for FCMv1 notifications" — remote only. Not applicable. |
| `sounds` | We use the system default sound. |
| `enableBackgroundRemoteNotifications` | Remote and background notifications, explicitly out of scope. |

`SCHEDULE_EXACT_ALARM` deserves its own note. The docs say: *"Starting from Android 12 (API level 31), to
schedule a notification that triggers at an exact time, you need to add `<uses-permission
android:name="android.permission.SCHEDULE_EXACT_ALARM"/>` to AndroidManifest.xml."* We do **not** add it. The
reminder never promises an exact minute — the UI says the system decides — and the library degrades cleanly:
`ExpoSchedulingDelegate.kt` calls `setExactAndAllowWhileIdle` when `alarmManager.canScheduleExactAlarms()` is
true and `setAndAllowWhileIdle` otherwise, so the reminder still fires, just not to the minute. The permission
is also restricted on Google Play and would need a justification we do not have.

---

## iPhone walkthrough

Roughly ten minutes. Steps 3 to 6 must be done in order on one sleep session.

### 1. The API is reachable, then sign in

1. On the iPhone, open **Safari** and go to `http://<the address the script printed>:5134/health/ready`.
   **Expected:** JSON beginning `{"status":"Healthy"`. If it times out, stop and fix connectivity first.
2. Open the project in **Expo Go** and sign in (or register).
   **Expected:** the five-tab shell. **Profil → API ünvanı** shows the same LAN address, and **API vəziyyəti**
   reads `Hazırdır (Healthy)`.

> If the app was signed in before the API restarted, you may be signed out once: the API previously used a
> throw-away signing key. The startup script stores a stable key, so this should not repeat.

### 2. Denying permission leaves sleep tracking usable

1. Go to **Plan → 🌙 (Yuxu)**.
2. Turn **Xatırlatma** on. iOS asks for notification permission — tap **Don't Allow**.
   **Expected:** the switch returns to off, and the caption reads `Bildiriş icazəsi verilmədi.` Nothing else
   changes.
3. Press **Yatmağa başla**, wait a few seconds, press **Oyandım**.
   **Expected:** the night is recorded and appears in the history and in **Son 7 gün**. Tracking is fully usable
   with notifications denied.

### 3. Granting permission and receiving one reminder

1. iOS asks only once. Re-enable it in **Settings → Expo Go → Notifications → Allow Notifications** (this is
   Expo Go's permission, not Libra's — see the table above).
2. Back in the app, turn **Xatırlatma** on.
   **Expected:** the switch stays on; the caption explains that the reminder is local to this device.
3. Press **Yatmağa başla**.
4. Press **Sınaq: 90 saniyəyə bildiriş** (development builds only; it uses the same scheduler as the real
   setting, attached to the running session).
   **Expected:** `Sınaq xatırlatması 90 saniyəyə quruldu. Tətbiqi arxa plana salın.`
5. Press the home gesture to background the app, then **lock the screen**. Wait.
   **Expected:** within roughly 90 seconds a notification titled **Oyanma vaxtıdır** appears on the lock screen.
   The exact second is the operating system's decision.

### 4. "Oyandım" before the reminder cancels it

1. Press **Yatmağa başla**, then **Sınaq: 90 saniyəyə bildiriş**.
2. Within about 20 seconds press **Oyandım**.
3. Lock the screen and wait three minutes.
   **Expected:** **no** notification arrives. The night is recorded with the moment you pressed.

### 5. Reopening does not create a second reminder

1. Press **Yatmağa başla**, then **Sınaq: 90 saniyəyə bildiriş**.
2. Immediately background the app and reopen it. Do this twice.
3. Lock the screen and wait.
   **Expected:** exactly **one** notification. Reopening reconciles the stored alarm with the system instead of
   scheduling another.
4. Wait until after it has fired, then reopen the app again and lock the screen.
   **Expected:** nothing fires a second time — an alarm whose moment has passed is dropped, not replayed.

### 6. Tapping a notification reaches the right place

1. Press **Yatmağa başla**, then **Sınaq: 90 saniyəyə bildiriş**, and background the app.
2. When the notification arrives, **tap it**.
   **Expected:** the app opens on the **Yuxu** screen with the session still running and its elapsed time still
   counting. The tap must **not** record a wake-up; "Oyandım" is still there to press.
3. Repeat with the app fully closed (swipe it away from the app switcher first). Tap the notification.
   **Expected:** the app launches, shows the brand splash while the stored session is restored, and *then*
   opens **Yuxu** with the running session. The tap is acted on after authentication, never before.

### 7. Changing accounts

1. With a reminder scheduled and a session running, go to **Profil → Çıxış**.
   **Expected:** you land on the login screen. The running session is **not** ended on the server — signing out
   is not waking up.
2. Register or sign in as a **second** account.
   **Expected:** the Yuxu screen shows *that* account's state (no running session for a new account), the
   history is empty, and Home shows `Hələ qeyd yoxdur`.
3. Lock the screen and wait three minutes.
   **Expected:** the first account's reminder does **not** arrive — logging out cancels this user's own alarm.
4. Sign back in as the first account.
   **Expected:** the running session is still there, restored from the server with its original start time.

---

## iPhone: appearance (Görünüş)

Two minutes. Set the phone to **dark** mode first (Settings → Display & Brightness).

1. Open Libra fresh (delete and reinstall Expo Go's copy, or clear its data) and sign in.
   **Expected:** the app is **light** even though the phone is dark — a fresh install defaults to light.
2. **Profil → Görünüş**. Three choices: Açıq, Tünd, Sistem, with Açıq selected.
3. Tap **Tünd**.
   **Expected:** the whole screen, the status bar text and the tab bar switch at once; no "Yadda saxla" is
   needed and the Save button does not light up. Tap into **Ad**: the keyboard should be dark too — that is the
   native override, which only a device can show.
4. Type a few characters into **Ad** without saving, then tap **Açıq**.
   **Expected:** the app turns light; the text you typed is still there and Save is still available.
5. Kill the app (swipe away) and reopen.
   **Expected:** it comes back **light** with no dark flash first, on a phone that is still dark.
6. Tap **Sistem**.
   **Expected:** the app turns dark (the caption reads "Hazırda: tünd"). Background the app, switch the phone to
   light mode, return.
   **Expected:** the app is now light without any tap, and the caption reads "Hazırda: açıq".
7. Tap **Tünd**, then **Sistem** again while the phone is light.
   **Expected:** the app goes light — returning to Sistem must read the *phone*, not the theme the app was
   forcing a moment ago. If it stays dark here, the override was not cleared.

Not verifiable in Expo Go: what `Info.plist` and the Android manifest of *our own* build declare. Both were
inspected with `npx expo config --type introspect` and already allow both appearances; a development build is
still the only proof.

## iPhone: recurring plans and debts (Təkrarlananlar / Borclar)

Five minutes, with the API on the LAN address (`scripts/start-api-lan.ps1`) and a fresh user with one AZN cash
account of 1 000. Everything here is also covered by the browser evidence in `docs/screenshots-recurring-debts/`;
the device adds native pickers, the keyboard and haptics.

1. **Maliyyə → Borclar → +**. Enter *Əli*, 300, leave **Artıq mövcuddur**, save.
   **Expected:** the Finance balance is still **1 000**; the receivable strip reads 300,00 AZN; the summary card
   shows "Alacaq 300,00 · Borc 0,00" and "Xalis mövqe … 1.300,00". No income or expense changed.
2. Open *Əli* → **Ödəniş alındı**. Set 100, choose Nağd, keep today.
   **Expected before confirming:** "Hesaba təsiri · Nağd 1.000,00 → 1.100,00 AZN" and "Qalıq: 300,00 → 200,00".
   The date opens the **native** picker. After confirming: one success haptic, remaining 200,00, status "Qismən
   ödənilib", one history row; Finance balance 1 100, Gəlir still 0,00.
3. Turn on Airplane Mode, tap **Ödəniş alındı** again with 50, confirm.
   **Expected:** "Serverə qoşulmaq mümkün olmadı…" inside the sheet; the amount 50 is still typed. Turn the
   network back on and confirm again.
   **Expected:** exactly one 50 payment (remaining 150) — the retry reused the same key.
4. In the history, tap **↶** on the 100 payment and confirm.
   **Expected:** remaining 250 and Finance balance 1 050 change together; the row stays, struck through, "geri
   alınıb". Tapping undo on it again is not offered.
5. **Borclar → +**, *Leyla*, 150, **İndi verirəm**, account Nağd.
   **Expected:** "Hesaba təsiri · Nağd 1.050,00 → 900,00" before saving; after saving the balance is 900 and the
   receivable strip lists 400,00 (250 + 150).
6. **Maliyyə → Təkrarlananlar → +**: *Kirayə*, Xərc, 450, Nağd, any expense category, day **31**, start last
   month. Save.
   **Expected:** the current month lists Kirayə as **Gözləyir** with the month's last day; the totals card shows
   −450,00 under Gözləyir; Finance **Xərc is still 0,00** and the balance 900. Pull to refresh, move a month
   back and forward, kill and reopen the app: still nothing recorded.
7. Tap **Ödənişi qeyd et**.
   **Expected:** the sheet pre-fills 450, Nağd and **today** as the actual date (the due date is still ahead),
   with "900,00 → 450,00 AZN". Confirm.
   **Expected:** one haptic, the row becomes **Qeyd olunub** with "Əməliyyata bax"; Finance shows Xərc 450,00
   and balance 450; the budget (if any) counts 450 once.
8. Tap **Ödənişi qeyd et** on the *same* month from a second device or after a reload before the list refreshed.
   **Expected:** "Bu ay artıq qeyd olunub" (409) and no second transaction — the month, not the key, is unique.
9. **Əməliyyata bax → Əməliyyatı sil**.
   **Expected:** refused with a message pointing to Təkrarlananlar. Go back and tap **Geri al** on the row.
   **Expected:** the transaction is gone, the row reads **Buraxılıb**, Finance Xərc is back to 0,00 and the
   balance to 900; the month is not offered again as pending, but "Ödənişi qeyd et" can record it once more.
10. Open the plan (**Şablona düzəliş**), change the amount to 475 and save; then open it again and tap
    **Şablonu dayandır**.
    **Expected:** unrecorded months show 475; the recorded/skipped history is unchanged; after stopping, the
    plan's future months disappear from the list while its history rows stay. **Şablonu sil** on a plan with
    history is refused with an explanation.
11. Dark mode: **Profil → Görünüş → Tünd**, then reopen the record sheet and the payment sheet.
    **Expected:** white text on the primary buttons, readable chips, the same controls.

## Android checklist

Same flow, with these differences to watch for.

1. **Permission prompt (Android 13+).** Turning **Xatırlatma** on should show the system notification prompt.
   The prompt appears only once the app has created a channel — the app creates the `sleep-reminders` channel
   before asking, so the dialog should appear on the first attempt. If no dialog appears at all, that ordering
   has regressed.
2. **Channel settings.** After granting, **Settings → Apps → Expo Go → Notifications** should list a
   **Yuxu xatırlatmaları** channel. Muting the channel suppresses the reminder; the app cannot override that,
   and the switch will still read as on.
3. **Delivery timing.** Because we do not request `SCHEDULE_EXACT_ALARM`, the reminder is scheduled inexactly.
   Expect it around the 90-second mark, not exactly on it — and later still if the device is in Doze.
4. **Battery optimisation.** Aggressive vendor power management (Xiaomi, Huawei, Samsung, OnePlus) can delay or
   drop scheduled notifications entirely. If nothing arrives, check the per-app battery setting before
   suspecting the app.
5. **Reboot.** The library registers a `BOOT_COMPLETED` receiver, so a scheduled reminder should survive a
   restart. Worth one check: schedule the 90-second test, reboot immediately, and see whether it still fires.
6. **Recurring and debts.** Repeat steps 2, 3 and 7 of the iPhone section. Watch the date control: the
   Android picker must return the calendar date the user chose (no shift across midnight in Asia/Baku), and the
   decimal keyboard must accept both `,` and `.`. Back-gesture out of an open sheet must not confirm anything.
7. **Icon.** In Expo Go the icon is Expo Go's. In our own build, without the `icon` plugin property, Android
   falls back to the app icon, which usually renders as a white square. Cosmetic, and the reason `icon` is on
   the deferred list above.

---

## Limitations we do not paper over

- **No guaranteed delivery time.** Both platforms may deliver late — Doze and inexact alarms on Android, the
  system scheduler and Low Power Mode on iOS. The reminder is a convenience, not an alarm clock, and the UI says
  so. Do not build anything on it firing punctually.
- **A notification never ends a sleep session.** Firing it changes no data, and tapping it only opens the
  screen. The recorded wake-up is always the moment the user pressed "Oyandım".
- **One device only.** A scheduled notification lives on the device that scheduled it. Another device cannot
  cancel it; if you sign in on a second phone and end the night there, the first phone's reminder still fires.
- **A device that is off** delivers on next boot (Android, via the boot receiver) or not at all.
- **Expo Go borrows its own identity.** Permissions, channel and icon belong to Expo Go. Only a development
  build exercises ours.
- **Not verified anywhere yet:** actual delivery on iOS or Android hardware, the permission dialogs, lock-screen
  presentation, tap-to-open from a cold start, and reboot survival. Those are exactly what this document is for.
