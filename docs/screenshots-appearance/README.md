# Appearance selection — before and after

Captured with headless Chrome (CDP) on 2026-09-15 at 390 × 844, 2×, against the live API. "Before" is the previous
`expo export` (built 2026-09-10, before this change) served statically; "after" is the running Metro bundle. The OS
appearance is emulated with `prefers-color-scheme`, so every "OS dark" capture is a phone set to dark mode.

`results.json` holds the automated checks (**13 of 13 true**) and the measurements. The palette on screen is
read from the element actually painted near the top-left corner, not from a token.

## Before

| File | What it shows |
|---|---|
| `01-before-profile-os-dark.png` | Profile on a dark phone: dark, and no way to change it — there is no appearance control |
| `02-before-home-os-dark.png` | Home, likewise |

`measurements.before`: palette `dark`, selector present `false`. The app followed the OS and offered no choice.

## After

| File | What it shows |
|---|---|
| `03-after-profile-fresh-install-os-dark.png` | Fresh install on a dark phone: **light**, with "Görünüş" offering Açıq / Tünd / Sistem |
| `04-after-profile-dark.png` | Tünd applied the moment it is tapped, no save step |
| `05-after-profile-light-os-dark.png` | Açıq chosen on a dark phone: stays light |
| `06-after-profile-system-os-dark.png` | Sistem on a dark phone: dark, and the caption says "Hazırda: tünd" |
| `10-home-light.png`, `10-home-dark.png` | Home in both palettes |
| `11-finance-light.png`, `11-finance-dark.png` | Finance in both palettes — the hero keeps its white text in each |
| `12-finance-sheet-light.png`, `12-finance-sheet-dark.png` | The Quick Add sheet in both palettes |
| `13-profile-light.png`, `13-profile-dark.png` | Profile in both palettes |

Every "light" capture in the second block was taken with the OS emulated **dark**, and every "dark" capture with
the OS emulated **light**: the explicit choice wins over the phone.

## What the checks establish

- `freshInstallIsLightOnADarkPhone` — no stored choice, OS dark → light.
- `darkAppliesImmediately` — tapping Tünd repaints at once and stores `dark`.
- `explicitDarkSurvivesReloadAndIgnoresALightPhone` — a reload on a light phone comes back dark.
- `explicitLightIgnoresADarkPhone` — Açıq on a dark phone stays light.
- `systemFollowsTheOs` — Sistem is dark on a dark phone and turns light when the phone does, without a reload.
- `home-*`, `finance-*`, `sheet-*` — representative screens and a sheet in each palette.

## Not shown here

This is web evidence. The native override (`Appearance.setColorScheme`) — which is what makes the iOS keyboard,
system pickers and alerts follow the choice — cannot be exercised in a browser and is unverified on a device.
See the iPhone steps in `docs/DEVICE-CHECKS.md`.
