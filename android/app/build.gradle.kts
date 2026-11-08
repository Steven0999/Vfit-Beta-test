import java.security.KeyStore
import java.security.MessageDigest

plugins {
    id("com.android.application")
}

val vfitKeystorePath = providers.environmentVariable("VFIT_KEYSTORE_PATH").orNull
val vfitKeystorePassword = providers.environmentVariable("VFIT_KEYSTORE_PASSWORD").orNull
require((vfitKeystorePath == null) == (vfitKeystorePassword == null)) {
    "Configure both VFIT_KEYSTORE_PATH and VFIT_KEYSTORE_PASSWORD for persistent signing"
}


// The package ID and certificate are the installed app's data identity.
// Never silently rotate this key or tell users to uninstall to accept an update.
if (vfitKeystorePath != null && vfitKeystorePassword != null) {
    val keyStore = KeyStore.getInstance("PKCS12")
    file(vfitKeystorePath).inputStream().use { keyStore.load(it, vfitKeystorePassword.toCharArray()) }
    val certificate = requireNotNull(keyStore.getCertificate("vfit")) { "VFIT signing alias is missing" }
    val fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    val expected = rootProject.file("vfit-update-certificate.sha256").readText().trim()
    require(fingerprint == expected) { "The signing key changed. Update blocked to protect existing installations and their saved data." }
}

android {
    namespace = "com.vaughanfitness.vfit"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vaughanfitness.vfit"
        minSdk = 28
        targetSdk = 36
        versionCode = 56
        versionName = "2.1.0-beta.55"
        manifestPlaceholders["vfitAppLabel"] = "@string/app_name"
    }

    signingConfigs {
        if (vfitKeystorePath != null && vfitKeystorePassword != null) {
            create("vfitBeta") {
                storeFile = file(vfitKeystorePath)
                storeType = "PKCS12"
                storePassword = vfitKeystorePassword
                keyAlias = "vfit"
                keyPassword = vfitKeystorePassword
            }
        }
    }

    buildTypes {
        debug {
            if (vfitKeystorePath != null) {
                signingConfig = signingConfigs.getByName("vfitBeta")
            } else {
                // A development identity installs alongside VFIT.
                // It cannot replace the real app or its private data directory.
                applicationIdSuffix = ".test"
                versionNameSuffix = "-test"
                manifestPlaceholders["vfitAppLabel"] = "VFIT Test"
            }
        }
        release {
            if (vfitKeystorePath != null) signingConfig = signingConfigs.getByName("vfitBeta")
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

val verifyVfitUpdateSigning by tasks.registering {
    doLast { require(vfitKeystorePath != null) { "The original VFIT signing key is required for a release update." } }
}
tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" || it.name == "packageRelease" }
    .configureEach { dependsOn(verifyVfitUpdateSigning) }
