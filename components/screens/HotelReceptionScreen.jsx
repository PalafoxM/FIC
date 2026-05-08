import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AccessDenied from '../AccessDenied';
import { hasPermission } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

const parseScannedGuestQr = (rawData) => {
  const rawValue = String(rawData ?? '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(rawValue);
    const qrCode =
      parsedJson?.codigo_qr ??
      parsedJson?.qr_code ??
      parsedJson?.clientQrCode ??
      parsedJson?.codigoQr ??
      null;

    if (qrCode) {
      return String(qrCode).trim();
    }
  } catch (_jsonError) {
    // Continue with URL/raw fallback.
  }

  try {
    const parsedUrl = new URL(rawValue);
    const urlQrCode =
      parsedUrl.searchParams.get('codigo_qr') ??
      parsedUrl.searchParams.get('qr_code') ??
      parsedUrl.searchParams.get('clientQrCode');

    if (urlQrCode) {
      return String(urlQrCode).trim();
    }
  } catch (_urlError) {
    // Not a URL.
  }

  return rawValue;
};

const resolveHospedajeRecordId = (record) =>
  Number(
    record?.id_usuario_hospedaje ??
    record?.id_hospedaje_usuario ??
    record?.id_usuario_hotel ??
    0
  ) || null;

const formatBooleanStatus = (value) => (Number(value ?? 0) === 1 || value === true ? 'Si' : 'No');
const OPEN_PDF_TIMEOUT_MS = 1800;

