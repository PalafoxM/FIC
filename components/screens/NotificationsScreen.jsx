import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ENV } from '../../constants/env';
import { hasPermission } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import AccessDenied from '../AccessDenied';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { approvePaymentRequest, rejectPaymentRequest } = useApi();

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
        setNotifications(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const notificationData =
        typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;

      if (notificationData?.type === 'PAYMENT_REQUEST') {
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

  return (
    <ScrollView style={styles.container}>
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
        notifications.map((notification, index) => (
          <TouchableOpacity
            key={notification.id ?? `notification-${index}`}
            style={styles.notificationCard}
            onPress={() => handleNotificationPress(notification)}
          >
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            <Text style={styles.notificationBody}>{notification.body}</Text>
            <Text style={styles.notificationDate}>
              {notification.created_at
                ? new Date(notification.created_at).toLocaleString()
                : 'Sin fecha'}
            </Text>
          </TouchableOpacity>
        ))
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
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
});
