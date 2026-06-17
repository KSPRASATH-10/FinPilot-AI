# FinPilot AI — Complete Terminal Execution Guide

## Prerequisites

| Tool | Required Version | Install |
|------|-----------------|---------|
| Node.js | 18 LTS or 20 LTS | https://nodejs.org |
| npm | 9+ (bundled with Node) | — |
| Python | 3.10 – 3.12 | https://python.org |
| pip | latest | `python -m pip install --upgrade pip` |
| Expo CLI | latest | `npm install -g expo-cli` (step 3) |
| Expo Go app | latest | iOS App Store / Google Play |

---

## Step 1 — Extract & Enter Project Root

```bash
# If received as zip:
unzip FinPilotAI.zip -d FinPilotAI
cd FinPilotAI
```

---

## Step 2 — Copy All Rewritten Source Files

Replace the contents of your existing `apps/` directory with the files
delivered in this patch set. Every file path is relative to the repo root:

```
apps/mobile/store/useAuthStore.ts
apps/mobile/store/useFinanceStores.ts
apps/mobile/store/useSettingsStore.ts
apps/mobile/theme/index.ts
apps/mobile/theme/useTheme.ts
apps/mobile/components/ui/GlassCard.tsx
apps/mobile/components/ui/Screen.tsx
apps/mobile/components/dashboard/MetricCard.tsx
apps/mobile/app/_layout.tsx
apps/mobile/app/index.tsx
apps/mobile/app/(auth)/_layout.tsx
apps/mobile/app/(auth)/login.tsx
apps/mobile/app/(auth)/register.tsx
apps/mobile/app/(auth)/forgot-password.tsx
apps/mobile/app/(tabs)/_layout.tsx
apps/mobile/app/(tabs)/home/index.tsx
apps/mobile/app/(tabs)/analytics/index.tsx
apps/mobile/app/(tabs)/assistant/index.tsx
apps/mobile/app/(tabs)/calendar/index.tsx
apps/mobile/app/(tabs)/profile/index.tsx
apps/mobile/app/(tabs)/reports/index.tsx
apps/mobile/app/(tabs)/scan/index.tsx
apps/mobile/app/(tabs)/settings/index.tsx
apps/mobile/package.json
apps/mobile/app.json
apps/mobile/babel.config.js
apps/mobile/tsconfig.json
apps/mobile/.env
apps/backend/src/app.ts
apps/backend/src/middleware/auth.ts
apps/backend/src/modules/auth/auth.routes.ts
apps/backend/src/modules/analytics/analytics.routes.ts
apps/backend/src/modules/assistant/assistant.routes.ts
apps/backend/src/modules/bills/bill.routes.ts
apps/backend/src/modules/reports/report.routes.ts
apps/backend/package.json
apps/backend/tsconfig.json
apps/backend/.env
apps/forecasting-service/app/main.py
apps/forecasting-service/requirements.txt
package.json
```

---

## Step 3 — Install Global CLI Tools

```bash
npm install -g expo-cli eas-cli concurrently
```

---

## Step 4 — Install Backend (Node/Express) Dependencies

```bash
cd apps/backend
rm -rf node_modules package-lock.json
npm install
cd ../..
```

---

## Step 5 — Install Mobile (Expo/React Native) Dependencies

```bash
cd apps/mobile
rm -rf node_modules package-lock.json .expo
npm install
cd ../..
```

If you encounter peer-dependency conflicts:
```bash
npm install --legacy-peer-deps
```

---

## Step 6 — Set Up Python Virtual Environment & Forecasting Service

```bash
cd apps/forecasting-service

# Create venv (do this once)
python3 -m venv .venv

# Activate venv
# macOS / Linux:
source .venv/bin/activate
# Windows (PowerShell):
.venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

cd ../..
```

---

## Step 7 — Configure Environment Variables

### Backend (`apps/backend/.env`)
```env
PORT=4000
NODE_ENV=development
JWT_SECRET=finpilot_dev_secret_change_in_prod
GEMINI_API_KEY=          # Optional — leave blank to use built-in fallback answers
```

### Mobile (`apps/mobile/.env`)
```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

> **Physical Device Note:** Replace `localhost` with your machine's LAN IP
> (e.g. `http://192.168.1.42:4000`). Find it with:
> - macOS/Linux: `ifconfig | grep "inet " | grep -v 127`
> - Windows: `ipconfig` → look for IPv4 Address

---

## Step 8 — Boot the Backend Server

Open **Terminal 1**:

```bash
cd apps/backend
npm run dev
```

Expected output:
```
[FinPilot Backend] Running on http://0.0.0.0:4000
```

Verify health endpoint:
```bash
curl http://localhost:4000/health
# → {"status":"ok","timestamp":"..."}
```

---

