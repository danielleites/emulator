/**
 * BridgeService.ts — ממשק TypeScript למודול הנייטיב
 * Sprint 9: start/stop/updateToken/isRunning + battery
 * Sprint 10: isNotificationAccessGranted/requestNotificationAccess + onNotification listener
 */

import {NativeEventEmitter, NativeModules} from 'react-native';

const {BridgeService: NativeBridgeService} = NativeModules;

if (!NativeBridgeService) {
  // eslint-disable-next-line no-console
  console.warn('BridgeService native module not found - did you rebuild after Sprint 10?');
}

// EventEmitter יחיד לכל המודול — שיתופי בין מאזינים
const emitter = new NativeEventEmitter(NativeBridgeService);

export type NotificationPayload = {
  source: 'android';
  app: string;          // packageName של האפליקציה ששלחה
  title: string;
  body: string;
  subText?: string;
  ts: number;           // postTime (ms)
  id: number;           // notification id
  tag?: string | null;
  priority?: number;
  category?: string | null;
  isClearable?: boolean;
};

export type NotificationListener = (payload: NotificationPayload) => void;

const BridgeService = {
  // ===== Sprint 9 =====

  start(serverUrl: string, token: string): Promise<boolean> {
    return NativeBridgeService.start(serverUrl, token);
  },

  stop(): Promise<boolean> {
    return NativeBridgeService.stop();
  },

  updateToken(token: string): Promise<boolean> {
    return NativeBridgeService.updateToken(token);
  },

  isRunning(): Promise<boolean> {
    return NativeBridgeService.isRunning();
  },

  isIgnoringBatteryOptimizations(): Promise<boolean> {
    return NativeBridgeService.isIgnoringBatteryOptimizations();
  },

  requestIgnoreBatteryOptimizations(): Promise<boolean> {
    return NativeBridgeService.requestIgnoreBatteryOptimizations();
  },

  // ===== Sprint 10: NotificationListener =====

  /**
   * בודק אם המשתמש נתן הרשאת Notification Access
   */
  isNotificationAccessGranted(): Promise<boolean> {
    return NativeBridgeService.isNotificationAccessGranted();
  },

  /**
   * פותח את מסך ההגדרות של Notification Access
   */
  requestNotificationAccess(): Promise<boolean> {
    return NativeBridgeService.requestNotificationAccess();
  },

  /**
   * שולח התראה מזוייפת ל-JS (לבדיקת loopback)
   */
  forwardNotification(payload: NotificationPayload): Promise<boolean> {
    return NativeBridgeService.forwardNotification(JSON.stringify(payload));
  },

  /**
   * רישום מאזין לאירועי התראה — מחזיר פונקציית cleanup
   *
   * דוגמת שימוש:
   *   useEffect(() => {
   *     const unsub = BridgeService.onNotification(payload => {
   *       webViewRef.current?.injectJavaScript(`window.PCNative.onNotification(${JSON.stringify(payload)})`);
   *     });
   *     return unsub;
   *   }, []);
   */
  onNotification(listener: NotificationListener): () => void {
    const subscription = emitter.addListener('pc_notification', (rawJson: string) => {
      try {
        const payload = JSON.parse(rawJson) as NotificationPayload;
        listener(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to parse notification payload', err, rawJson);
      }
    });
    return () => subscription.remove();
  },
};

export default BridgeService;
