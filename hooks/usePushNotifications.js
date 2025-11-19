import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const usePushNotifications = () => {
  useEffect(() => {
    let isMounted = true;

    const setupNotifications = async () => {
      try {
        // Solicitar permisos
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('Permisos de notificación no otorgados');
          return;
        }

        // Obtener token
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        console.log('🔔 Token de notificaciones:', token);

        if (isMounted) {
          // Guardar token en AsyncStorage y backend
          await AsyncStorage.setItem('pushToken', token);
          await registerTokenInBackend(token);
        }
      } catch (error) {
        console.error('Error configurando notificaciones:', error);
      }
    };

    setupNotifications();

    return () => {
      isMounted = false;
    };
  }, []);
};

const registerTokenInBackend = async (pushToken) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;

    await fetch('http://172.16.2.118:4000/api/auth/register-token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: pushToken }),
    });
    
    console.log('✅ Token registrado en backend');
  } catch (error) {
    console.error('Error registrando token en backend:', error);
  }
};