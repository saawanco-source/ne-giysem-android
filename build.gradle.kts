plugins {
    // AGP 8.13.2: supports compileSdk/targetSdk 36 (max API 36.1) and Kotlin 2.3 (its R8 reads Kotlin 2.3 metadata). Needs Gradle 8.13+.
    id("com.android.application") version "8.13.2" apply false
    // Kotlin 2.3.21: play-services-ads 25.5.0 is compiled with Kotlin 2.3 (Kotlin 2.1 cannot read it). Supports AGP 8.2.2–9.0, Gradle 7.6.3–9.3.
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
}
