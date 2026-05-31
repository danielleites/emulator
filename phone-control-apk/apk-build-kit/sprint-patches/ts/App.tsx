/**
 * Phone Control — App.tsx
 * Sprint 9 + 10 — WebView + BridgeService + NotificationListener
 */

import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TextInput,
  Button,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BridgeService, {NotificationPayload} from './src/native/BridgeService';

const STORAGE_KEY_URL = 'pc_server_url';
const STORAGE_KEY_TOKEN = 'pc_server_token';

function App(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [configured, setConfigured] = useState<boolean>(false);

  // ===== טעינת config שמור =====
  useEffect(() => {
    (async () => {
      try {
        const url = await AsyncStorage.getItem(STORAGE_KEY_URL);
        const tok = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
        if (url && tok) {
          setServerUrl(url);
          setToken(tok);
          setConfigured(true);
        }
      } catch (e) {
        console.warn('Failed to load config', e);
      }
    })();
  }, []);

  // ===== Sprint 9: הפעלת BridgeService =====
  useEffect(() => {
    if (!configured) return;
    BridgeService.start(serverUrl, token)
      .then(() => console.log('[Sprint 9] BridgeService started'))
      .catch(err => console.error('start failed', err));

    // בדיקת battery optimization
    BridgeService.isIgnoringBatteryOptimizations().then(ok => {
      if (!ok) {
        Alert.alert(
          'אופטימיזציית סוללה',
          'מומלץ לאפשר לאפליקציה לרוץ ברקע כדי למנוע ניתוקים',
          [
            {text: 'אחר כך', style: 'cancel'},
            {
              text: 'אפשר',
              onPress: () => BridgeService.requestIgnoreBatteryOptimizations(),
            },
          ],
        );
      }
    });
  }, [configured, serverUrl, token]);

  // ===== POST_NOTIFICATIONS permission (Android 13+) =====
  useEffect(() => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      ).catch(e => console.warn('POST_NOTIFICATIONS denied', e));
    }
  }, []);

  // ===== Sprint 10: מאזין התראות =====
  useEffect(() => {
    if (!configured) return;
    const unsubscribe = BridgeService.onNotification(
      (payload: NotificationPayload) => {
        const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
        const script = `
          (function() {
            try {
              if (window.PCNative && typeof window.PCNative.onNotification === 'function') {
                window.PCNative.onNotification(${safeJson});
              }
            } catch (e) { console.error('PCNative.onNotification failed', e); }
            true;
          })();
        `;
        webViewRef.current?.injectJavaScript(script);
      },
    );
    return unsubscribe;
  }, [configured]);

  // ===== WebView message handler =====
  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'pc.update_token':
          await AsyncStorage.setItem(STORAGE_KEY_TOKEN, data.token);
          await BridgeService.updateToken(data.token);
          setToken(data.token);
          break;

        case 'pc.request_battery':
          await BridgeService.requestIgnoreBatteryOptimizations();
          break;

        case 'pc.stop_service':
          await BridgeService.stop();
          break;

        case 'pc.log':
          console.log('[WebView]', data.message);
          break;

        // ===== Sprint 10 =====
        case 'pc.request_notification_access': {
          const granted = await BridgeService.isNotificationAccessGranted();
          if (!granted) {
            await BridgeService.requestNotificationAccess();
          }
          webViewRef.current?.injectJavaScript(`
            window.PCNative?.onNotificationAccessResult?.(${granted});
            true;
          `);
          break;
        }

        case 'pc.check_notification_access': {
          const granted = await BridgeService.isNotificationAccessGranted();
          webViewRef.current?.injectJavaScript(`
            window.PCNative?.onNotificationAccessResult?.(${granted});
            true;
          `);
          break;
        }

        default:
          console.log('Unknown message type', data.type);
      }
    } catch (err) {
      console.error('onMessage parse error', err);
    }
  }, []);

  // ===== Setup screen =====
  const handleSave = useCallback(async () => {
    if (!serverUrl.startsWith('http')) {
      Alert.alert('שגיאה', 'כתובת שרת חייבת להתחיל ב-http:// או https://');
      return;
    }
    if (!token || token.length < 8) {
      Alert.alert('שגיאה', 'token חייב להיות לפחות 8 תווים');
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY_URL, serverUrl);
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
    setConfigured(true);
  }, [serverUrl, token]);

  // ===== JS injected ל-WebView ב-load =====
  const injectedJavaScript = `
    window.PC_TOKEN = ${JSON.stringify(token)};
    true;
  `;

  if (!configured) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.setup}>
          <Text style={styles.title}>Phone Control — הגדרה</Text>
          <Text style={styles.label}>כתובת שרת</Text>
          <TextInput
            style={styles.input}
            placeholder="https://your-server.com"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={styles.label}>Token</Text>
          <TextInput
            style={styles.input}
            placeholder="paste your token"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            secureTextEntry
          />
          <Button title="התחבר" onPress={handleSave} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView
        ref={webViewRef}
        source={{
          uri: serverUrl,
          headers: {Authorization: `Bearer ${token}`},
        }}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        onError={e => console.error('WebView error', e.nativeEvent)}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  webview: {flex: 1},
  setup: {flex: 1, padding: 24, justifyContent: 'center'},
  title: {fontSize: 22, fontWeight: 'bold', marginBottom: 24, textAlign: 'center'},
  label: {fontSize: 14, marginTop: 12, marginBottom: 4, color: '#333'},
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
});

export default App;
