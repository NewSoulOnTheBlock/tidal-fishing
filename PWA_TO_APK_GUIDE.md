# Converting Tidal PWA to APK

There are several methods to package your PWA as an Android APK. Here are the recommended options:

---

## Option 1: PWABuilder (Recommended - Easiest)

**PWABuilder** is a Microsoft tool that generates production-ready APKs from PWAs.

### Steps:

1. **Go to PWABuilder**
   - Visit: https://www.pwabuilder.com/

2. **Enter Your URL**
   - Enter: `https://tidalfishing.fun`
   - Click "Start"

3. **Validate Your PWA**
   - PWABuilder will score your PWA
   - Fix any issues it finds (manifest, service worker, etc.)

4. **Generate APK**
   - Click "Package For Stores" → "Android"
   - Choose "Signed APK" or "Unsigned APK"
   - Download the generated APK

5. **Configure Android Settings**
   - **Package ID:** `com.tidalfishing.app`
   - **App Name:** `Tidal Fishing`
   - **Version:** `1.0.0`
   - **Min SDK:** `21` (Android 5.0+)
   - **Target SDK:** `34` (Android 14)

6. **Sign the APK (for Play Store)**
   - Generate a keystore: `keytool -genkey -v -keystore tidal.keystore -alias tidal -keyalg RSA -keysize 2048 -validity 10000`
   - Upload the keystore when prompted by PWABuilder
   - Keep the keystore file safe - you'll need it for updates

7. **Download and Test**
   - Download the APK
   - Install on an Android device or emulator
   - Test all features

---

## Option 2: Bubblewrap (Command Line - More Control)

**Bubblewrap** is Google's official CLI tool for TWA (Trusted Web Activity) generation.

### Setup:

```bash
# Install Bubblewrap globally
npm install -g @bubblewrap/cli

# Install Android SDK if not already installed
# Download from: https://developer.android.com/studio
```

### Steps:

```bash
# Navigate to your project
cd C:\Users\roota\tidal

# Initialize Bubblewrap project
bubblewrap init --manifest https://tidalfishing.fun/manifest.json

# Answer the prompts:
# Domain: tidalfishing.fun
# Package ID: com.tidalfishing.app
# App Name: Tidal Fishing
# Display mode: standalone
# Theme color: #5fd4ff
# Background color: #1a2332
# Icon: Use the PWA icons from manifest.json

# Build the APK
bubblewrap build

# The APK will be generated in: ./app-release-unsigned.apk
```

### Sign the APK:

```bash
# Generate keystore (first time only)
keytool -genkey -v -keystore tidal-release.keystore -alias tidal -keyalg RSA -keysize 2048 -validity 10000

# Sign the APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore tidal-release.keystore app-release-unsigned.apk tidal

# Optimize (zipalign)
zipalign -v 4 app-release-unsigned.apk tidal-release.apk
```

---

## Option 3: Android Studio (Full Control)

If you want maximum control, use Android Studio with Trusted Web Activity.

### Steps:

1. **Download Android Studio**
   - https://developer.android.com/studio

2. **Create New Project**
   - File → New → New Project
   - Select "Native C++" or "Empty Activity"
   - Package name: `com.tidalfishing.app`

3. **Add TWA Dependency**

Edit `app/build.gradle`:
```gradle
dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
}
```

4. **Configure TWA**

Edit `AndroidManifest.xml`:
```xml
<activity
    android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
    android:label="@string/app_name"
    android:exported="true">
    <meta-data
        android:name="android.support.customtabs.trusted.DEFAULT_URL"
        android:value="https://tidalfishing.fun" />
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="tidalfishing.fun" />
    </intent-filter>
</activity>
```

5. **Build APK**
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Find APK in: `app/build/outputs/apk/release/`

---

## Digital Asset Links (Required for TWA)

To verify your app owns the domain, add this to your web server:

Create: `C:\Users\roota\tidal\public\.well-known\assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.tidalfishing.app",
    "sha256_cert_fingerprints": [
      "YOUR_SHA256_FINGERPRINT_HERE"
    ]
  }
}]
```

Get your fingerprint:
```bash
keytool -list -v -keystore tidal-release.keystore -alias tidal
```

The file must be accessible at: `https://tidalfishing.fun/.well-known/assetlinks.json`

---

## Publishing to Google Play Store

1. **Create Developer Account**
   - https://play.google.com/console
   - One-time fee: $25

2. **Prepare Store Listing**
   - App name: Tidal Fishing
   - Short description: Web3 fishing adventure on Solana
   - Full description: (Include gameplay details, features, blockchain info)
   - Screenshots: (At least 2, ideally 8)
   - Feature graphic: 1024x500px
   - Icon: 512x512px
   - Category: Games / Casual
   - Content rating: ESRB Everyone

3. **Required Assets**
   - High-res icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (phone: 16:9, tablet: 16:10)
   - Promo video (optional, YouTube link)

4. **Upload APK**
   - Production → Create new release
   - Upload signed APK
   - Set version name (1.0.0) and version code (1)

5. **Content Rating**
   - Complete the questionnaire
   - Mention: Contains simulated gambling (fishing mechanics)
   - No violence, no social features with user content

6. **Privacy Policy**
   - Required for all apps on Play Store
   - Host at: `https://tidalfishing.fun/privacy.html`
   - Add link in Play Store listing

7. **Submit for Review**
   - Review typically takes 1-3 days
   - Google may request changes

---

## Testing Before Publishing

### Install on Android Device:

```bash
# Enable USB debugging on your phone (Settings → Developer Options)

# Connect phone via USB

# Install APK
adb install tidal-release.apk

# Or via wireless:
# 1. Transfer APK to phone
# 2. Open file manager
# 3. Tap APK
# 4. Allow "Install from unknown sources"
# 5. Install
```

### Test Checklist:

- ✅ App icon shows on home screen
- ✅ Splash screen displays
- ✅ Game loads correctly
- ✅ Wallet connection works
- ✅ Audio plays
- ✅ Touch controls work
- ✅ Portrait/landscape orientation
- ✅ Offline mode (if applicable)
- ✅ Push notifications (if implemented)
- ✅ Back button behavior
- ✅ App doesn't show browser UI

---

## Recommended Approach

**For Quick Testing:**
1. Use **PWABuilder** - generates APK in 5 minutes

**For Production:**
1. Use **Bubblewrap** - more control, Google-official tool
2. Set up Digital Asset Links
3. Test thoroughly on multiple devices
4. Sign with production keystore
5. Publish to Play Store

---

## Important Notes

- **Keep your keystore safe** - you can't update the app without it
- **Test on real devices** - emulators don't catch all issues
- **PWA must be HTTPS** - already done (tidalfishing.fun)
- **Manifest must be valid** - already configured
- **Icons must be high-res** - check your manifest.json
- **Service worker recommended** - for offline support (optional)

---

## Next Steps

1. Choose your method (PWABuilder recommended for first-time)
2. Generate the APK
3. Test on Android device
4. If satisfied, create Play Store listing
5. Upload signed APK
6. Submit for review

Let me know if you need help with any of these steps!
