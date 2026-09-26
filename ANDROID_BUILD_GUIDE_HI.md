# Deep Dive — Android APK / Play Store Build

यह project Arena AI से आया React + Vite game है। इसे Android app बनाने के लिए Capacitor wrapper जोड़ा गया है।

## सबसे आसान तरीका

### 1) Computer पर Node.js install करें
Node.js का LTS version इस्तेमाल करें।

### 2) इस folder में Terminal खोलें

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

अगर `android` folder पहले से मौजूद है तो `npx cap add android` दोबारा न चलाएं।

### 3) Android Studio में

Android Studio project खुलने के बाद Gradle sync पूरा होने दें।

**Test APK:**

`Build > Build Bundle(s) / APK(s) > Build APK(s)`

**Google Play Store के लिए:**

`Build > Generate Signed Bundle / APK > Android App Bundle`

फिर नया keystore बनाएं/चुनें और **AAB** generate करें। Play Console में AAB upload करें।

## जरूरी बातें

- Package ID: `com.mohammadkashif.deepdive`
- App name: `Deep Dive`
- यह wrapper game को Android WebView/Capacitor app में चलाता है।
- Play Store publishing के लिए Google Play Console developer account और signing की जरूरत होगी।
- अगर build में `@capacitor/*` version conflict आए तो `npm install` के बाद `npm ls @capacitor/core @capacitor/android @capacitor/cli` से versions check करें; तीनों एक ही major version पर रखें।


## AdMob integration (added for Play Store build)

The project now includes `@capacitor-community/admob@7` for Capacitor 7. The AdMob App ID and rewarded ad unit are configured in `src/admob.ts`.

- Rewarded placement: Game Over → **Watch Ad & Continue**.
- No banner or interstitial ads are used.
- Development builds use Google's official test rewarded ad unit.
- Before the final production build, switch the production flag/build configuration so the real rewarded unit is used.
- The AdMob Android App ID must also be present in the generated Android manifest as required by the plugin.

Google requires test ad units during development; using live ads during testing can create invalid traffic risk. See Google's rewarded-ad guidance.
