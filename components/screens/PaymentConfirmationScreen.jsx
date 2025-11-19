import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';

export default function PaymentConfirmationScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const paymentData = params.paymentData ? JSON.parse(params.paymentData) : null;

  const handleNewPayment = () => {
    router.push('/scanner');
  };

  const handleGoHome = () => {
    router.push('/');
  };

  if (!paymentData) {
    return (
      <View style={styles.container}>
        <Text>Error: No hay datos de pago</Text>
      </View>
    );
  }
  console.log(paymentData);
  return (
    <ScrollView style={styles.container}>
      <View style={styles.successIcon}>
        <Text style={styles.successIconText}>✅</Text>
      </View>

      <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
      
      <View style={styles.paymentDetails}>
        <Text style={styles.amount}>${paymentData.total.toFixed(2)}</Text>
        <Text style={styles.clientName}>De: {paymentData.clientName}</Text>
        <Text style={styles.vendorName}>A: {paymentData.vendorName}</Text>
        
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Transacción ID</Text>
            <Text style={styles.detailValue}>{paymentData.transactionId}</Text>
          </View>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Monto Base</Text>
            <Text style={styles.detailValue}>${paymentData.amount.toFixed(2)}</Text>
          </View>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Propina</Text>
            <Text style={styles.detailValue}>${paymentData.tip.toFixed(2)}</Text>
          </View>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Descripción</Text>
            <Text style={styles.detailValue}>{paymentData.description}</Text>
          </View>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Fecha</Text>
            <Text style={styles.detailValue}>
              {new Date(paymentData.timestamp).toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleNewPayment}
        >
          <Text style={styles.primaryButtonText}>Nuevo Cobro</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={handleGoHome}
        >
          <Text style={styles.secondaryButtonText}>Ir al Inicio</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  successIcon: {
    alignItems: 'center',
    marginVertical: 40,
  },
  successIconText: {
    fontSize: 80,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#27AE60',
    marginBottom: 30,
  },
  paymentDetails: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 15,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  amount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#27AE60',
    marginBottom: 10,
  },
  clientName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 5,
  },
  vendorName: {
    fontSize: 16,
    color: '#999',
    marginBottom: 20,
  },
  detailsGrid: {
    width: '100%',
    gap: 15,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 10,
  },
  actions: {
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});