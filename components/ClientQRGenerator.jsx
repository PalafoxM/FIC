import { useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { hasPermission } from '../constants/roles';
import { useAuth } from '../hooks/useAuth';

const ClientQRGenerator = () => {
  const { user, getClientQrData } = useAuth();
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const generateClientQR = async () => {
    if (!user || !hasPermission(user?.id_perfil, 'clientQr')) {
      return;
    }

    try {
      setLoadingQr(true);

      const qrRecord = await getClientQrData(user.id_usuario);
      const qrCode = qrRecord?.codigo_qr ?? null;

      if (!qrCode) {
        Alert.alert(
          'Atenci\u00f3n',
          'No tienes un QR vigente para cobrar. Revisa la vigencia con el area de TI.'
        );
        return;
      }

      const clientPaymentInfo = {
        type: 'client_payment',
        codigo_qr: qrCode,
        qr_code: qrCode,
        clientQrCode: qrCode,
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
    const subscription = DeviceEventEmitter.addListener('closeClientQrModal', () => {
      handleCloseQR();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <>
      <TouchableOpacity
        style={styles.menuItem}
        onPress={generateClientQR}
        disabled={!hasPermission(user?.id_perfil, 'clientQr') || loadingQr}
      >
        <Text style={styles.menuItemText}>
          {loadingQr ? 'Consultando QR vigente...' : 'Generar QR para pagar'}
        </Text>
      </TouchableOpacity>

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
                  <Text style={styles.instructionTitle}>Como usar:</Text>
                  <Text style={styles.instructionText}>1. Muestra este QR al vendedor</Text>
                  <Text style={styles.instructionText}>2. El vendedor escaneara el codigo</Text>
                  <Text style={styles.instructionText}>3. Confirma el pago en tu dispositivo</Text>
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

