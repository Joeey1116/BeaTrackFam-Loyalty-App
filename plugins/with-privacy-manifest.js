/**
 * with-privacy-manifest — Expo config plugin for BeaTrackFam Rewards.
 *
 * Writes ios/<AppName>/PrivacyInfo.xcprivacy during `expo prebuild` so the
 * app ships an Apple-compliant privacy manifest covering every
 * required-reason API the app (and its Expo modules) touch:
 *   - UserDefaults  (CA92.1) — Supabase auth session + app preferences
 *   - File timestamps (C617.1) — Expo file / cache handling
 *   - System boot time (35F9.1) — Expo/React Native internals
 *   - Disk space (E174.1) — cache size checks
 *
 * Declared data collection (truthful — matches both stores' questionnaires):
 *   - Email address — linked to the user, NOT used for tracking, purpose: app functionality
 *   - Product interaction (points activity) — linked, NOT tracking, purpose: app functionality
 * Tracking is OFF (NSPrivacyTracking=false, no tracking domains).
 * No ads, no third-party tracking SDKs in this app.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<false/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array/>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>CA92.1</string>
\t\t\t</array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>C617.1</string>
\t\t\t</array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategorySystemBootTime</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>35F9.1</string>
\t\t\t</array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryDiskSpace</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>E174.1</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataTypeEmailAddress</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array>
\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t</array>
\t\t</dict>
\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataTypeProductInteraction</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array>
\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
`;

function withPrivacyManifest(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appName = (config.modRequest.projectName || config.name || 'App').replace(
        /[^a-zA-Z0-9]/g,
        '',
      );
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        appName,
      );
      if (!fs.existsSync(targetDir)) {
        // Prebuild hasn't created the app folder under this name — scan for
        // the folder that holds Info.plist next to the .xcodeproj instead.
        const iosRoot = config.modRequest.platformProjectRoot;
        const found = fs
          .readdirSync(iosRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => path.join(iosRoot, d.name))
          .find((dir) => fs.existsSync(path.join(dir, 'Info.plist')));
        if (!found) {
          throw new Error(
            '[with-privacy-manifest] Could not locate the iOS app target folder.',
          );
        }
        fs.writeFileSync(path.join(found, 'PrivacyInfo.xcprivacy'), MANIFEST);
        return config;
      }
      fs.writeFileSync(path.join(targetDir, 'PrivacyInfo.xcprivacy'), MANIFEST);
      return config;
    },
  ]);
}

module.exports = withPrivacyManifest;
