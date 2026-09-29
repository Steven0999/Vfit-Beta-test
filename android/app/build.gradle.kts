plugins {
    id("com.android.application")
}

android {
    namespace = "com.vaughanfitness.vfit"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vaughanfitness.vfit"
        minSdk = 28
        targetSdk = 36
        versionCode = 32
        versionName = "2.1.0-beta.32"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

val generatedWebAssets = layout.buildDirectory.dir("generated/vfitWebAssets")
val syncVfitWebAssets by tasks.registering(Sync::class) {
    val webRoot = rootProject.projectDir.parentFile
    from(webRoot) {
        include(
            "index.html",
            "Styles.css",
            "App.js",
            "vfit-config.js",
            "manifest.webmanifest",
            "sw.js",
            "icon.svg",
            "icon-192.png",
            "icon-512.png",
            "core/**",
            "training/**",
            "nutrition/**",
            "ui/**",
            "metrics/**",
            "coaching/**",
            "firebase/**",
            "feedback/**"
        )
    }
    into(generatedWebAssets)
}

android.sourceSets.getByName("main").assets.srcDir(generatedWebAssets.get().asFile)
tasks.named("preBuild").configure { dependsOn(syncVfitWebAssets) }

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
}
