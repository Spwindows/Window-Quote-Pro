# Window Quote Pro

A generic, offline-friendly quoting app for window cleaning businesses.

## Included files
- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `maskable-512.png`

## Features
- Local business settings
- Per-item pricing or time-based pricing
- Windows, tracks, flyscreens, balustrades, solar panels, gutters
- External only, two storey, builder's clean modifiers
- Local storage on device
- `mailto:` email draft opening
- Service worker for offline-first behaviour
- Installable PWA structure

## GitHub / Netlify
Upload all files to the root of your repo.

## Play Store direction
This is Play-Store-ready as a PWA/web app base. For Android release:
1. Host on Netlify.
2. Wrap in Android Studio as a Trusted Web Activity or WebView app.
3. Use your own Android icons/splash screen if you want custom store branding.
4. Generate a signed AAB for Play Console.

## Important
The app does not send emails itself. It opens the user's email app so they can physically review and send the quote.
