/**
 * withNotificationListener.js
 * Expo Config Plugin for Android NotificationListenerService.
 * Injects required permissions and service definition for native development builds.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

function withNotificationListener(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Ensure permissions array exists
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    // Add BIND_NOTIFICATION_LISTENER_SERVICE permission if not already present
    const hasPermission = androidManifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE'
    );
    if (!hasPermission) {
      androidManifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        },
      });
    }

    // Check application tag
    const app = androidManifest.application?.[0];
    if (app) {
      if (!app.service) {
        app.service = [];
      }

      // Check if service already declared
      const serviceName = 'com.moneytracker.notification.BankingNotificationListenerService';
      const hasService = app.service.some((s) => s.$?.['android:name'] === serviceName);

      if (!hasService) {
        app.service.push({
          $: {
            'android:name': serviceName,
            'android:label': 'Money Tracker Banking Notification Listener',
            'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name': 'android.service.notification.NotificationListenerService',
                  },
                },
              ],
            },
          ],
        });
      }
    }

    return config;
  });
}

module.exports = withNotificationListener;
