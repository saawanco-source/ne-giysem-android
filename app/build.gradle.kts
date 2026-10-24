plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.negiysem.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.negiysem.app"
        minSdk = 26
        targetSdk = 35
        // Every cloud build gets a higher number, so a new APK always installs as an update.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 7
        versionName = "2.0"
        // AdMob: Google's sample app ID until the real one is given to the cloud build (ADMOB_APP_ID secret);
        // the banner stays off until ADMOB_BANNER_ID is given too (and Config.API is set).
        manifestPlaceholders["admobAppId"] = System.getenv("ADMOB_APP_ID")?.takeIf { it.isNotBlank() } ?: "ca-app-pub-3940256099942544~3347511713"
        resValue("string", "admob_banner_id", System.getenv("ADMOB_BANNER_ID") ?: "")
    }

    signingConfigs {
        // A fixed debug key keeps every build installable over the previous one.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
}

// The app screen is the web app in ../web (the same files the website serves).
// They are copied into the APK's assets on every build, so there is only one copy to edit.
val syncWeb by tasks.registering(Sync::class) {
    from(rootProject.file("web")) {
        include("index.html", "manifest.webmanifest", "icons/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(syncWeb) }
