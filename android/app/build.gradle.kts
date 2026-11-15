plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.linklane"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.linklane"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
}

val buildLinklaneUi by tasks.registering(Exec::class) {
    workingDir = rootProject.projectDir.parentFile
    val npm = if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm"
    commandLine(npm, "run", "lan:android-build")
}

tasks.named("preBuild").configure {
    dependsOn(buildLinklaneUi)
}
