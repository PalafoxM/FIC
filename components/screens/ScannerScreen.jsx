import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AccessDenied from '../../components/AccessDenied';
import { hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!hasPermission(user?.id_perfil, 'scanner')) {
    return (
      <AccessDenied
        title="Escaneo restringido"
        message="Solo el perfil de proveedor puede escanear QR para cobrar."
      />
    );
  }

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) {
      return;
    }

    setScanned(true);

    try {
      const clientData = JSON.parse(data);

      if (clientData.type !== 'client_payment') {
        Alert.alert('QR invalido', 'Este no es un codigo de pago valido');
        setTimeout(() => setScanned(false), 2000);
        return;
      }

      const resolvedClientId = clientData.clientId ?? clientData.clientUserId ?? clientData.id;

      if (!resolvedClientId) {
        Alert.alert('QR incompleto', 'El codigo no contiene un identificador de cliente valido.');
        setTimeout(() => setScanned(false), 2000);
        return;
      }

      router.push({
        pathname: '/enter-amount',
        params: {
          clientData: JSON.stringify(clientData),
          clientId: resolvedClientId,
          clientName: clientData.clientName ?? clientData.name,
        },
      });
    } catch (_error) {
      Alert.alert('Error', 'No se pudo leer el codigo QR');
      setTimeout(() => setScanned(false), 2000);
    }
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.message}>Necesitamos permiso para usar la camara</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.scanFrame}>
          <Text style={styles.instructions}>Escanea el codigo QR del cliente</Text>
        </View>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  instructions: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 40,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  message: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
