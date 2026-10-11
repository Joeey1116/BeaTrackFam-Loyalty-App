#!/usr/bin/env python3
"""Teach the Expo-generated android/app/build.gradle to sign release builds
with the upload keystore from CI (passwords/alias come from env vars).

`expo prebuild` regenerates this file on every build, so the change is
applied fresh each run and never committed. If a future Expo template
changes the shape of the generated file, this script fails the build with
a plain message instead of silently shipping a debug-signed bundle.
"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "android/app/build.gradle"
src = open(path).read()

if "signingConfigs.release" in src:
    print("build.gradle already signs release with signingConfigs.release; nothing to do.")
    sys.exit(0)

DEBUG_BLOCK = """        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
"""

RELEASE_BLOCK = """
        release {
            storeFile file("upload-keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
"""

if DEBUG_BLOCK not in src:
    print("::error::android-signing.py: the debug signing block in android/app/build.gradle "
          "does not match the known Expo template. The template likely changed; "
          "this patch needs updating before the build can sign.")
    sys.exit(1)
src = src.replace(DEBUG_BLOCK, DEBUG_BLOCK + RELEASE_BLOCK, 1)

build_types = src.find("    buildTypes {")
if build_types < 0:
    print("::error::android-signing.py: no buildTypes block found in android/app/build.gradle.")
    sys.exit(1)
release_type = src.find("        release {", build_types)
if release_type < 0:
    print("::error::android-signing.py: no release build type found in android/app/build.gradle.")
    sys.exit(1)
old = "signingConfig signingConfigs.debug"
pos = src.find(old, release_type)
if pos < 0:
    print("::error::android-signing.py: the release build type does not reference the debug "
          "signing config where expected; template changed, patch needs updating.")
    sys.exit(1)
src = src[:pos] + "signingConfig signingConfigs.release" + src[pos + len(old):]

open(path, "w").write(src)
print("build.gradle patched: release builds now sign with the upload keystore.")
