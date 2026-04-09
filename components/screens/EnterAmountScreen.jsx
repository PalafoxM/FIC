import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AccessDenied from '../AccessDenied';
import { hasPermission } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

export default function EnterAmountScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { createTransaction, getTransactionStatus } = useApi();
  
  const [amount, setAmount] = useState('');
  const [tip, setTip] = useState('');
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState(null);
  const [transactionStatus, setTransactionStatus] = useState('pending');
  
  const pollingIntervalRef = useRef(null);

  // Parse client data from QR
  const clientData = params.clientData ? JSON.parse(params.clientData) : null;
  const clientName = params.clientName || 'Cliente';
  const clientId = params.clientId || clientData?.clientId;

  const quickAmounts = [10, 20, 50, 100, 200, 500];
  const quickTips = [0, 5, 10, 15, 20];

  // ✅ Limpiar intervalo al desmontar el componente
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  if (!hasPermission(user?.id_perfil, 'scanner')) {
    return (
      <AccessDenied
        title="Cobro restringido"
        message="Solo el perfil de proveedor puede generar solicitudes de cobro."
      />
    );
  }

  const calculateTotal = () => {
    const baseAmount = parseFloat(amount) || 0;
    const tipAmount = parseFloat(tip) || 0;
    return baseAmount + tipAmount;
  };

  const handleQuickAmount = (quickAmount) => {
    setAmount(quickAmount.toString());
  };

  const handleQuickTip = (tipPercent) => {
    const baseAmount = parseFloat(amount) || 0;
    const tipAmount = (baseAmount * tipPercent) / 100;
    setTip(tipAmount.toFixed(2));
  };

  // ✅ IMPLEMENTADO: Verificar estado de la transacción
  const checkTransactionStatus = async (transactionId) => {
    try {
      console.log('🔄 Verificando estado de transacción:', transactionId);
      
      const response = await getTransactionStatus(transactionId);
      
      if (response.success) {
        const { status, transaction } = response.data;
        setTransactionStatus(status);
        
        console.log('📊 Estado actual:', status);

        if (status === 'approved') {
          // ✅ Transacción aprobada - detener polling y mostrar éxito
          stopPolling();
          showPaymentApproved(transaction);
        } else if (status === 'rejected') {
          // ❌ Transacción rechazada - detener polling y mostrar error
          stopPolling();
          showPaymentRejected(transaction);
        } else if (status === 'expired') {
          // ⏰ Transacción expirada - detener polling
          stopPolling();
          showPaymentExpired();
        }
        // Si sigue pendiente, el polling continúa
      }
    } catch (error) {
      console.error('❌ Error verificando estado:', error);
    }
  };

  // ✅ Iniciar polling para verificar estado
  const startPolling = (transactionId) => {
    // Verificar inmediatamente
    checkTransactionStatus(transactionId);
    
    // Configurar intervalo cada 5 segundos
    pollingIntervalRef.current = setInterval(() => {
      checkTransactionStatus(transactionId);
    }, 5000);
    
    console.log('🔍 Iniciando monitoreo de transacción...');
  };

  // ✅ Detener polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('🛑 Monitoreo detenido');
    }
  };

  // ✅ Mostrar pago aprobado
  const showPaymentApproved = (transaction) => {
    Alert.alert(
      '✅ Pago Aprobado',
      `El cliente ha aprobado el pago de $${transaction.total}\n\n¡Transacción completada exitosamente!`,
      [
        {
          text: 'Ver Detalles',
          onPress: () => {
            router.push({
              pathname: '/payment-confirmation',
              params: { 
                paymentData: JSON.stringify({
                  ...transaction,
                  amount: parseFloat(transaction.amount) || 0,
                  tip: parseFloat(transaction.tip) || 0,
                  total: parseFloat(transaction.total) || 0,
                  status: 'completed',
                  approvedByClient: true,
                  completedAt: new Date().toISOString()
                })
              }
            });
          }
        },
        {
          text: 'Continuar',
          onPress: () => router.back()
        }
      ]
    );
  };

  // ✅ Mostrar pago rechazado
  const showPaymentRejected = (transaction) => {
    Alert.alert(
      '❌ Pago Rechazado',
      `El cliente ha rechazado el pago de $${transaction.total}`,
      [
        {
          text: 'Intentar Nuevamente',
          onPress: () => {
            setCurrentTransaction(null);
            setTransactionStatus('pending');
          }
        },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  // ✅ Mostrar pago expirado
  const showPaymentExpired = () => {
    Alert.alert(
      '⏰ Tiempo Expirado',
      'La solicitud de pago ha expirado. El cliente no respondió a tiempo.',
      [
        {
          text: 'Intentar Nuevamente',
          onPress: () => {
            setCurrentTransaction(null);
            setTransactionStatus('pending');
          }
        },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  // ✅ ACTUALIZADO: Solicitar pago REAL con monitoreo
  const requestPaymentApproval = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Por favor ingresa un monto válido');
      return;
    }

    if (!clientId) {
      Alert.alert('Error', 'No se pudo identificar al cliente');
      return;
    }

    setIsProcessing(true);

    try {
      const transactionData = {
        clientId: parseInt(clientId),
        amount: parseFloat(amount),
        tip: parseFloat(tip) || 0,
        description: description || 'Pago por servicios',
      };

      console.log('📤 Creando transacción REAL...', transactionData);

      // 1. Crear transacción en el backend
      const response = await createTransaction(transactionData);
      
      if (response.success) {
        const transaction = response.data;
        setCurrentTransaction(transaction);
        setTransactionStatus('pending');
        
        console.log('✅ Transacción REAL creada:', transaction);

        // 2. Iniciar monitoreo del estado
        startPolling(transaction.id);

        // 3. Mostrar confirmación inicial
        Alert.alert(
          '✅ Solicitud Enviada',
          `Se ha enviado una solicitud de pago de $${transaction.total} a ${clientName}.\n\nEstado: Esperando respuesta del cliente...`,
          [
            {
              text: 'Continuar',
              onPress: () => {
                // El monitoreo continúa en segundo plano
                console.log('Monitoreo continuando en segundo plano...');
              }
            }
          ]
        );

      } else {
        throw new Error(response.message || 'Error creando transacción');
      }

    } catch (error) {
      console.error('❌ Error enviando solicitud REAL:', error);
      Alert.alert('Error', error.message || 'No se pudo enviar la solicitud de pago');
      setIsProcessing(false);
    }
  };

  const total = calculateTotal();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cobrar a</Text>
        <Text style={styles.clientName}>{clientName}</Text>
        <Text style={styles.clientId}>ID: {clientId}</Text>
        
        {currentTransaction && (
          <View style={[
            styles.transactionInfo, 
            transactionStatus === 'approved' && styles.transactionApproved,
            transactionStatus === 'rejected' && styles.transactionRejected,
            transactionStatus === 'expired' && styles.transactionExpired
          ]}>
            <Text style={styles.transactionText}>
              Transacción: {currentTransaction.transaction_id}
            </Text>
            <Text style={styles.transactionText}>
              Estado: {getStatusText(transactionStatus)}
            </Text>
            <Text style={styles.transactionText}>
              Total: ${currentTransaction.total}
            </Text>
          </View>
        )}
      </View>

      {/* Monto Principal */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monto a Cobrar</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor="#999"
          />
        </View>

        <Text style={styles.quickAmountsTitle}>Montos Rápidos</Text>
        <View style={styles.quickButtons}>
          {quickAmounts.map((quickAmount) => (
            <TouchableOpacity
              key={quickAmount}
              style={styles.quickButton}
              onPress={() => handleQuickAmount(quickAmount)}
            >
              <Text style={styles.quickButtonText}>${quickAmount}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Propina */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Propina</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            value={tip}
            onChangeText={setTip}
            keyboardType="decimal-pad"
            placeholderTextColor="#999"
          />
        </View>

        <Text style={styles.quickAmountsTitle}>Propina Rápida</Text>
        <View style={styles.quickButtons}>
          {quickTips.map((tipPercent) => (
            <TouchableOpacity
              key={tipPercent}
              style={styles.quickButton}
              onPress={() => handleQuickTip(tipPercent)}
            >
              <Text style={styles.quickButtonText}>
                {tipPercent === 0 ? 'Sin propina' : `${tipPercent}%`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Descripción */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Descripción (Opcional)</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Ej: Producto X, Servicio Y..."
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>
      {/* Resumen */}
      <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal:</Text>
            <Text style={styles.summaryValue}>${parseFloat(amount || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Propina:</Text>
            <Text style={styles.summaryValue}>${parseFloat(tip || 0).toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>TOTAL:</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
      </View>
          {/* Botones de acción */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.processButton, isProcessing && styles.processButtonDisabled]}
          onPress={requestPaymentApproval}
          disabled={isProcessing || currentTransaction}
        >
          <Text style={styles.processButtonText}>
            {isProcessing ? 'Enviando Solicitud...' : 
             currentTransaction ? 'Esperando Respuesta...' : 
             `Solicitar Pago $${total.toFixed(2)}`}
          </Text>
          <Text style={styles.processButtonSubtext}>
            (El cliente debe aprobar el pago)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={() => {
            stopPolling();
            router.back();
          }}
          disabled={isProcessing}
        >
          <Text style={styles.cancelButtonText}>
            {currentTransaction ? 'Salir' : 'Cancelar'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getStatusText = (status) => {
  const statusMap = {
    'pending': '⏳ Esperando respuesta',
    'approved': '✅ Aprobado',
    'rejected': '❌ Rechazado',
    'expired': '⏰ Expirado'
  };
  return statusMap[status] || status;
};

const styles = StyleSheet.create({
 container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingTop: 20,
  },
  title: {
    fontSize: 18,
    color: '#666',
    marginBottom: 5,
  },
  clientName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  clientId: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  transactionInfo: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    width: '100%',
  },
  transactionApproved: {
    backgroundColor: '#E8F5E8',
    borderColor: '#C8E6C9',
  },
  transactionRejected: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  transactionExpired: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFE0B2',
  },
  transactionText: {
    color: '#1976D2',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    color: '#2C3E50',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
    marginBottom: 20,
    paddingVertical: 10,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  quickAmountsTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  quickButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  quickButtonText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 14,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  summary: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 10,
    marginTop: 5,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#27AE60',
  },
  actions: {
    gap: 10,
    marginBottom: 30,
  },
  processButton: {
    backgroundColor: '#27AE60',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  processButtonDisabled: {
    backgroundColor: '#95A5A6',
  },
  processButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  processButtonSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
