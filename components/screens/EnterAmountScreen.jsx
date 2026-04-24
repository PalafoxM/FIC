import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { hasPermission, ROLE_IDS } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import AccessDenied from '../AccessDenied';

const getStatusText = (status) => {
  const statusMap = {
    pending: 'Esperando respuesta',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    expired: 'Expirado',
    created: 'Registrado',
  };

  return statusMap[status] || status;
};

export default function EnterAmountScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user, activeEstablecimientoId } = useAuth();
  const { createPaymentRequest, createTransaction, getTransactionStatus } = useApi();

  const [amount, setAmount] = useState('');
  const [tip, setTip] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('app');
  const [nip, setNip] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState(null);
  const [transactionStatus, setTransactionStatus] = useState('pending');
  const pollingIntervalRef = useRef(null);
  const redirectTimeoutRef = useRef(null);

  const clientData = params.clientData ? JSON.parse(params.clientData) : null;
  const clientName = params.clientName || 'Cliente';
  const clientId =
    params.clientId ||
    clientData?.clientId ||
    clientData?.clientUserId ||
    clientData?.id ||
    null;
  const qrCode =
    params.qrCode ||
    clientData?.codigo_qr ||
    clientData?.qr_code ||
    clientData?.clientQrCode ||
    null;

  const quickAmounts = [10, 20, 50, 100, 200, 500];
  const quickTips = [0, 5, 10, 15, 20];
  const postPaymentRoute =
    user?.id_perfil === ROLE_IDS.CLIENT ? '/(modals)/historyPay' : '/profile';

  const navigateAfterPayment = () => {
    router.replace('/(tabs)');
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        router.push(postPaymentRoute);
      }, 150);
    });
  };

  const scheduleRedirectAfterPayment = (delayMs = 5000) => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }

    redirectTimeoutRef.current = setTimeout(() => {
      navigateAfterPayment();
    }, delayMs);
  };

  const navigateAfterPaymentImmediately = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    navigateAfterPayment();
  };

  useEffect(() => () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
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
    setAmount(String(quickAmount));
  };

  const handleQuickTip = (tipPercent) => {
    const baseAmount = parseFloat(amount) || 0;
    const tipAmount = (baseAmount * tipPercent) / 100;
    setTip(tipAmount.toFixed(2));
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const showPaymentApproved = (transaction) => {
    scheduleRedirectAfterPayment(2000);
    Alert.alert(
      'Operación exitosa',
      `El cliente aprobó el pago de $${transaction.total}. Redirigiendo en breve.`,
      [
        {
          text: 'OK',
          onPress: navigateAfterPaymentImmediately,
        },
      ]
    );
  };

  const showPaymentRejected = (transaction) => {
    Alert.alert(
      'Atención',
      `El cliente rechazó el pago de $${transaction.total}.`,
      [
        {
          text: 'Intentar nuevamente',
          onPress: () => {
            setCurrentTransaction(null);
            setTransactionStatus('pending');
          },
        },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const showPaymentExpired = () => {
    Alert.alert(
      'Atención',
      'La solicitud de pago expiró.',
      [
        {
          text: 'Intentar nuevamente',
          onPress: () => {
            setCurrentTransaction(null);
            setTransactionStatus('pending');
          },
        },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const checkTransactionStatus = async (transactionId) => {
    try {
      const response = await getTransactionStatus(transactionId);

      if (!response?.success) {
        return;
      }

      const { status, transaction } = response.data;
      setTransactionStatus(status);

      if (status === 'approved') {
        stopPolling();
        showPaymentApproved(transaction);
      } else if (status === 'rejected') {
        stopPolling();
        showPaymentRejected(transaction);
      } else if (status === 'expired') {
        stopPolling();
        showPaymentExpired();
      }
    } catch (error) {
      console.error('Error verificando estado:', error);
    }
  };

  const startPolling = (transactionId) => {
    checkTransactionStatus(transactionId);
    pollingIntervalRef.current = setInterval(() => {
      checkTransactionStatus(transactionId);
    }, 5000);
  };

  const requestPaymentApproval = async () => {
    if (!amount || Number.isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    Alert.alert('Atención', 'Por favor ingresa un monto valido');
      return;
    }

    if (!clientId && !qrCode) {
      Alert.alert('Atención', 'No se pudo identificar al cliente');
      return;
    }

    if (paymentMethod === 'nip' && String(nip || '').trim().length < 4) {
      Alert.alert('Atención', 'Captura un NIP válido para continuar con el cobro sin app.');
      return;
    }

    setIsProcessing(true);

    try {
      const resolvedClientId = clientId ? parseInt(clientId, 10) : null;

      const transactionData = {
        clientId: resolvedClientId,
        clientUserId: resolvedClientId,
        qrCode,
        codigo_qr: qrCode,
        clientEstablecimientoId:
          clientData?.clientEstablecimientoId ??
          clientData?.id_establecimiento_cliente ??
          clientData?.id_establecimiento ??
          undefined,
        vendorId: user?.id_usuario ? parseInt(user.id_usuario, 10) : undefined,
        vendorUserId: user?.id_usuario ? parseInt(user.id_usuario, 10) : undefined,
        amount: parseFloat(amount),
        tip: parseFloat(tip) || 0,
        description: description || 'Pago por servicios',
        paymentMethod,
        nip: String(nip || '').trim(),
        idEstablecimiento: activeEstablecimientoId
          ? parseInt(activeEstablecimientoId, 10)
          : user?.id_establecimiento
            ? parseInt(user.id_establecimiento, 10)
            : undefined,
      };

      console.log('Creando transaccion REAL...', transactionData);

      const response = paymentMethod === 'app'
        ? await createPaymentRequest(transactionData)
        : await createTransaction(transactionData);

      if (!response.success) {
        throw new Error(response.message || 'Error creando transacción');
      }

      const transaction = response.data;
      setCurrentTransaction(transaction);
      setTransactionStatus(transaction.status || (paymentMethod === 'app' ? 'pending' : 'created'));

      if (transaction.supportsStatusPolling && transaction.id) {
        startPolling(transaction.id);
        scheduleRedirectAfterPayment(5000);
        Alert.alert(
          'Operación exitosa',
          `Se envió una solicitud de pago de $${transaction.total} a ${clientName}. Redirigiendo en breve.`,
          [
            {
              text: 'OK',
              onPress: navigateAfterPaymentImmediately,
            },
          ]
        );
      } else {
        setIsProcessing(false);
        scheduleRedirectAfterPayment(2000);
        Alert.alert(
          'Operación exitosa',
          `${response.message || `Se registró el pago de $${transaction.total} para ${clientName}.`} Redirigiendo en breve.`,
          [
            {
              text: 'OK',
              onPress: navigateAfterPaymentImmediately,
            },
          ]
        );
        return;
      }
    } catch (error) {
      console.error('Error enviando solicitud REAL:', error);
      Alert.alert('Atención', error.message || 'No se pudo enviar la solicitud de pago');
      setIsProcessing(false);
    }
  };

  const total = calculateTotal();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cobrar a</Text>
        <Text style={styles.clientName}>{clientName}</Text>
        <Text style={styles.clientId}>
          {clientId ? `ID: ${clientId}` : `QR: ${String(qrCode ?? '').slice(0, 16)}`}
        </Text>

        {currentTransaction && (
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionText}>
                Transaccion: {currentTransaction.transaction_id}
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Metodo de cobro</Text>
        <View style={styles.methodSelector}>
          <TouchableOpacity
            style={[styles.methodButton, paymentMethod === 'app' && styles.methodButtonActive]}
            onPress={() => setPaymentMethod('app')}
          >
            <Text
              style={[styles.methodButtonText, paymentMethod === 'app' && styles.methodButtonTextActive]}
            >
              Cobro por app
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodButton, paymentMethod === 'nip' && styles.methodButtonActive]}
            onPress={() => setPaymentMethod('nip')}
          >
            <Text
              style={[styles.methodButtonText, paymentMethod === 'nip' && styles.methodButtonTextActive]}
            >
              Cobro con NIP
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.methodHelpText}>
          {paymentMethod === 'app'
            ? 'El cliente recibirá una solicitud para aceptar o declinar el pago.'
            : 'Usa esta opción cuando el cliente no tenga datos, wifi o celular disponible.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monto a cobrar</Text>
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

            <Text style={styles.quickAmountsTitle}>Montos rapidos</Text>
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

            <Text style={styles.quickAmountsTitle}>Propina rápida</Text>
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

      <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descripción</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Ej: Producto X, Servicio Y..."
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>

      {paymentMethod === 'nip' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NIP del cliente</Text>
          <TextInput
            style={styles.nipInput}
            placeholder="Captura el NIP"
            value={nip}
            onChangeText={setNip}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholderTextColor="#999"
          />
        </View>
      )}

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

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.processButton, isProcessing && styles.processButtonDisabled]}
          onPress={requestPaymentApproval}
          disabled={isProcessing || Boolean(currentTransaction)}
        >
          <Text style={styles.processButtonText}>
            {isProcessing
              ? paymentMethod === 'app'
                ? 'Enviando solicitud...'
                : 'Registrando pago...'
              : currentTransaction
                ? 'Operación exitosa'
                : paymentMethod === 'app'
                  ? `Solicitar pago $${total.toFixed(2)}`
                  : `Registrar pago $${total.toFixed(2)}`}
          </Text>
          <Text style={styles.processButtonSubtext}>
            {paymentMethod === 'app'
              ? '(El cliente deberá aceptar o declinar el cobro)'
              : '(El proveedor registrará el pago usando el NIP del cliente)'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    color: '#263B80',
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
  methodSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0D7DE',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  methodButtonActive: {
    backgroundColor: '#263B80',
    borderColor: '#263B80',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#263B80',
  },
  methodButtonTextActive: {
    color: '#FFFFFF',
  },
  methodHelpText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    color: '#666',
  },
  nipInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    letterSpacing: 6,
    color: '#263B80',
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    color: '#263B80',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#263B80',
    marginBottom: 20,
    paddingVertical: 10,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#263B80',
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#263B80',
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
    color: '#263B80',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#263B80',
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
    borderColor: '#B23A48',
  },
  cancelButtonText: {
    color: '#B23A48',
    fontSize: 16,
    fontWeight: '600',
  },
});


