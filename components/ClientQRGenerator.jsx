import { useCallback, useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import { hasPermission } from '../constants/roles';
import { useAuth } from '../hooks/useAuth';

const hasOwnProperty = (object, propertyName) =>
  Boolean(object) && Object.prototype.hasOwnProperty.call(object, propertyName);

const resolveActivationStatus = (status) => {
  const solicitud = String(status?.solicitud_activacion_estatus ?? '').trim().toLowerCase();
  const expediente = String(status?.expediente_estatus ?? '').trim().toLowerCase();

  if (solicitud === 'pendiente' || expediente === 'solicitado_ti') {
    return 'pendiente';
  }

  if (solicitud === 'rechazada' || expediente === 'cancelado') {
    return 'rechazada';
  }

  if (solicitud === 'aprobada' || expediente === 'entregado') {
    return 'aprobada';
  }

  return '';
};

const ClientQRGenerator = () => {
  const router = useRouter();
  const { user, getClientQrData, getClientQrActivationStatus } = useAuth();
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrStatus, setQrStatus] = useState(null);
  const [statusResolved, setStatusResolved] = useState(false);

  const refreshClientQrState = useCallback(async () => {
    if (!user || !hasPermission(user?.id_perfil, 'clientQr')) {
      return null;
    }

    const [qrRecord, activationStatus] = await Promise.all([
      getClientQrData(user.id_usuario, { includeInactive: true }),
      getClientQrActivationStatus(user.id_usuario),
    ]);

    const resolvedQrActivo = hasOwnProperty(activationStatus, 'qr_activo')
      ? Number(activationStatus?.qr_activo ?? 0)
      : Number(qrRecord?.qr_activo ?? user?.qr_activo ?? 0);
    const resolvedQrOperativo = hasOwnProperty(qrRecord, 'qr_operativo')
      ? Boolean(qrRecord?.qr_operativo)
      : resolvedQrActivo === 1;
    const resolvedQrVencido = hasOwnProperty(qrRecord, 'qr_vencido')
      ? Boolean(qrRecord?.qr_vencido)
      : false;

    const mergedStatus = {
      ...(qrRecord ?? {}),
      ...(activationStatus ?? {}),
      qr_activo: resolvedQrActivo,
      qr_operativo: resolvedQrActivo === 1 && resolvedQrOperativo,
      qr_vencido: resolvedQrVencido,
    };

    setQrStatus(mergedStatus);
    setStatusResolved(true);
    return mergedStatus;
  }, [getClientQrActivationStatus, getClientQrData, user]);

  const getPrimaryCtaLabel = useCallback((status) => {
    if (!statusResolved) {
      return 'Consultando estado del QR...';
    }

    const resolvedStatus = resolveActivationStatus(status);
    const qrOperativo =
      typeof status?.qr_operativo === 'boolean'
        ? status.qr_operativo
        : Number(status?.qr_activo ?? 0) === 1;

    if (qrOperativo) {
      return 'Generar QR para pagar';
    }

    if (resolvedStatus === 'pendiente') {
      return 'Solicitud en revision';
    }

    if (resolvedStatus === 'rechazada') {
      return 'Reintenta tu activacion';
    }

    return 'Comienza tu activacion';
  }, [statusResolved]);

  const generateClientQR = async () => {
    if (!user || !hasPermission(user?.id_perfil, 'clientQr')) {
      return;
    }

    try {
      setLoadingQr(true);
      const qrRecord = await refreshClientQrState();
      const qrCode = qrRecord?.codigo_qr ?? null;
      const qrOperativo =
        typeof qrRecord?.qr_operativo === 'boolean'
          ? qrRecord.qr_operativo
          : Number(qrRecord?.qr_activo ?? 0) === 1;

      if (!qrCode) {
        Alert.alert(
          'Atenci\u00f3n',
          'No tienes un codigo QR disponible. Revisa tu proceso de activacion con el area de TI.'
        );
        return;
      }

      if (!qrOperativo) {
        if (resolveActivationStatus(qrRecord) === 'pendiente') {
          Alert.alert(
            'Atenci\u00f3n',
            'Tu solicitud de activacion ya fue enviada y se encuentra en revision por TI.'
          );
          return;
        }

        if (resolveActivationStatus(qrRecord) === 'rechazada' && String(qrRecord?.motivo_rechazo ?? '').trim()) {
          Alert.alert(
            'Atenci\u00f3n',
            `Tu solicitud fue rechazada.\n\nMotivo: ${String(qrRecord.motivo_rechazo).trim()}`
          );
        }

        router.push({
          pathname: '/cashier-process',
          params: {
            mode: 'client',
          },
        });
        return;
      }

      const clientPaymentInfo = {
        type: 'client_payment',
        id: user?.id_usuario ?? null,
        clientId: user?.id_usuario ?? null,
        clientUserId: user?.id_usuario ?? null,
        clientName: [user?.nombre, user?.primer_apellido, user?.segundo_apellido].filter(Boolean).join(' '),
        codigo_qr: qrCode,
        qr_code: qrCode,
        clientQrCode: qrCode,
        qr_operativo: true,
        timestamp: new Date().toISOString(),
      };

      setQrData(clientPaymentInfo);
      setShowQR(true);
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudo obtener el QR vigente del cliente');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCloseQR = () => {
    setShowQR(false);
    setQrData(null);
  };

  useEffect(() => {
    refreshClientQrState().catch((error) => {
      console.error('Error refreshing client QR activation state:', error);
      setStatusResolved(true);
    });

    const subscription = DeviceEventEmitter.addListener('closeClientQrModal', () => {
      handleCloseQR();
    });
    const refreshSubscription = DeviceEventEmitter.addListener('refreshClientQrActivationState', () => {
      refreshClientQrState().catch((error) => {
        console.error('Error refreshing client QR activation state:', error);
        setStatusResolved(true);
      });
    });

    return () => {
      subscription.remove();
      refreshSubscription.remove();
    };
  }, [refreshClientQrState]);

  useFocusEffect(
    useCallback(() => {
      refreshClientQrState().catch((error) => {
        console.error('Error refreshing client QR activation state on focus:', error);
        setStatusResolved(true);
      });
    }, [refreshClientQrState])
  );

  return (
    <>
      <TouchableOpacity
        style={styles.menuItem}
        onPress={generateClientQR}
        disabled={!hasPermission(user?.id_perfil, 'clientQr') || loadingQr}
      >
        <Text style={styles.menuItemText}>
          {loadingQr
            ? 'Consultando estado del QR...'
            : getPrimaryCtaLabel(qrStatus)}
        </Text>
      </TouchableOpacity>

      {(typeof qrStatus?.qr_operativo === 'boolean'
        ? !qrStatus.qr_operativo
        : Number(qrStatus?.qr_activo ?? user?.qr_activo ?? 0) !== 1) &&
      String(qrStatus?.codigo_qr ?? user?.codigo_qr ?? '').trim() ? (
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => {
            const qrCode =
              qrStatus?.codigo_qr ??
              user?.codigo_qr ??
              null;

            if (!qrCode) {
              return;
            }

            setQrData({
              type: 'client_payment',
              id: user?.id_usuario ?? null,
              clientId: user?.id_usuario ?? null,
              clientUserId: user?.id_usuario ?? null,
              clientName: [user?.nombre, user?.primer_apellido, user?.segundo_apellido].filter(Boolean).join(' '),
              codigo_qr: qrCode,
              qr_code: qrCode,
              clientQrCode: qrCode,
              qr_operativo: false,
              forDisplayOnly: true,
              timestamp: new Date().toISOString(),
            });
            setShowQR(true);
          }}
        >
          <Text style={styles.secondaryActionText}>Ver QR actual</Text>
        </TouchableOpacity>
      ) : null}

      {resolveActivationStatus(qrStatus) === 'pendiente' ? (
        <View style={styles.statusNote}>
          <Text style={styles.statusNoteText}>Tu expediente ya fue enviado y esta en revision por TI.</Text>
        </View>
      ) : null}

      {resolveActivationStatus(qrStatus) === 'rechazada' && String(qrStatus?.motivo_rechazo ?? '').trim() ? (
        <View style={styles.rejectionNote}>
          <Text style={styles.rejectionTitle}>Solicitud rechazada</Text>
          <Text style={styles.rejectionText}>{String(qrStatus.motivo_rechazo).trim()}</Text>
        </View>
      ) : null}

      <Modal
        visible={showQR}
        animationType="slide"
        transparent
        onRequestClose={handleCloseQR}
      >
        <View style={styles.modalContainer}>
          <View style={styles.qrContainer}>
            <Text style={styles.modalTitle}>QR de pago</Text>

            {qrData && (
              <>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>
                    {[user?.nombre, user?.primer_apellido, user?.segundo_apellido].filter(Boolean).join(' ')}
                  </Text>
                  <Text style={styles.userEmail}>{user?.correo}</Text>
                  <Text style={styles.infoText}>Muestra este codigo al vendedor</Text>
                </View>

                <View style={styles.qrWrapper}>
                  <QRCode
                    value={JSON.stringify(qrData)}
                    size={220}
                    color="#263B80"
                    backgroundColor="#FFFFFF"
                  />
                </View>

                <View style={styles.instructions}>
                  <Text style={styles.instructionTitle}>
                    {(typeof qrStatus?.qr_operativo === 'boolean'
                      ? qrStatus.qr_operativo
                      : Number(qrStatus?.qr_activo ?? user?.qr_activo ?? 0) === 1)
                      ? 'Como usar:'
                      : 'QR visible pero inactivo'}
                  </Text>
                  {(typeof qrStatus?.qr_operativo === 'boolean'
                    ? qrStatus.qr_operativo
                    : Number(qrStatus?.qr_activo ?? user?.qr_activo ?? 0) === 1) ? (
                    <>
                      <Text style={styles.instructionText}>1. Muestra este QR al vendedor</Text>
                      <Text style={styles.instructionText}>2. El vendedor escaneara el codigo</Text>
                      <Text style={styles.instructionText}>3. Confirma el pago en tu dispositivo</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.instructionText}>
                        {qrStatus?.qr_vencido
                          ? 'Tu QR vencio y ya no esta operativo para pagos.'
                          : 'Tu QR no esta operativo para pagos.'}
                      </Text>
                      <Text style={styles.instructionText}>Completa tu activacion documental para solicitar revision a TI.</Text>
                    </>
                  )}
                </View>

                <TouchableOpacity style={styles.closeButton} onPress={handleCloseQR}>
                  <Text style={styles.closeButtonText}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  menuItem: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  secondaryAction: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263B80',
    padding: 16,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '700',
  },
  statusNote: {
    backgroundColor: '#F7F9FE',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 15,
  },
  statusNoteText: {
    color: '#263B80',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  rejectionNote: {
    backgroundColor: '#FFF4F5',
    borderWidth: 1,
    borderColor: '#E9BBC2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 15,
  },
  rejectionTitle: {
    color: '#B23A48',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  rejectionText: {
    color: '#7B3943',
    fontSize: 14,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
  },
  qrContainer: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 15,
    alignItems: 'center',
    width: '100%',
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#263B80',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    width: '100%',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#263B80',
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  qrWrapper: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  instructions: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 10,
  },
  instructionText: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 5,
  },
  closeButton: {
    backgroundColor: '#B23A48',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ClientQRGenerator;

