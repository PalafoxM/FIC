import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

export default function PendingPaymentsScreen() {
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { approveTransaction, rejectTransaction, getUserTransactions } = useApi();
  const router = useRouter();

  useEffect(() => {
    loadPendingTransactions();
  }, []);

  const loadPendingTransactions = async () => {
    try {
      const response = await getUserTransactions('client');
      if (response.success) {
        const pending = response.data.filter(tx => tx.status === 'pending');
        setPendingTransactions(pending);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      Alert.alert('Atenci\u00f3n', 'No se pudieron cargar las transacciones');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transaction) => {
    try {
      Alert.alert(
        'Confirmar Pago',
        `Â¿Aprobar pago de $${transaction.total} a ${transaction.vendor_name}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Aprobar', 
            onPress: async () => {
              const response = await approveTransaction(transaction.transaction_id);
              if (response.success) {
                Alert.alert('Operaci\u00f3n exitosa', 'El pago ha sido procesado exitosamente');
                loadPendingTransactions(); // Recargar lista
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudo aprobar el pago');
    }
  };

  const handleReject = async (transaction) => {
    try {
      Alert.alert(
        'Rechazar Pago',
        `Â¿Rechazar pago de $${transaction.total} de ${transaction.vendor_name}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Rechazar', 
            style: 'destructive',
            onPress: async () => {
              const response = await rejectTransaction(transaction.transaction_id);
              if (response.success) {
                Alert.alert('Atenci\u00f3n', 'El pago ha sido rechazado');
                loadPendingTransactions(); // Recargar lista
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudo rechazar el pago');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Cargando transacciones...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Pagos Pendientes</Text>
      
      {pendingTransactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay pagos pendientes</Text>
        </View>
      ) : (
        pendingTransactions.map((transaction) => (
          <View key={transaction.id} style={styles.transactionCard}>
            <Text style={styles.vendorName}>{transaction.vendor_name}</Text>
            <Text style={styles.amount}>${transaction.total}</Text>
            <Text style={styles.description}>{transaction.description}</Text>
            <Text style={styles.date}>
              {new Date(transaction.created_at).toLocaleString()}
            </Text>
            
            <View style={styles.actions}>
              <TouchableOpacity 
                style={styles.approveButton}
                onPress={() => handleApprove(transaction)}
              >
                <Text style={styles.approveText}>âœ… Aprobar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.rejectButton}
                onPress={() => handleReject(transaction)}
              >
                <Text style={styles.rejectText}>âŒ Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  transactionCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vendorName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  amount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#27AE60',
    marginBottom: 5,
  },
  description: {
    color: '#666',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  approveButton: {
    backgroundColor: '#E8F5E8',
    padding: 10,
    borderRadius: 6,
    flex: 1,
    marginRight: 5,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#FFE8E8',
    padding: 10,
    borderRadius: 6,
    flex: 1,
    marginLeft: 5,
    alignItems: 'center',
  },
  approveText: {
    color: '#27AE60',
    fontWeight: '600',
  },
  rejectText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
});


