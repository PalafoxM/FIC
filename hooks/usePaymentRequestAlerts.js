import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, AppState, DeviceEventEmitter } from 'react-native';
import { ENV } from '../constants/env';
import { isConsumerProfile, ROLE_IDS } from '../constants/roles';
import { useApi } from './useApi';
import { useAuth } from './useAuth';

const POLL_INTERVAL_MS = 10000;
const POLL_RETRY_INTERVAL_MS = 30000;
const POLL_MAX_RETRY_INTERVAL_MS = 120000;
const MAX_PERSISTED_NOTIFICATION_IDS = 100;

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

const isPaymentApprovedLike = (notification, notificationData = parseNotificationData(notification)) => {
  const normalizedType = String(notificationData?.type ?? notification?.type ?? '').trim().toUpperCase();
  const normalizedStatus = String(
    notificationData?.status ??
    notificationData?.paymentStatus ??
    notificationData?.resolvedStatus ??
    ''
  ).trim().toUpperCase();
  const title = String(notification?.title ?? '').trim().toLowerCase();
  const body = String(notification?.body ?? notificationData?.body ?? notificationData?.message ?? '').trim().toLowerCase();

  if (normalizedType === 'PAYMENT_APPROVED') {
    return true;
  }

  if (
    ['PAYMENT_SUCCESS', 'PAYMENT_COMPLETED', 'NIP_PAYMENT_APPROVED', 'PAYMENT_CAPTURED', 'PAYMENT_APPLIED'].includes(
      normalizedType
    )
  ) {
    return true;
  }

  if (normalizedStatus === 'APPROVED') {
    return true;
  }

  return (
    (title.includes('pago') || title.includes('cobro') || body.includes('pago') || body.includes('cobro')) &&
    (title.includes('aprob') || title.includes('complet') || title.includes('aplicad') || body.includes('aprob') || body.includes('complet') || body.includes('aplicad'))
  );
};

