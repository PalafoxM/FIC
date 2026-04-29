import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AccessDenied from '../../components/AccessDenied';
import { hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const parseScannedClientQr = (rawData) => {
  const rawValue = String(rawData ?? '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(rawValue);
    if (parsedJson?.type === 'client_payment') {
      return parsedJson;
    }
  } catch (_jsonError) {
    // Printed QRs can contain only the qr_cliente.codigo_qr value.
  }

  try {
    const parsedUrl = new URL(rawValue);
    const urlQrCode =
      parsedUrl.searchParams.get('codigo_qr') ??
      parsedUrl.searchParams.get('qr_code') ??
      parsedUrl.searchParams.get('clientQrCode');

    if (urlQrCode) {
      return {
        type: 'client_payment',
        codigo_qr: urlQrCode.trim(),
        qr_code: urlQrCode.trim(),
        clientQrCode: urlQrCode.trim(),
        source: 'printed_url',
      };
    }
  } catch (_urlError) {
    // Not a URL; treat it as the raw QR code below.
  }

  return {
    type: 'client_payment',
    codigo_qr: rawValue,
    qr_code: rawValue,
    clientQrCode: rawValue,
    source: 'printed_code',
  };
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const navigatingRef = useRef(false);
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
    if (scanned || navigatingRef.current) {
      return;
    }

    setScanned(true);
    navigatingRef.current = true;

    try {
      const clientData = parseScannedClientQr(data);

      if (!clientData || clientData.type !== 'client_payment') {
        Alert.alert('Atenci\u00f3n', 'Este no es un codigo de pago valido');
        setTimeout(() => {
          setScanned(false);
          navigatingRef.current = false;
        }, 2000);
        return;
      }

      const resolvedClientId = clientData.clientId ?? clientData.clientUserId ?? clientData.id;
      const resolvedQrCode =
        clientData.codigo_qr ?? clientData.qr_code ?? clientData.clientQrCode ?? null;
      const qrOperativo =
        typeof clientData?.qr_operativo === 'boolean'
          ? clientData.qr_operativo
          : true;

      if (!resolvedClientId && !resolvedQrCode) {
        Alert.alert('Atenci\u00f3n', 'El codigo no contiene un identificador de cliente valido.');
        setTimeout(() => {
          setScanned(false);
          navigatingRef.current = false;
        }, 2000);
        return;
      }

      if (!qrOperativo) {
        Alert.alert(
          'Atenci\u00f3n',
          'Este QR no esta operativo para cobro por app. Continua con cobro por NIP.'
        );
      }

      router.replace({
        pathname: '/enter-amount',
        params: {
          clientData: JSON.stringify(clientData),
          clientId: resolvedClientId,
          qrCode: resolvedQrCode,
          clientName: clientData.clientName ?? clientData.name,
          forcedPaymentMethod: qrOperativo ? 'app' : 'nip',
        },
      });
    } catch (_error) {
      Alert.alert('Atenci\u00f3n', 'No se pudo leer el codigo QR');
      setTimeout(() => {
        setScanned(false);
        navigatingRef.current = false;
      }, 2000);
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#B23A48',
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
    backgroundColor: '#263B80',
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

