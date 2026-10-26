import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Google Play upload key: only from the environment (GitHub secrets in the cloud build, see RELEASE.md).
// Nothing secret is in the repository. Without it the release build is unsigned and the cloud build makes the debug APK.
val releaseKeyFile = System.getenv("NG_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }?.let { file(it) }

android {
    namespace = "com.negiysem.app"
    // Google Play: new apps and updates must target Android 16 (API 36) since 31 August 2026.
    compileSdk = 36

    defaultConfig {
        applicationId = "com.negiysem.app"
        minSdk = 26
        targetSdk = 36
        // Every cloud build gets a higher number, so a new APK always installs as an update
        // (and Play accepts it: each upload needs a higher versionCode than the last).
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 7
        versionName = "2.0"
        // AdMob: Google's sample app ID until the real one is given to the cloud build (ADMOB_APP_ID secret);
        // the banner stays off until ADMOB_BANNER_ID is given too (and Config.API is set).
        manifestPlaceholders["admobAppId"] = System.getenv("ADMOB_APP_ID")?.takeIf { it.isNotBlank() } ?: "ca-app-pub-3940256099942544~3347511713"
        resValue("string", "admob_banner_id", System.getenv("ADMOB_BANNER_ID") ?: "")
        // Widget look test on an emulator (CI: "Widget görünümü"); see src/androidTest.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // A fixed debug key keeps every build installable over the previous one.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            if (releaseKeyFile != null) {
                storeFile = releaseKeyFile
                storePassword = System.getenv("NG_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("NG_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "negiysem-upload"
                // PKCS12 key stores use the store password for the key too.
                keyPassword = System.getenv("NG_KEY_PASSWORD")?.takeIf { it.isNotEmpty() } ?: System.getenv("NG_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // R8 stays off: the page calls MainActivity.Bridge by name through @JavascriptInterface,
            // which R8 would rename or remove without a keep rule (see RELEASE.md before turning it on).
            isMinifyEnabled = false
            signingConfig = if (releaseKeyFile != null) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.glance:glance-appwidget:1.2.0")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.17.0")
    // Runs the server's forecast builder (web/forecast-lib.js) when the server can't be reached (MetDirect).
    implementation("androidx.javascriptengine:javascriptengine:1.1.1")
    // Sends the widget's snapshot to the Ne Giysem? watch app (WatchSync).
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")

    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}

// The app screen is the web app in ../web (the same files the website serves).
// They are copied into the APK's assets on every build, so there is only one copy to edit.
val syncWeb by tasks.registering(Sync::class) {
    from(rootProject.file("web")) {
        include("index.html", "forecast-lib.js", "manifest.webmanifest", "icons/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(syncWeb) }
