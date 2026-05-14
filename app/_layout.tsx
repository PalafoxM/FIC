import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { usePaymentRequestAlerts } from '../hooks/usePaymentRequestAlerts';
import { usePushNotifications } from '../hooks/usePushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const isPaymentApprovedLike = (data = {}) => {
  const normalizedType = String(data?.type ?? '').trim().toUpperCase();
  const normalizedStatus = String(data?.status ?? data?.paymentStatus ?? '').trim().toUpperCase();

  return (
    normalizedType === 'PAYMENT_APPROVED' ||
    ['PAYMENT_SUCCESS', 'PAYMENT_COMPLETED', 'NIP_PAYMENT_APPROVED', 'PAYMENT_CAPTURED', 'PAYMENT_APPLIED'].includes(
      normalizedType
    ) ||
    normalizedStatus === 'APPROVED'
  );
};

function RootLayoutContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const numericPerfil = Number(user?.id_perfil ?? 0);
  const shouldRouteToProfileOnBalanceView = numericPerfil === 1 || numericPerfil === 4;

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
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;

      if (data?.type === 'QR_READY' || data?.type === 'QR_ACTIVATION_REJECTED' || isPaymentApprovedLike(data)) {
        DeviceEventEmitter.emit('refreshClientQrActivationState');
        DeviceEventEmitter.emit('refreshClientBalanceNow');
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notificacion tocada:', data);

      if (data.type === 'PAYMENT_REQUEST') {
        router.push('/alerts');
      } else if (isPaymentApprovedLike(data)) {
        DeviceEventEmitter.emit('refreshClientBalanceNow');
        DeviceEventEmitter.emit('closeClientQrModal');
        router.push(shouldRouteToProfileOnBalanceView ? '/profile' : '/(tabs)');
      } else if (data.type === 'QR_READY' || data.type === 'QR_ACTIVATION_REJECTED') {
        DeviceEventEmitter.emit('refreshClientQrActivationState');
        DeviceEventEmitter.emit('refreshClientBalanceNow');
        router.push('/(tabs)');
      }
    });

    return () => {
      receivedSubscription.remove();
      subscription.remove();
    };
  }, [router, shouldRouteToProfileOnBalanceView]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#263B80" />
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
        name="hotel-operation"
        options={{
          title: 'Operacion hotelera',
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
        name="cashier-process"
        options={{
          title: 'Entrega de QR',
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
      <Stack.Screen
        name="(modals)/historyStore"
        options={{
          title: 'Historial de ventas',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="(modals)/historyPay"
        options={{
          title: 'Historial de consumo',
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

