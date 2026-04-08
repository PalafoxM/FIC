import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ENV } from '../../constants/env';
import { useAuth } from '../../hooks/useAuth';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${ENV.apiBaseUrl}/notifications/my-notifications`, {
        headers: {
          ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.data);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NUEVO: Función para aprobar pago
  const approvePayment = async (transactionId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      console.log('✅ Aprobando pago:', transactionId);
      
      const response = await fetch(`${ENV.apiBaseUrl}/transactions/approve`, {
        method: 'POST',
        headers: {
          ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transactionId,
          status: 'approved'
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        Alert.alert('✅ Pago Aprobado', 'El pago ha sido aprobado exitosamente');
        
        // Recargar notificaciones para actualizar la lista
        loadNotifications();
        
        // Aquí podrías navegar a una pantalla de confirmación si lo deseas
        // router.push('/payment-success');
      } else {
        Alert.alert('Error', data.message || 'No se pudo aprobar el pago');
      }
    } catch (error) {
      console.error('Error aprobando pago:', error);
      Alert.alert('Error', 'No se pudo completar la aprobación');
    }
  };

  // ✅ NUEVO: Función para rechazar pago
  const rejectPayment = async (transactionId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      console.log('❌ Rechazando pago:', transactionId);
      
      const response = await fetch(`${ENV.apiBaseUrl}/transactions/reject`, {
        method: 'POST',
        headers: {
          ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transactionId,
          status: 'rejected'
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        Alert.alert('❌ Pago Rechazado', 'El pago ha sido rechazado');
        
        // Recargar notificaciones para actualizar la lista
        loadNotifications();
      } else {
        Alert.alert('Error', data.message || 'No se pudo rechazar el pago');
      }
    } catch (error) {
      console.error('Error rechazando pago:', error);
      Alert.alert('Error', 'No se pudo completar el rechazo');
    }
  };

  const handleNotificationPress = async (notification) => {
    try {
      // Parsear el data si viene como string
      const notificationData = typeof notification.data === 'string' 
        ? JSON.parse(notification.data) 
        : notification.data;

      console.log('Datos parseados:', notificationData);
      console.log('Tipo:', notificationData?.type);

      if (notificationData?.type === 'PAYMENT_REQUEST') {
        Alert.alert(
          'Solicitud de Pago',
          `Monto: $${notificationData.amount}\nDe: ${notificationData.vendorName}`,
          [
            {
              text: 'Aprobar',
              onPress: () => approvePayment(notificationData.transactionId)
            },
            {
              text: 'Rechazar',
              style: 'destructive',
              onPress: () => rejectPayment(notificationData.transactionId)
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error procesando notificación:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Notificaciones</Text>
      
      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay notificaciones pendientes</Text>
        </View>
      ) : (
        notifications.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            style={styles.notificationCard}
            onPress={() => handleNotificationPress(notification)}
          >
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            <Text style={styles.notificationBody}>{notification.body}</Text>
            <Text style={styles.notificationDate}>
              {new Date(notification.created_at).toLocaleString()}
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
