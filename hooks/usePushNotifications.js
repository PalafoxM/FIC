import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { ENV } from '../constants/env';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const getProjectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId ??
  null;

const getBackendCandidateUrls = () => [
  `${ENV.apiBaseUrl}/auth/register-token`,
  `${ENV.apiBaseUrl}/notifications/register-token`,
  `${ENV.apiBaseUrl}/push/register-token`,
];

const PUSH_TOKEN_KEY = 'pushToken';
const PUSH_TOKEN_REGISTERED_KEY = 'pushTokenRegistered';

const registerTokenInBackend = async (pushToken) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('No hay token de sesion para registrar push token');
      return false;
    }

    for (const url of getBackendCandidateUrls()) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: pushToken,
            pushToken,
            expoPushToken: pushToken,
            platform: Platform.OS,
          }),
        });

        const rawResponse = await response.text();
        let data = null;

        try {
          data = rawResponse ? JSON.parse(rawResponse) : null;
        } catch (_parseError) {
          data = null;
        }

        if (response.ok && !data?.error) {
          console.log('Token registrado en backend:', url);
          await AsyncStorage.setItem(PUSH_TOKEN_REGISTERED_KEY, '1');
          return true;
        }

        console.log('Fallo registrando token:', url, response.status, rawResponse);
      } catch (innerError) {
        console.log('Error registrando token en:', url, innerError?.message || innerError);
      }
    }

    console.log('No se encontro un endpoint compatible para registrar el token push');
    return false;
  } catch (error) {
    console.error('Error registrando token en backend:', error);
    return false;
  }
};

export const usePushNotifications = () => {
  useEffect(() => {
    let isMounted = true;
    const isAndroidExpoGo =
      Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
    const projectId = getProjectId();
    let appStateSubscription = null;
    let refreshInterval = null;

    const tryRegisterStoredToken = async () => {
      try {
        const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        const authToken = await AsyncStorage.getItem('token');
        const alreadyRegistered = await AsyncStorage.getItem(PUSH_TOKEN_REGISTERED_KEY);

        if (!pushToken || !authToken) {
          return;
        }

        if (alreadyRegistered === '1') {
          return;
        }

        await registerTokenInBackend(pushToken);
      } catch (error) {
        console.error('Error reintentando registro del push token:', error);
      }
    };

    const setupNotifications = async () => {
      try {
        if (isAndroidExpoGo) {
          console.log('Notificaciones push remotas omitidas en Expo Go para Android');
          return;
        }

        if (!projectId) {
          console.log('No se encontro projectId de Expo para push notifications');
          return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('Permisos de notificacion no otorgados');
          return;
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Token de notificaciones:', token);

        if (isMounted) {
          const currentStoredToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
          await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
          if (currentStoredToken !== token) {
            await AsyncStorage.removeItem(PUSH_TOKEN_REGISTERED_KEY);
          }
          await registerTokenInBackend(token);
        }
      } catch (error) {
        console.error('Error configurando notificaciones:', error);
      }
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notificacion recibida:', notification.request.content.data);
    });

    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        tryRegisterStoredToken();
      }
    });

    refreshInterval = setInterval(() => {
      tryRegisterStoredToken();
    }, 15000);

    setupNotifications();
    tryRegisterStoredToken();

    return () => {
      isMounted = false;
      receivedSubscription.remove();
      appStateSubscription?.remove?.();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, []);
};
