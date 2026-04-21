import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ENV } from '../../constants/env';
import { hasPermission } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import AccessDenied from '../AccessDenied';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const { user } = useAuth();
  const { approvePaymentRequest, rejectPaymentRequest, getTransactionStatus } = useApi();
  const transactionStatusRef = useRef(getTransactionStatus);

  useEffect(() => {
    transactionStatusRef.current = getTransactionStatus;
  }, [getTransactionStatus]);

  const parseNotificationData = useCallback((notification) => {
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
  }, []);

  const enrichNotificationStatus = useCallback(async (notification) => {
    const notificationData = parseNotificationData(notification);
    const transactionId = notificationData?.transactionId;

    if (notificationData?.type !== 'PAYMENT_REQUEST' || !transactionId) {
      return {
        ...notification,
        parsedData: notificationData,
        resolvedStatus: 'pending',
      };
    }

    try {
      const statusResponse = await transactionStatusRef.current(transactionId);
      const resolvedStatus = statusResponse?.data?.status ?? 'pending';
      const totalAmount = Number(notificationData.total ?? notificationData.amount ?? 0);

      if (resolvedStatus === 'approved') {
        return {
          ...notification,
          parsedData: notificationData,
          resolvedStatus,
          title: 'Pago finalizado',
          body: `Pago completado por $${totalAmount.toFixed(2)}`,
        };
      }

      if (resolvedStatus === 'rejected') {
        return {
          ...notification,
          parsedData: notificationData,
          resolvedStatus,
          title: 'Pago rechazado',
          body: `Pago rechazado por $${totalAmount.toFixed(2)}`,
        };
      }

      return {
        ...notification,
        parsedData: notificationData,
        resolvedStatus,
      };
    } catch {
      return {
        ...notification,
        parsedData: notificationData,
        resolvedStatus: 'pending',
      };
    }
  }, [parseNotificationData]);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${ENV.apiBaseUrl}/notifications/my-notifications`, {
        headers: {
          ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      const rawResponse = await response.text();
      const data = rawResponse ? JSON.parse(rawResponse) : null;

      if (data?.success) {
        const rows = Array.isArray(data.data) ? data.data : [];
        const sortedRows = [...rows].sort((left, right) => {
          const leftDate = new Date(left?.created_at ?? 0).getTime();
          const rightDate = new Date(right?.created_at ?? 0).getTime();
          return rightDate - leftDate;
        });
        const enrichedRows = await Promise.all(sortedRows.map(enrichNotificationStatus));
        setVisibleCount(10);
        setNotifications(enrichedRows);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [enrichNotificationStatus]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      loadNotifications();
    });

    return () => subscription.remove();
  }, [loadNotifications]);

  if (!hasPermission(user?.id_perfil, 'notifications')) {
    return (
      <AccessDenied
        title="Notificaciones restringidas"
        message="Tu perfil no tiene acceso a las notificaciones operativas."
      />
    );
  }

  const approvePayment = async (transactionId) => {
    try {
      const data = await approvePaymentRequest(transactionId);

      if (data?.success) {
        Alert.alert('Pago aprobado', 'El pago ha sido aprobado exitosamente');
        loadNotifications();
        return;
      }

      Alert.alert('Error', data?.respuesta || 'No se pudo aprobar el pago');
    } catch (error) {
      console.error('Error aprobando pago:', error);
      Alert.alert('Error', error.message || 'No se pudo completar la aprobacion');
    }
  };

  const rejectPayment = async (transactionId) => {
    try {
      const data = await rejectPaymentRequest(transactionId);

      if (data?.success) {
        Alert.alert('Pago rechazado', 'El pago ha sido rechazado');
        loadNotifications();
        return;
      }

      Alert.alert('Error', data?.respuesta || 'No se pudo rechazar el pago');
    } catch (error) {
      console.error('Error rechazando pago:', error);
      Alert.alert('Error', error.message || 'No se pudo completar el rechazo');
    }
  };

  const handleNotificationPress = async (notification) => {
    try {
      const notificationData = notification.parsedData ?? parseNotificationData(notification);

      if (notificationData?.type === 'PAYMENT_REQUEST') {
        if (notification.resolvedStatus === 'approved') {
          Alert.alert(
            'Pago finalizado',
            `Tu pago por $${notificationData.total ?? notificationData.amount} ya fue completado.`
          );
          return;
        }

        if (notification.resolvedStatus === 'rejected') {
          Alert.alert(
            'Pago rechazado',
            `La solicitud por $${notificationData.total ?? notificationData.amount} ya fue rechazada.`
          );
          return;
        }

        Alert.alert(
          'Solicitud de pago',
          `Monto: $${notificationData.total ?? notificationData.amount}\nDe: ${notificationData.vendorName}`,
          [
            {
              text: 'Aprobar',
              onPress: () => approvePayment(notificationData.transactionId),
            },
            {
              text: 'Rechazar',
              style: 'destructive',
              onPress: () => rejectPayment(notificationData.transactionId),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error procesando notificacion:', error);
    }
  };

  const visibleNotifications = notifications.slice(0, visibleCount);
  const canShowMore = notifications.length > visibleCount;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={loadNotifications}
          colors={['#4A0B17']}
          tintColor="#4A0B17"
        />
      }
    >
      <Text style={styles.title}>Notificaciones</Text>

      <TouchableOpacity style={styles.refreshButton} onPress={loadNotifications}>
        <Text style={styles.refreshButtonText}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </Text>
      </TouchableOpacity>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay notificaciones pendientes</Text>
        </View>
      ) : (
        <>
          {visibleNotifications.map((notification, index) => (
            <TouchableOpacity
              key={notification.id ?? `notification-${index}`}
              style={styles.notificationCard}
              onPress={() => handleNotificationPress(notification)}
            >
              {notification.resolvedStatus === 'pending' ? (
                <View style={styles.pendingDot} />
              ) : null}
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.notificationBody}>{notification.body}</Text>
              <Text style={styles.notificationDate}>
                {notification.created_at
                  ? new Date(notification.created_at).toLocaleString()
                  : 'Sin fecha'}
              </Text>
            </TouchableOpacity>
          ))}

          {canShowMore ? (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => setVisibleCount((current) => current + 10)}
            >
              <Text style={styles.loadMoreButtonText}>Ver mas</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  refreshButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#E8F1FB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  refreshButtonText: {
    color: '#1C5D99',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  notificationCard: {
    backgroundColor: 'white',
    padding: 15,
    paddingLeft: 22,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  pendingDot: {
    position: 'absolute',
    left: 10,
    top: 20,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D62828',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  notificationBody: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  notificationDate: {
    fontSize: 12,
    color: '#999',
  },
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: '#E8F1FB',
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 24,
    paddingVertical: 12,
  },
  loadMoreButtonText: {
    color: '#1C5D99',
    fontSize: 15,
    fontWeight: '600',
  },
});
