// Ne Giysem? on the watch (Wear OS 3+): a complication with the phone's outfit for any watch face, and a small screen
// behind it. The phone app sends its widget snapshot over the Wearable Data Layer (app: data/WatchSync.kt), which only
// connects apps with the same package name and signing key: hence applicationId com.negiysem.app here too.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Same upload key as the phone app, only from the environment (GitHub secrets in the cloud build, see RELEASE.md).
val releaseKeyFile = System.getenv("NG_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }?.let { file(it) }

android {
    namespace = "com.negiysem.app.wear"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.negiysem.app"
        minSdk = 30
        targetSdk = 35
        // Its own numbers, above the phone app's (one Play listing, so every APK needs a version code of its own).
        versionCode = 100_000 + (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
        versionName = "2.0"
    }

    signingConfigs {
        // The phone app's fixed debug key: debug builds of phone and watch talk to each other too.
        getByName("debug") {
            storeFile = rootProject.file("app/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            if (releaseKeyFile != null) {
                storeFile = releaseKeyFile
                storePassword = System.getenv("NG_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("NG_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "negiysem-upload"
                keyPassword = System.getenv("NG_KEY_PASSWORD")?.takeIf { it.isNotEmpty() } ?: System.getenv("NG_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseKeyFile != null) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The stickers, the warning sign and the launcher art are the phone app's own files (copied at build time).
    sourceSets.getByName("main").res.srcDir(layout.buildDirectory.dir("generated/shared-res"))
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

val sharedRes by tasks.registering(Sync::class) {
    from(rootProject.file("app/src/main/res")) {
        include("drawable/g_*.xml", "drawable/ic_warn.xml", "mipmap-*dpi/ic_launcher_foreground.png")
    }
    into(layout.buildDirectory.dir("generated/shared-res"))
}
tasks.named("preBuild") { dependsOn(sharedRes) }

dependencies {
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
    implementation("androidx.core:core-ktx:1.17.0")
}
