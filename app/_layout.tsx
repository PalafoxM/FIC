import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { usePaymentRequestAlerts } from '../hooks/usePaymentRequestAlerts';
import { usePushNotifications } from '../hooks/usePushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function RootLayoutContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  usePushNotifications();
  usePaymentRequestAlerts();

  useEffect(() => {
    if (loading) return;

    const inLoginScreen = segments[0] === 'login';

    if (!user && !inLoginScreen) {
      router.replace('/login');
      return;
    }

    if (user && inLoginScreen) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notificacion tocada:', data);

      if (data.type === 'PAYMENT_REQUEST') {
        router.push('/alerts');
      } else if (data.type === 'PAYMENT_APPROVED') {
        router.push('/(tabs)');
      }
    });

    return () => subscription.remove();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="(modals)/scanner"
        options={{
          title: 'Escanear QR',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="enter-amount"
        options={{
          title: 'Ingresar Monto',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="payment-confirmation"
        options={{
          title: 'Confirmacion de Pago',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: 'Notificaciones',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}

