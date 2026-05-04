import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, AppState, DeviceEventEmitter } from 'react-native';
import { ENV } from '../constants/env';
import { ROLE_IDS } from '../constants/roles';
import { useApi } from './useApi';
import { useAuth } from './useAuth';

const POLL_INTERVAL_MS = 10000;
const POLL_RETRY_INTERVAL_MS = 30000;
const POLL_MAX_RETRY_INTERVAL_MS = 120000;

const parseNotificationData = (notification) => {
  if (!notification) {
    return {};
  }

  if (typeof notification.data === 'string') {
    try {
      return JSON.parse(notification.data);
    } catch {
      return {};
    }
  }

  return notification.data || {};
};

export const usePaymentRequestAlerts = () => {
  const { user } = useAuth();
  const { approvePaymentRequest, getTransactionStatus, rejectPaymentRequest } = useApi();
  const router = useRouter();
  const shownNotificationIdsRef = useRef(new Set());
  const alertOpenRef = useRef(false);
  const pollTimeoutRef = useRef(null);
  const pollingBackoffMsRef = useRef(POLL_INTERVAL_MS);
  const networkErrorLoggedRef = useRef(false);

  useEffect(() => {
    const numericPerfil = Number(user?.id_perfil ?? 0);
    const isClient = numericPerfil === ROLE_IDS.CLIENT;
    const isManager = numericPerfil === ROLE_IDS.MANAGER;
    const isCashier = numericPerfil === ROLE_IDS.CASHIER;

    if ((!isClient && !isManager && !isCashier) || !user?.id_usuario) {
      return undefined;
    }

    let isMounted = true;

    const showPaymentDecisionAlert = (notificationData) => {
      const amount = Number(notificationData?.total ?? notificationData?.amount ?? 0);
      const vendorName = notificationData?.vendorName || 'Proveedor';

      alertOpenRef.current = true;

      Alert.alert(
        'Solicitud de pago',
        `Monto: $${amount.toFixed(2)}\nDe: ${vendorName}`,
        [
          {
            text: 'Aprobar',
            onPress: async () => {
              alertOpenRef.current = false;
              try {
                const response = await approvePaymentRequest(notificationData.transactionId);
                if (response?.success) {
                  DeviceEventEmitter.emit('refreshClientBalanceNow');
                  Alert.alert(
                    'Operaci\u00f3n exitosa',
                    'El pago fue aprobado. Volveras a Inicio para ver tu saldo actualizado.'
                  );
                  setTimeout(() => {
                    DeviceEventEmitter.emit('closeClientQrModal');
                    router.replace('/(tabs)');
                  }, 1200);
                  return;
                }

                Alert.alert('Atenci\u00f3n', response?.respuesta || 'No se pudo aprobar el pago.');
              } catch (error) {
                Alert.alert('Atenci\u00f3n', error.message || 'No se pudo aprobar el pago.');
              }
            },
          },
          {
            text: 'Rechazar',
            style: 'destructive',
            onPress: async () => {
              alertOpenRef.current = false;
              try {
                const response = await rejectPaymentRequest(notificationData.transactionId);
                if (response?.success) {
                  Alert.alert('Atenci\u00f3n', 'La solicitud fue rechazada.');
                  return;
                }

                Alert.alert('Atenci\u00f3n', response?.respuesta || 'No se pudo rechazar el pago.');
              } catch (error) {
                Alert.alert('Atenci\u00f3n', error.message || 'No se pudo rechazar el pago.');
              }
            },
          },
        ],
        {
          cancelable: false,
          onDismiss: () => {
            alertOpenRef.current = false;
          },
        }
      );
    };

    const showManagerNotificationAlert = (notification) => {
      const notificationData = parseNotificationData(notification);
      const title = notification?.title || 'Notificacion';
      const body =
        notification?.body ||
        notificationData?.body ||
        notificationData?.message ||
        'Tienes una nueva notificacion operativa.';

      alertOpenRef.current = true;

      Alert.alert(
        title,
        body,
        [
          {
            text: 'Despues',
            style: 'cancel',
            onPress: () => {
              alertOpenRef.current = false;
            },
          },
          {
            text: 'Ver notificaciones',
            onPress: () => {
              alertOpenRef.current = false;
              router.push('/alerts');
            },
          },
        ],
        {
          cancelable: false,
          onDismiss: () => {
            alertOpenRef.current = false;
          },
        }
      );
    };

    const checkPendingPaymentRequests = async () => {
      if (!isMounted || alertOpenRef.current) {
        return;
      }

      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          return;
        }

        const response = await fetch(`${ENV.apiBaseUrl}/notifications/my-notifications`, {
          headers: {
            ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
            Authorization: `Bearer ${token}`,
          },
        });

        const rawResponse = await response.text();
        const data = rawResponse ? JSON.parse(rawResponse) : null;

        if (!response.ok || !data?.success) {
          networkErrorLoggedRef.current = false;
          pollingBackoffMsRef.current = POLL_INTERVAL_MS;
          return;
        }

        const rows = Array.isArray(data?.data) ? data.data : [];
        const sortedRows = [...rows].sort((left, right) => {
          const leftDate = new Date(left?.created_at ?? 0).getTime();
          const rightDate = new Date(right?.created_at ?? 0).getTime();
          return rightDate - leftDate;
        });

        for (const notification of sortedRows) {
          const notificationId = String(notification?.id ?? '');
          const notificationData = parseNotificationData(notification);
          const transactionId = notificationData?.transactionId;

          if (notificationId && shownNotificationIdsRef.current.has(notificationId)) {
            continue;
          }

          if (isManager || isCashier) {
            if (notificationId) {
              shownNotificationIdsRef.current.add(notificationId);
            }
            showManagerNotificationAlert(notification);
            break;
          }

          if (notificationData?.type !== 'PAYMENT_REQUEST' || !transactionId) {
            continue;
          }

          try {
            const statusResponse = await getTransactionStatus(transactionId);
            const resolvedStatus = statusResponse?.data?.status ?? 'pending';

            if (notificationId) {
              shownNotificationIdsRef.current.add(notificationId);
            }

            if (resolvedStatus !== 'pending') {
              continue;
            }

            showPaymentDecisionAlert(notificationData);
            break;
          } catch {
            if (notificationId) {
              shownNotificationIdsRef.current.add(notificationId);
            }
          }
        }
        networkErrorLoggedRef.current = false;
        pollingBackoffMsRef.current = POLL_INTERVAL_MS;
      } catch (error) {
        const normalizedMessage = String(error?.message || '').toLowerCase();
        const isNetworkError = normalizedMessage.includes('network request failed');

        if (!isNetworkError || !networkErrorLoggedRef.current) {
          console.error('Error polling payment request alerts:', error);
        }

        if (isNetworkError) {
          networkErrorLoggedRef.current = true;
          pollingBackoffMsRef.current = Math.min(
            Math.max(pollingBackoffMsRef.current, POLL_RETRY_INTERVAL_MS) * 2,
            POLL_MAX_RETRY_INTERVAL_MS
          );
        } else {
          networkErrorLoggedRef.current = false;
          pollingBackoffMsRef.current = POLL_INTERVAL_MS;
        }
      } finally {
        if (isMounted) {
          pollTimeoutRef.current = setTimeout(
            checkPendingPaymentRequests,
            pollingBackoffMsRef.current
          );
        }
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
        checkPendingPaymentRequests();
      }
    });

    checkPendingPaymentRequests();

    return () => {
      isMounted = false;
      appStateSubscription?.remove?.();
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      alertOpenRef.current = false;
    };
  }, [
    approvePaymentRequest,
    getTransactionStatus,
    rejectPaymentRequest,
    router,
    user?.id_perfil,
    user?.id_usuario,
  ]);
};