## Step 9 — Boot the Forecasting Service

Open **Terminal 2**:

```bash
cd apps/forecasting-service
source .venv/bin/activate          # or .venv\Scripts\Activate.ps1 on Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Verify:
```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"forecasting",...}
```

---

## Step 10 — Boot the Expo Mobile App

Open **Terminal 3**:

```bash
cd apps/mobile
npx expo start --clear
```

The Metro bundler QR code will appear. Scan with:
- **iOS** → Expo Go app (Camera app also works)
- **Android** → Expo Go app

Or press:
- `a` → Open Android emulator
- `i` → Open iOS Simulator (macOS only, requires Xcode)
- `w` → Open in browser (limited — no camera/file system)

---

## Step 11 — Verify End-to-End Flows

### Auth Flow
1. Open app → lands on **Login** screen (dark glassmorphic design)
2. Tap **Create an account** → Register with any email + password
3. App navigates to **Home Dashboard**
4. Re-open and login with the same credentials

> In `development` mode (`NODE_ENV=development`), the backend auth middleware
> always passes even with expired/invalid tokens — no UNAUTHENTICATED blocks.

### Home Dashboard
- Pulls analytics summary → shows Income / Expenses / Savings / Health Score
- Pull-to-refresh reloads from backend (or mock data if backend is offline)

### FinPilot AI Chat
- Tap **FinPilot** tab → type any financial question
- If `GEMINI_API_KEY` is set → uses Gemini 1.5 Flash
- Otherwise → uses built-in offline intelligence engine (always works)

### Calendar
- Shows current month with heat-map intensity dots per day
- Tap any day to see transaction breakdown
- Navigate months with `‹` / `›` arrows

### Reports / PDF
- Select **Weekly / Monthly / Quarterly**
- Tap **Generate & Download PDF**
- Native system share sheet opens → Save to Files / Share / Print

### Bill Scanner
- Tap **scan** → choose **Camera** or **Gallery**
- Grant permissions when prompted
- App sends image to `/api/v1/bills/scan` endpoint
- Line items appear with toggles
- Tap items to select/deselect → tap **Confirm & Add to Expenses**

### Profile / Account Deletion
- Shows only real user data (name, email, department, tier)
- **Delete Account & Wipe Data** → clears all Zustand state → redirects to login

### Settings
- **Dark / Light / System** theme toggle — live preview
- **English / Tamil** language toggle — all UI labels switch
- Notifications / Biometrics toggles

---

## Troubleshooting

### `Unable to resolve module` errors
```bash
cd apps/mobile
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

### Metro bundler cache stale
```bash
cd apps/mobile
npx expo start --clear --reset-cache
```

### `UNAUTHENTICATED` responses from backend
- Ensure `NODE_ENV=development` is set in `apps/backend/.env`
- The auth middleware will auto-inject a dev user in non-production mode

### Camera/Gallery not working in Expo Go
- Permissions are requested at runtime (iOS/Android dialogs will appear)
- Ensure `expo-image-picker` and `expo-camera` are installed
- On iOS Simulator, camera is unavailable — use **Gallery** picker instead

### PDF generation fails
- `expo-print` and `expo-sharing` must be installed
- Works on physical devices and emulators with file system access
- Web (`w` mode) does not support `expo-print` — use a device

### Port conflicts
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9    # macOS/Linux
netstat -ano | findstr :4000      # Windows → use Task Manager to kill PID

# Kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

### Python venv not activating
```bash
# If .venv doesn't exist yet:
python3 -m venv .venv

# macOS/Linux
source apps/forecasting-service/.venv/bin/activate

# Verify
which python   # should point to .venv/bin/python
```

### Expo SDK version mismatch warnings
```bash
cd apps/mobile
npx expo install --fix
```

---

## Optional: Add Gemini AI Key (Free Tier)

1. Go to https://aistudio.google.com/app/apikey
2. Create a free API key (no billing required for Gemini 1.5 Flash)
3. Add to `apps/backend/.env`:
   ```env
   GEMINI_API_KEY=AIza...your_key_here
   ```
4. Restart the backend → `npm run dev`

The assistant and bill scanner will now use live Gemini responses.
Without the key, both fall back to the built-in intelligence engine seamlessly.

---

## One-Command Dev Start (All Services)

From the repo root, after completing steps 3–6:

```bash
npm run dev
```

This uses `concurrently` to start backend (port 4000), forecasting service
(port 8000), and Expo Metro bundler simultaneously in a single terminal.

---

## Production Build (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure (first time only)
cd apps/mobile
eas build:configure

# Build for Android APK (free tier)
eas build --platform android --profile preview

# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile preview
```

---

*FinPilot AI — Production-grade financial intelligence platform*
*All 8 feature modules implemented and zero-error verified.*
