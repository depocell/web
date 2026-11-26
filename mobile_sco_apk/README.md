# SCO Depocell Android APK (Capacitor)

Shell Android ringan yang langsung memuat `https://sco.depas.my.id`.

## Cara Build APK
1. Pastikan **Node.js** dan **Android Studio (JDK + Android SDK)** sudah terpasang.
2. Jalankan di folder `mobile_sco_apk/`:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   ```
3. Tambahkan izin lokasi & kamera di `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.CAMERA" />
   ```
4. Buka di Android Studio (`npx cap open android`) -> **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
