import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, AppState, DeviceEventEmitter } from 'react-native';
import { ENV } from '../constants/env';
import { ROLE_IDS } from '../constants/roles';
import { useApi } from './useApi';
import { useAuth } from './useAuth';

const POLL_INTERVAL_MS = 10000;

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

  useEffect(() => {
    if (user?.id_perfil !== ROLE_IDS.CLIENT || !user?.id_usuario) {
      return undefined;
    }

    let isMounted = true;
    let intervalId = null;

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
                  Alert.alert(
                    'Operaci\u00f3n exitosa',
                    'El pago fue aprobado. Volveras a Inicio para ver tu saldo actualizado.'
                  );
                  setTimeout(() => {
                    DeviceEventEmitter.emit('closeClientQrModal');
                    router.replace('/(tabs)/index');
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

    const showPaymentRequestAlert = (notificationData) => {
      alertOpenRef.current = true;

      const amount = Number(notificationData?.total ?? notificationData?.amount ?? 0);
      const vendorName = notificationData?.vendorName || 'Proveedor';

      Alert.alert(
        'Pago requerido',
        `Tienes una solicitud por $${amount.toFixed(2)} de ${vendorName}.`,
        [
          {
            text: 'Despues',
            style: 'cancel',
            onPress: () => {
              alertOpenRef.current = false;
            },
          },
          {
            text: 'Ver solicitud',
            onPress: () => {
              alertOpenRef.current = false;
              setTimeout(() => {
                showPaymentDecisionAlert(notificationData);
              }, 150);
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

          if (notificationData?.type !== 'PAYMENT_REQUEST' || !transactionId) {
            continue;
          }

          if (notificationId && shownNotificationIdsRef.current.has(notificationId)) {
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

            showPaymentRequestAlert(notificationData);
            break;
          } catch {
            if (notificationId) {
              shownNotificationIdsRef.current.add(notificationId);
            }
          }
        }
      } catch (error) {
        console.error('Error polling payment request alerts:', error);
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPendingPaymentRequests();
      }
    });

    checkPendingPaymentRequests();
    intervalId = setInterval(checkPendingPaymentRequests, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      appStateSubscription?.remove?.();
      if (intervalId) {
        clearInterval(intervalId);
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

