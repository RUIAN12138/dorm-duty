#!/usr/bin/env bash
# Build a local preview without writing SDK paths or push credentials to Git.
set -euo pipefail
DORM_NATIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DORM_PREVIEW_ROOT="$DORM_NATIVE_ROOT/../data/native-preview"
mkdir -p "$DORM_PREVIEW_ROOT"
case "${1:-}" in
  android)
    DORM_ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    if [[ ! -d "$DORM_ANDROID_SDK/platforms/android-35" ]]; then
      echo '需要 Android SDK 35；请设置 ANDROID_HOME。' >&2
      exit 1
    fi
    DORM_BUILD_JAVA="${DORM_JAVA_HOME:-}"
    if [[ -z "$DORM_BUILD_JAVA" && -d '/Applications/Android Studio.app/Contents/jbr/Contents/Home' ]]; then
      DORM_BUILD_JAVA='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
    fi
    DORM_BUILD_JAVA="${DORM_BUILD_JAVA:-${JAVA_HOME:-}}"
    if [[ ! -x "$DORM_BUILD_JAVA/bin/java" ]]; then
      echo '请用 DORM_JAVA_HOME 指定 JDK 17–23（本机推荐 Android Studio 的 JBR）。' >&2
      exit 1
    fi
    DORM_JAVA_VERSION="$("$DORM_BUILD_JAVA/bin/java" -version 2>&1 | head -n 1)"
    if [[ "$DORM_JAVA_VERSION" =~ version[[:space:]]\"([0-9]+) && ( "${BASH_REMATCH[1]}" -lt 17 || "${BASH_REMATCH[1]}" -gt 23 ) ]]; then
      echo 'Gradle 8.11 需要 JDK 17–23，请调整 DORM_JAVA_HOME。' >&2
      exit 1
    fi
    DORM_GRADLE_ARGS=(--no-daemon :app:testDebugUnitTest :app:assembleDebug :app:lintDebug)
    if [[ -n "${DORM_JPUSH_APPKEY:-}" ]]; then
      if [[ ! "$DORM_JPUSH_APPKEY" =~ ^[A-Fa-f0-9]{24}$ ]]; then
        echo 'DORM_JPUSH_APPKEY 必须是公开的 24 位应用标识。' >&2
        exit 1
      fi
      DORM_GRADLE_ARGS+=("-PJPUSH_APPKEY=$DORM_JPUSH_APPKEY")
    fi
    (cd "$DORM_NATIVE_ROOT/android" && JAVA_HOME="$DORM_BUILD_JAVA" ANDROID_HOME="$DORM_ANDROID_SDK" ./gradlew "${DORM_GRADLE_ARGS[@]}")
    cp "$DORM_NATIVE_ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$DORM_PREVIEW_ROOT/lundao-android-preview.apk"
    echo "调试 APK：$DORM_PREVIEW_ROOT/lundao-android-preview.apk"
    ;;
  harmony)
    DORM_DEVECO_ROOT="${DORM_DEVECO_HOME:-/Applications/DevEco-Studio.app/Contents}"
    DORM_HVIGOR="$DORM_DEVECO_ROOT/tools/hvigor/bin/hvigorw"
    if [[ ! -x "$DORM_HVIGOR" ]]; then
      echo '需要 DevEco Studio；请设置 DORM_DEVECO_HOME 为其 Contents 目录。' >&2
      exit 1
    fi
    if [[ ! -d "$DORM_NATIVE_ROOT/harmony/oh_modules" ]]; then
      (cd "$DORM_NATIVE_ROOT/harmony" && "$DORM_DEVECO_ROOT/tools/ohpm/bin/ohpm" install --all)
    fi
    (cd "$DORM_NATIVE_ROOT/harmony" && DEVECO_SDK_HOME="${DEVECO_SDK_HOME:-$DORM_DEVECO_ROOT/sdk}" "$DORM_HVIGOR" --mode module -p product=default -p buildMode=debug assembleHap --no-daemon)
    cp "$DORM_NATIVE_ROOT/harmony/entry/build/default/outputs/default/entry-default-unsigned.hap" "$DORM_PREVIEW_ROOT/lundao-harmony-unsigned.hap"
    echo "模拟器 HAP：$DORM_PREVIEW_ROOT/lundao-harmony-unsigned.hap；真机需本应用签名。"
    ;;
  *)
    echo '用法：bash native/build-preview.sh android|harmony' >&2
    echo '安卓公开 AppKey 可通过 DORM_JPUSH_APPKEY 注入，不写入文件。' >&2
    exit 2
    ;;
esac
