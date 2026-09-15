# Phase 3 — Recurring plans and debts evidence

Captured with headless Chrome (CDP) against the running Expo web app (Metro on 8081), the live API on
`0.0.0.0:5134` (the LAN-accessible startup from `scripts/start-api-lan.ps1`) and a real PostgreSQL database on
2026-09-15. Every user, account, plan, debt and movement in these captures was created by the walkthrough itself,
through the app or the API. Phone captures are 390 × 844 logical units at 2× density unless the name says
otherwise.

`results.json` holds the automated checks (**41 of 41 true**), the numbers quoted below as read back from the API
after each step, the accessibility roles that were inspected, and the console output of the run (empty).

The API ran in Development with the photo-analysis development fixture **off**. Phase 3B's deferred live-provider
check is untouched and still skips.

This is **browser** evidence. Native date pickers, the decimal keyboard, haptics and gestures were not exercised on
a device — see `docs/DEVICE-CHECKS.md` for the iOS/Android checklist.

## The numbers, as the acceptance examples state them

| Step | Cash | Receivable (Əli) | Payable (Bank) | Income / expense this month |
|---|---|---|---|---|
| Seed: cash 1 000, existing receivable 300, existing payable 500 | 1 000 | 300 | 500 | 0 / 0 |
| Receive 100 from Əli into Nağd | 1 100 | 200 | 500 | 0 / 0 |
| Retry with the same key (200, replayed), same key with a different amount (409), 151 against 150 remaining (400) | — | — | — | — |
| Undo the 100 (and the retry-check 50); a second undo answers 200 and changes nothing | 1 000 | 300 | 500 | 0 / 0 |
| Repay 100 of the payable from Nağd | 900 | 300 | 400 | 0 / 0 |
| Pending rent 450 for this month: listing, refreshing, moving months | 900 | 300 | 400 | 0 / 0 |
| Confirm rent once (actual date = today); retry with a different key → 200, same transaction, still one row | 450 | 300 | 400 | 0 / 450 |

`monthlyNet` stayed income − expense throughout; the dashboard's `monthlyPrincipalNet` went 0 → +100 → 0 → −100 and
`netPosition` (cash + receivables − payables) read 800 at every step until the rent was recorded. Generic
`DELETE /api/finance/transactions/{id}` of the recorded rent answered 409. Another user asking for the same debt
or template ids received 404.

## The flow

| # | File | What it shows |
|---|---|---|
| 01 | `01-finance-entry-points-390x844.png` | Finance with the two new soft buttons ("Təkrarlananlar", "Borclar") in the links row — first fold and five tabs unchanged — and the summary card's debt lines with the labelled net position |
| 02 | `02-debts-receivable-390x844.png` | Borclar, "Mənə borcludurlar": the per-currency remaining strip (300,00 AZN, overdue chip) from the server summary, and Əli's row "Gecikib · 5 gün" |
| 03 | `03-debts-payable-390x844.png` | The other direction: "Mən borcluyam" with the Bank row and its own strip |
| 04 | `04-debt-detail-existing-390x844.png` | The existing receivable: 300 remaining, overdue chip, facts, the sentence that a receivable is not cash, no history because nothing moved |
| 05 | `05-debt-payment-sheet-390x844.png` | The payment sheet before confirming: 100 from Nağd, "1.000,00 → 1.100,00 AZN" and "Qalıq: 300,00 → 200,00", income/expense untouched |
| 06 | `06-debt-after-payment-390x844.png` | After one confirmation: remaining 200, "Qismən ödənilib", one history row with the account effect |
| 07 | `07-debt-after-undo-390x844.png` | After undo: remaining 300 again, both payments struck through and marked "geri alınıb", the toast |
| 08 | `08-debt-payable-partial-390x844.png` | The payable after repaying 100: remaining 400, history shows cash leaving Nağd |
| 09 | `09-debt-form-money-moves-390x844.png` | New debt with "İndi verirəm": account required, currency from the account, "900,00 → 750,00 AZN" before saving; "Artıq mövcuddur" beside it changes no balance |
| 10 | `10-recurring-pending-390x844.png` | Təkrarlananlar for the month: Maaş and Kirayə pending, Gözləyir totals, nothing recorded — the dashboard read 900 / expense 0 at this moment |
| 11 | `11-recurring-record-sheet-390x844.png` | The review before recording rent: amount, account, actual date defaulting to today (the due date is still ahead), "900,00 → 450,00 AZN" |
| 12 | `12-recurring-recorded-390x844.png` | After one confirmation: Kirayə "Qeyd olunub", recorded totals −450,00, "Əməliyyata bax" and "Geri al"; a retried confirmation with a fresh key returned the same transaction |
| 13 | `13-recurring-linked-transaction-390x844.png` | The one ordinary transaction the confirmation created |
| 14 | `14-recurring-template-edit-390x844.png` | The compact template form: type, name, monthly amount, account, category, day 31 with the short-month rule, dates, deactivate and delete |
| 15 | `15-finance-with-debt-position-390x844.png` | Finance afterwards: balance 450, "Xalis axın" −450 (income − expense), "Borc hərəkətləri" −100 with the cash change −550 stated separately, "Xalis mövqe" labelled |
| 16 | `16-recurring-1440x900.png` | Desktop web layout of Təkrarlananlar |
| 17 | `17-debts-1440x900.png` | Desktop web layout of Borclar |
| 18 | `18-debt-detail-768x1024.png` | Tablet layout of a debt detail |
| 19 | `19-debts-dark-390x844.png` | Borclar in Tünd |
| 20 | `20-recurring-sheet-dark-390x844.png` | The record sheet in Tünd — white text on the primary button |
| 21 | `21-recurring-reduced-motion-390x844.png` | Təkrarlananlar with reduced motion |

## Videos

`walkthrough-normal.mp4` (40.8 s, 411 source frames, 390 × 844, H.264) and `walkthrough-reduced-motion.mp4`
(39.9 s, 109 source frames) were recorded as CDP screencasts with real timing and inspected after encoding. Both
show, in order: Finance → Borclar → Əli → payment sheet (100, Nağd, the effects) → confirm → remaining 200 →
undo from the history → remaining 300 → Təkrarlananlar → record sheet for rent → one confirmation → the linked
transaction → Finance with cash 550 and the receivable still 300 and apart. The reduced-motion recording has
the same steps with entrances and sheets appearing without motion.

## Accessibility, as inspected

The direction control is a radio group ("Mənə borcludurlar" checked, "Mən borcluyam"); "Bağlananlar da" is a
checkbox; the add control is a 48-unit button; every debt row is a button with a spoken label that carries the
counterparty, remaining amount, status and due state ("Əli, qalıq 300,00 AZN, Açıq, Gecikib · 5 gün") and is at
least 44 units tall. The account effect and remaining preview each have one spoken label. The dark canvas
measured `rgb(12, 16, 23)`.

## What this cannot show

Native date pickers, the decimal keyboard, haptics, swipe gestures, and whether Expo Go's dark keyboard follows
the app — the device checklist covers those. The concurrency guarantees (eight simultaneous confirmations, two
racing payments against one remaining balance) are proven by the integration tests, not by this single-browser
run; the run shows the retry and key-reuse behaviour against the live API.