const buildNotificationIdentity = (notification, currentUserId = null) => {
  const notificationData = parseNotificationData(notification);
  const normalizedType = String(notificationData?.type ?? notification?.type ?? '').trim().toUpperCase();
  const normalizedUserId = String(
    currentUserId ??
    notificationData?.id_usuario ??
    notification?.user_id ??
    ''
  ).trim();

  if (normalizedType === 'QR_READY') {
    const folio = String(notificationData?.folio ?? notificationData?.folio_entrega ?? '').trim();
    return `passive:${normalizedType}:${normalizedUserId}:${folio || 'self'}`;
  }

  if (normalizedType === 'QR_ACTIVATION_REJECTED') {
    const folio = String(notificationData?.folio ?? notificationData?.folio_entrega ?? '').trim();
    const motivo = String(
      notificationData?.motivo_rechazo ??
      notificationData?.motivo ??
      notification?.body ??
      ''
    ).trim();
    return `passive:${normalizedType}:${normalizedUserId}:${folio || 'self'}:${motivo || 'no-reason'}`;
  }

  if (isPaymentApprovedLike(notification, notificationData)) {
    const transactionId = String(
      notificationData?.transactionId ??
      notificationData?.transaction_id ??
      ''
    ).trim();
    const amount = String(notificationData?.total ?? notificationData?.amount ?? '').trim();
    return `passive:${normalizedType}:${normalizedUserId}:${transactionId || 'no-transaction'}:${amount || 'no-amount'}`;
  }

  const explicitId =
    notification?.id ??
    notification?.id_notificacion ??
    notification?.notification_id ??
    notificationData?.notificationId ??
    notificationData?.id ??
    null;

  if (explicitId !== null && explicitId !== undefined && String(explicitId).trim() !== '') {
    return `id:${String(explicitId).trim()}`;
  }

  const fingerprint = [
    notificationData?.type ?? notification?.type ?? 'notification',
    notificationData?.transactionId ?? '',
    notificationData?.id_usuario ?? notification?.user_id ?? '',
    notification?.title ?? '',
    notification?.body ?? '',
    notification?.created_at ?? notificationData?.created_at ?? '',
  ]
    .map((value) => String(value ?? '').trim())
    .join('|');

  return `fp:${fingerprint}`;
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
    const isClient = isConsumerProfile(numericPerfil);
    const isAdmin = numericPerfil === ROLE_IDS.ADMIN;
    const isManager = numericPerfil === ROLE_IDS.MANAGER;
    const usesPaymentDecisionAlert = isClient || isAdmin || isManager;
    const navigateToAvailableBalance = () => {
      DeviceEventEmitter.emit('closeClientQrModal');
      DeviceEventEmitter.emit('refreshClientBalanceNow');
      router.replace(usesPaymentDecisionAlert && !isClient ? '/profile' : '/(tabs)');
    };
    const persistedNotificationIdsKey = `seenPassiveNotificationIds:${user?.id_usuario ?? 'anonymous'}`;

    if (!usesPaymentDecisionAlert || !user?.id_usuario) {
      return undefined;
    }

    let isMounted = true;

    const persistShownNotificationIds = async () => {
      try {
        const persistedIds = Array.from(shownNotificationIdsRef.current).slice(-MAX_PERSISTED_NOTIFICATION_IDS);
        await AsyncStorage.setItem(persistedNotificationIdsKey, JSON.stringify(persistedIds));
      } catch (error) {
        console.error('Error persisting shown notification ids:', error);
      }
    };

    const markNotificationAsShown = async (notificationIdentity, persist = false) => {
      if (!notificationIdentity) {
        return;
      }

      shownNotificationIdsRef.current.add(notificationIdentity);
      if (persist) {
        await persistShownNotificationIds();
      }
    };

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
                    usesPaymentDecisionAlert
                      ? 'El pago fue aprobado. Te llevaremos al perfil para revisar tu monto disponible.'
                      : 'El pago fue aprobado. Volveras a Inicio para ver tu saldo actualizado.'
                  );
                  setTimeout(() => {
                    DeviceEventEmitter.emit('closeClientQrModal');
                    router.replace(usesPaymentDecisionAlert ? '/profile' : '/(tabs)');
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

    const showPaymentApprovedAlert = (notification) => {
      const notificationData = parseNotificationData(notification);
      const amount = Number(notificationData?.total ?? notificationData?.amount ?? 0);
      const title = notification?.title || 'Pago aplicado';
      const body =
        notification?.body ||
        notificationData?.body ||
        notificationData?.message ||
        (amount > 0
          ? `Se aplico un cobro por $${amount.toFixed(2)}. Tu saldo disponible ya fue actualizado.`
          : 'Se aplico un cobro correctamente. Tu saldo disponible ya fue actualizado.');

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
            text: 'Ver saldo',
            onPress: () => {
              alertOpenRef.current = false;
              navigateToAvailableBalance();
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

        const notificationsUrl = `${ENV.apiBaseUrl}/notifications/my-notifications`;
        const response = await fetch(notificationsUrl, {
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
          const notificationIdentity = buildNotificationIdentity(notification, user?.id_usuario);
          const notificationData = parseNotificationData(notification);
          const transactionId = notificationData?.transactionId;

          if (notificationIdentity && shownNotificationIdsRef.current.has(notificationIdentity)) {
            continue;
          }

          if (notificationData?.type !== 'PAYMENT_REQUEST' || !transactionId) {
            if (usesPaymentDecisionAlert && isPaymentApprovedLike(notification, notificationData)) {
              await markNotificationAsShown(notificationIdentity, true);
              showPaymentApprovedAlert(notification);
              break;
            }

            if (usesPaymentDecisionAlert && (notificationData?.type === 'QR_READY' || notificationData?.type === 'QR_ACTIVATION_REJECTED')) {
              await markNotificationAsShown(notificationIdentity, true);
              showManagerNotificationAlert(notification);
              break;
            }
            continue;
          }

          try {
            const statusResponse = await getTransactionStatus(transactionId);
            const resolvedStatus = statusResponse?.data?.status ?? 'pending';

            await markNotificationAsShown(notificationIdentity, false);

            if (resolvedStatus !== 'pending') {
              continue;
            }

            showPaymentDecisionAlert(notificationData);
            break;
          } catch {
            await markNotificationAsShown(notificationIdentity, false);
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

    const initializePolling = async () => {
      try {
        const persistedIdsRaw = await AsyncStorage.getItem(persistedNotificationIdsKey);
        const persistedIds = persistedIdsRaw ? JSON.parse(persistedIdsRaw) : [];
        shownNotificationIdsRef.current = new Set(Array.isArray(persistedIds) ? persistedIds : []);
      } catch (error) {
        shownNotificationIdsRef.current = new Set();
      }

      await checkPendingPaymentRequests();
    };

    initializePolling();

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