export default function HotelReceptionScreen() {
  const router = useRouter();
  const { user, getAccessToken } = useAuth();
  const { getHotelOrderByQr, registerHotelCheckIn } = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [observacionesCheckIn, setObservacionesCheckIn] = useState('');
  const [orderSummary, setOrderSummary] = useState(null);
  const navigatingRef = useRef(false);

  const hospedajeRecordId = useMemo(() => resolveHospedajeRecordId(orderSummary), [orderSummary]);

  if (!hasPermission(user?.id_perfil, 'hotelReception')) {
    return (
      <AccessDenied
        title="Operacion restringida"
        message="Solo recepcion puede consultar ordenes de hospedaje y registrar check in."
      />
    );
  }

  const ensureCameraPermission = async () => {
    if (permission?.granted) {
      return true;
    }

    const response = await requestPermission();
    return response.granted;
  };

  const resetScanner = () => {
    setScanned(false);
    navigatingRef.current = false;
  };

  const consultOrderByQr = async (qrCode) => {
    try {
      setLoadingOrder(true);
      const response = await getHotelOrderByQr(qrCode);
      setOrderSummary(response?.data ?? null);
      setObservacionesCheckIn('');
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo consultar la orden del huesped.');
      resetScanner();
    } finally {
      setLoadingOrder(false);
    }
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || navigatingRef.current) {
      return;
    }

    const qrCode = parseScannedGuestQr(data);
    if (!qrCode) {
      Alert.alert('Atencion', 'No se pudo leer un codigo QR valido.');
      return;
    }

    setScanned(true);
    navigatingRef.current = true;
    await consultOrderByQr(qrCode);
  };

  const downloadPdfLocally = async () => {
    const resourceUrl = String(orderSummary?.orden_hospedaje_pdf_url ?? '').trim();
    if (!resourceUrl) {
      throw new Error('No hay una orden de hospedaje disponible para este huesped.');
    }

    const sessionToken = await getAccessToken();
    if (!sessionToken) {
      throw new Error('No hay token de autenticacion para consultar la orden de hospedaje.');
    }

    const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDirectory) {
      throw new Error('No se encontro un directorio local para guardar el PDF.');
    }

    const targetDirectory = `${baseDirectory}ordenes-hospedaje`;
    await FileSystem.makeDirectoryAsync(targetDirectory, { intermediates: true }).catch(() => null);
    const safeUserId = String(orderSummary?.id_usuario ?? Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
    const fileUri = `${targetDirectory}/orden-hospedaje-${safeUserId}.pdf`;

    const result = await FileSystem.downloadAsync(resourceUrl, fileUri, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Accept: 'application/pdf',
      },
    });

    if (!result || Number(result.status ?? 0) >= 400) {
      throw new Error('No se pudo descargar la orden de hospedaje autenticada.');
    }

    return result.uri;
  };

  const handleOpenPdf = async () => {
    try {
      setProcessingPdf(true);
      const localUri = await downloadPdfLocally();
      const openableUri = Platform.OS === 'android'
        ? await FileSystem.getContentUriAsync(localUri)
        : localUri;

      if (Platform.OS !== 'android') {
        const supported = await Linking.canOpenURL(openableUri);
        if (!supported) {
          throw new Error('No se pudo abrir el PDF localmente. Puedes compartirlo desde este modulo.');
        }
      }

      setProcessingPdf(false);
      await Promise.race([
        Linking.openURL(openableUri),
        new Promise((resolve) => setTimeout(resolve, OPEN_PDF_TIMEOUT_MS)),
      ]);
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo abrir la orden de hospedaje.');
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    try {
      setProcessingPdf(true);
      const localUri = await downloadPdfLocally();
      await Share.share({
        title: 'Orden de hospedaje',
        message: localUri,
        url: localUri,
      });
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo compartir la orden de hospedaje.');
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleCheckIn = async () => {
    if (!hospedajeRecordId) {
      Alert.alert('Atencion', 'No se encontro el identificador de hospedaje para registrar el check in.');
      return;
    }

    try {
      setSavingCheckIn(true);
      const response = await registerHotelCheckIn({
        id_usuario_hospedaje: hospedajeRecordId,
        observaciones_check_in: observacionesCheckIn,
      });

      setOrderSummary((current) => ({
        ...(current ?? {}),
        ...(response?.data ?? {}),
        puede_check_in: false,
      }));

      Alert.alert('Operacion exitosa', response?.message || 'Check in registrado correctamente.');
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo registrar el check in.');
    } finally {
      setSavingCheckIn(false);
    }
  };

  const handleStartScan = async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Atencion', 'Necesitamos permiso de camara para escanear el QR del huesped.');
      return;
    }

    setOrderSummary(null);
    setObservacionesCheckIn('');
    resetScanner();
  };

  if (!permission?.granted && !orderSummary) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Operacion hotelera</Text>
        <Text style={styles.permissionText}>
          Concede permiso de camara para leer el QR del huesped y consultar su orden de hospedaje.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleStartScan}>
          <Text style={styles.primaryButtonText}>Conceder permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!orderSummary ? (
        <>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />

          <View style={styles.overlay} pointerEvents="box-none">
            <View style={styles.scanFrame}>
              <Text style={styles.instructions}>Escanea el QR del huesped para consultar su hospedaje</Text>
            </View>

            {loadingOrder ? (
              <View style={styles.loadingBadge}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.loadingBadgeText}>Consultando orden...</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>Resumen del huesped</Text>
          <Text style={styles.headerSubtitle}>
            Revisa la habitacion, la vigencia del hospedaje y registra el check in cuando corresponda.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Huesped</Text>
            <Text style={styles.value}>{orderSummary?.nombre_completo || 'Sin nombre disponible'}</Text>

            <Text style={styles.label}>Usuario</Text>
            <Text style={styles.value}>{orderSummary?.usuario || 'Sin usuario disponible'}</Text>

            <Text style={styles.label}>Folio</Text>
            <Text style={styles.value}>{orderSummary?.folio || 'Sin folio disponible'}</Text>

            <Text style={styles.label}>Hotel</Text>
            <Text style={styles.value}>{orderSummary?.hotel_nombre || 'Sin hotel disponible'}</Text>

            <Text style={styles.label}>Tipo de habitacion</Text>
            <Text style={styles.value}>{orderSummary?.tipo_habitacion || 'Sin tipo disponible'}</Text>

            <View style={styles.inlineRow}>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Check-in</Text>
                <Text style={styles.value}>{orderSummary?.fecha_check_in || 'Sin definir'}</Text>
              </View>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Check-out</Text>
                <Text style={styles.value}>{orderSummary?.fecha_check_out || 'Sin definir'}</Text>
              </View>
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Noches</Text>
                <Text style={styles.value}>
                  {orderSummary?.noches !== null && orderSummary?.noches !== undefined
                    ? String(orderSummary.noches)
                    : 'Sin definir'}
                </Text>
              </View>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Estatus hospedaje</Text>
                <Text style={styles.value}>{orderSummary?.estatus_hospedaje || 'Sin estatus disponible'}</Text>
              </View>
            </View>

            <Text style={styles.label}>Check in registrado</Text>
            <Text style={styles.value}>{orderSummary?.check_in_at || 'Aun no registrado'}</Text>

            <Text style={styles.label}>Puede hacer check in</Text>
            <Text style={styles.value}>{formatBooleanStatus(orderSummary?.puede_check_in)}</Text>
          </View>

          <View style={styles.actionColumn}>
            {String(orderSummary?.orden_hospedaje_pdf_url ?? '').trim() ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, processingPdf && styles.disabledButton]}
                  onPress={handleOpenPdf}
              disabled={processingPdf}
            >
              <Text style={styles.primaryButtonText}>
                    {processingPdf ? 'Preparando PDF...' : 'Consultar PDF'}
              </Text>
            </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, processingPdf && styles.disabledButton]}
                  onPress={handleSharePdf}
                  disabled={processingPdf}
                >
                  <Text style={styles.secondaryButtonText}>Compartir / imprimir PDF</Text>
                </TouchableOpacity>

                {String(orderSummary?.orden_hospedaje_pdf_path ?? '').trim() ? (
                  <Text style={styles.pdfPathHint}>
                    PDF persistido: {String(orderSummary.orden_hospedaje_pdf_path).trim()}
                  </Text>
                ) : null}
              </>
            ) : null}

            <TextInput
              style={styles.observationsInput}
              value={observacionesCheckIn}
              onChangeText={setObservacionesCheckIn}
              placeholder="Observaciones de check in (opcional)"
              placeholderTextColor="#7A7A7A"
              multiline
            />

            <TouchableOpacity
              style={[styles.primaryButton, (!orderSummary?.puede_check_in || savingCheckIn) && styles.disabledButton]}
              onPress={handleCheckIn}
              disabled={!orderSummary?.puede_check_in || savingCheckIn}
            >
              <Text style={styles.primaryButtonText}>
                {savingCheckIn ? 'Registrando check in...' : 'Check in'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleStartScan}>
              <Text style={styles.secondaryButtonText}>Escanear otro QR</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  permissionTitle: {
    color: '#263B80',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  permissionText: {
    color: '#49516A',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
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
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  instructions: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  loadingBadge: {
    position: 'absolute',
    top: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(38,59,128,0.92)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  loadingBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  summaryContainer: {
    padding: 20,
    paddingBottom: 32,
  },
  summaryScroll: {
    flex: 1,
  },
  headerTitle: {
    color: '#263B80',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D7DEEE',
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  label: {
    color: '#5F6782',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 10,
  },
  value: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineBlock: {
    flex: 1,
  },
  actionColumn: {
    gap: 12,
    marginTop: 18,
  },
  observationsInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: '#C9D3EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#263B80',
    backgroundColor: '#F7F9FE',
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#263B80',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#263B80',
  },
  secondaryButtonText: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  pdfPathHint: {
    color: '#5F6782',
    fontSize: 12,
    lineHeight: 18,
  },
});
