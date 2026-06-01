import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, Text, View } from 'react-native';
import { isConsumerProfile } from '../constants/roles';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { usePaymentRequestAlerts } from '../hooks/usePaymentRequestAlerts';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  PENDING_LOGGED_OUT_NOTIFICATION_KEY,
  isLoggedOutBlockedOperationalNotification,
  isLoggedOutPaymentNotification,
  isQrOperationalNotification,
} from '../utils/pushSessionPolicy';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_TIMEOUT_EXEMPT_ROUTES = new Set([
  'scanner',
  'enter-amount',
  'payment-confirmation',
  'cashier-process',
]);
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const getNotificationUserId = (data: Record<string, unknown> = {}) => {
  const rawUserId =
    data?.id_usuario ??
    data?.userId ??
    data?.user_id ??
    data?.clientId ??
    data?.client_id ??
    null;
  const normalizedUserId = String(rawUserId ?? '').trim();
  return normalizedUserId || null;
};

function RootLayoutContent() {
  const { user, loading, logout } = useAuth() as any;
  const router = useRouter();
  const segments = useSegments();
  const numericPerfil = Number(user?.id_perfil ?? 0);
  const shouldRouteToProfileOnBalanceView = numericPerfil === 1 || numericPerfil === 4;
  const isConsumer = isConsumerProfile(numericPerfil);
  const isIdleTimeoutExemptRoute = useMemo(
    () => segments.some((segment) => IDLE_TIMEOUT_EXEMPT_ROUTES.has(segment)),
    [segments],
  );
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundAtRef = useRef<number | null>(null);
  const sessionExpiringRef = useRef(false);

  usePushNotifications();
  usePaymentRequestAlerts();

  const persistLoggedOutPaymentNotification = useCallback(async (data: Record<string, unknown> = {}) => {
    try {
      await AsyncStorage.setItem(
        PENDING_LOGGED_OUT_NOTIFICATION_KEY,
        JSON.stringify({
          type: 'LOGGED_OUT_PAYMENT',
          payload: data,
          targetUserId: getNotificationUserId(data),
          createdAt: Date.now(),
        }),
      );
    } catch (error) {
      console.error('Error persisting logged out payment notification:', error);
    }
  }, []);

  const expireSession = useCallback(async () => {
    if (!user?.id_usuario || sessionExpiringRef.current) {
      return;
    }

    sessionExpiringRef.current = true;
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }

    try {
      await logout();
      Alert.alert(
        'Sesion finalizada',
        'Tu sesion se cerro despues de 10 minutos de inactividad.',
      );
    } catch (error) {
      console.error('Error expiring idle session:', error);
    } finally {
      sessionExpiringRef.current = false;
    }
  }, [logout, user?.id_usuario]);

  const resetInactivityTimer = useCallback(() => {
    if (
      !user?.id_usuario ||
      loading ||
      sessionExpiringRef.current ||
      isIdleTimeoutExemptRoute
    ) {
      return;
    }

    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      expireSession();
    }, IDLE_TIMEOUT_MS);
  }, [expireSession, isIdleTimeoutExemptRoute, loading, user?.id_usuario]);

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
    if (!user?.id_usuario) {
      return;
    }

    const consumePendingLoggedOutNotification = async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_LOGGED_OUT_NOTIFICATION_KEY);
        if (!raw) {
          return;
        }

        await AsyncStorage.removeItem(PENDING_LOGGED_OUT_NOTIFICATION_KEY);
        const pendingNotification = JSON.parse(raw);

        const pendingTargetUserId = String(pendingNotification?.targetUserId ?? '').trim();
        const currentUserId = String(user?.id_usuario ?? '').trim();

        if (
          pendingTargetUserId &&
          currentUserId &&
          pendingTargetUserId !== currentUserId
        ) {
          return;
        }

        if (isLoggedOutPaymentNotification(pendingNotification?.payload)) {
          DeviceEventEmitter.emit('refreshClientBalanceNow');
          DeviceEventEmitter.emit('closeClientQrModal');
          router.push(shouldRouteToProfileOnBalanceView && !isConsumer ? '/profile' : '/(tabs)');
        }
      } catch (error) {
        console.error('Error consuming pending logged out notification:', error);
      }
    };

    consumePendingLoggedOutNotification();
  }, [isConsumer, router, shouldRouteToProfileOnBalanceView, user?.id_usuario]);

  useEffect(() => {
    if (!user?.id_usuario) {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      backgroundAtRef.current = null;
      return;
    }

    if (isIdleTimeoutExemptRoute) {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      backgroundAtRef.current = null;
      return;
    }

    resetInactivityTimer();

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    };
  }, [isIdleTimeoutExemptRoute, resetInactivityTimer, user?.id_usuario]);

  useEffect(() => {
    if (!user?.id_usuario) {
      return;
    }

    resetInactivityTimer();
  }, [resetInactivityTimer, segments, user?.id_usuario]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!user?.id_usuario) {
        return;
      }

      if (isIdleTimeoutExemptRoute) {
        backgroundAtRef.current = null;
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
          inactivityTimeoutRef.current = null;
        }
        return;
      }

      if (nextState === 'active') {
        const inactiveFor =
          backgroundAtRef.current !== null
            ? Date.now() - backgroundAtRef.current
            : 0;
        backgroundAtRef.current = null;

        if (inactiveFor >= IDLE_TIMEOUT_MS) {
          expireSession();
          return;
        }

        resetInactivityTimer();
        return;
      }

      if (nextState === 'inactive' || nextState === 'background') {
        backgroundAtRef.current = Date.now();
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
          inactivityTimeoutRef.current = null;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [expireSession, isIdleTimeoutExemptRoute, resetInactivityTimer, user?.id_usuario]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;

      if (!user?.id_usuario) {
        return;
      }

      if (isQrOperationalNotification(data) || isLoggedOutPaymentNotification(data)) {
        DeviceEventEmitter.emit('refreshClientQrActivationState');
        DeviceEventEmitter.emit('refreshClientBalanceNow');
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notificacion tocada:', data);

      if (!user?.id_usuario) {
        if (isLoggedOutPaymentNotification(data)) {
          persistLoggedOutPaymentNotification(data);
          router.replace('/login');
          return;
        }

        if (isLoggedOutBlockedOperationalNotification(data)) {
          router.replace('/login');
          return;
        }

        router.replace('/login');
        return;
      }

      if (data.type === 'PAYMENT_REQUEST') {
        router.push('/alerts');
      } else if (isLoggedOutPaymentNotification(data)) {
        DeviceEventEmitter.emit('refreshClientBalanceNow');
        DeviceEventEmitter.emit('closeClientQrModal');
        router.push(shouldRouteToProfileOnBalanceView && !isConsumer ? '/profile' : '/(tabs)');
      } else if (isQrOperationalNotification(data)) {
        DeviceEventEmitter.emit('refreshClientQrActivationState');
        DeviceEventEmitter.emit('refreshClientBalanceNow');
        router.push('/(tabs)');
      }
    });

    return () => {
      receivedSubscription.remove();
      subscription.remove();
    };
  }, [isConsumer, persistLoggedOutPaymentNotification, router, shouldRouteToProfileOnBalanceView, user?.id_usuario]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#263B80" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onTouchStart={resetInactivityTimer}>
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
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}

