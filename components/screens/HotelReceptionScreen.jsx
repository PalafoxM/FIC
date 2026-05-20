import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
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
const formatCurrency = (value) => `$${Number(value ?? 0).toFixed(2)}`;

const resolveResponsibleReceptionLabel = (record) => {
  const directLabel =
    record?.recepcion_responsable_nombre ??
    record?.responsable_recepcion_nombre ??
    record?.nombre_responsable_recepcion ??
    record?.recepcion_nombre ??
    record?.responsable_nombre ??
    record?.nombre_responsable ??
    record?.usuario_recepcion_nombre ??
    null;

  if (String(directLabel ?? '').trim()) {
    return String(directLabel).trim();
  }

  const fullName = [
    record?.recepcion_responsable_nombre,
    record?.recepcion_responsable_primer_apellido,
    record?.recepcion_responsable_segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) {
    return fullName;
  }

  return '';
};

const buildPdfViewerHtml = (pdfBase64) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>Orden de hospedaje</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100%;
      overflow: auto;
    }
    #status {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(15, 23, 42, 0.94);
      padding: 14px 16px;
      font-size: 14px;
      font-weight: 700;
      backdrop-filter: blur(8px);
    }
    #viewer {
      padding: 14px 10px 28px;
    }
    .page {
      display: block;
      width: calc(100% - 8px);
      max-width: 980px;
      margin: 0 auto 18px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
    }
    .error {
      color: #fecaca;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div id="status">Preparando PDF...</div>
  <div id="viewer"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    (function () {
      const status = document.getElementById('status');
      const viewer = document.getElementById('viewer');
      const base64 = ${JSON.stringify(pdfBase64)};

      const base64ToUint8Array = (value) => {
        const binary = atob(value);
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      };

      const render = async () => {
        try {
          if (!window.pdfjsLib) {
            throw new Error('No se pudo cargar el visor PDF.');
          }

          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

          const loadingTask = window.pdfjsLib.getDocument({ data: base64ToUint8Array(base64) });
          const pdf = await loadingTask.promise;
          status.textContent = 'Documento listo';

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.15 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const ratio = window.devicePixelRatio || 1;

            canvas.className = 'page';
            canvas.width = Math.floor(viewport.width * ratio);
            canvas.height = Math.floor(viewport.height * ratio);
            canvas.style.width = viewport.width + 'px';
            canvas.style.height = viewport.height + 'px';
            context.scale(ratio, ratio);

            viewer.appendChild(canvas);

            await page.render({
              canvasContext: context,
              viewport,
            }).promise;
          }
        } catch (error) {
          status.innerHTML =
            '<span class="error">' +
            (error && error.message ? error.message : 'No se pudo visualizar el PDF.') +
            '</span>';
        }
      };

      render();
    })();
  </script>
</body>
</html>`;

export default function HotelReceptionScreen() {
  const router = useRouter();
  const { user, getAccessToken } = useAuth();
  const { getHotelOrderByQr, registerHotelCheckIn, registerHotelCheckOut } = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [savingCheckOut, setSavingCheckOut] = useState(false);
  const [observacionesCheckIn, setObservacionesCheckIn] = useState('');
  const [observacionesCheckOut, setObservacionesCheckOut] = useState('');
  const [orderSummary, setOrderSummary] = useState(null);
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [pdfViewerHtml, setPdfViewerHtml] = useState('');
  const navigatingRef = useRef(false);
  const pdfCacheRef = useRef({
    sourceUrl: '',
    localUri: '',
    pdfBase64: '',
  });

  const hospedajeRecordId = useMemo(() => resolveHospedajeRecordId(orderSummary), [orderSummary]);
  const responsibleReceptionLabel = useMemo(
    () => resolveResponsibleReceptionLabel(orderSummary),
    [orderSummary]
  );

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
      setObservacionesCheckOut('');
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

  const preparePdfAsset = async ({ includeBase64 = false } = {}) => {
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

    let localUri = pdfCacheRef.current.localUri;
    if (pdfCacheRef.current.sourceUrl !== resourceUrl || !localUri) {
      const result = await FileSystem.downloadAsync(resourceUrl, fileUri, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          Accept: 'application/pdf',
        },
      });

      if (!result || Number(result.status ?? 0) >= 400) {
        throw new Error('No se pudo descargar la orden de hospedaje autenticada.');
      }

      localUri = result.uri;
      pdfCacheRef.current = {
        sourceUrl: resourceUrl,
        localUri,
        pdfBase64: '',
      };
    }

    let pdfBase64 = pdfCacheRef.current.pdfBase64;
    if (includeBase64 && !pdfBase64) {
      pdfBase64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      pdfCacheRef.current = {
        ...pdfCacheRef.current,
        localUri,
        pdfBase64,
      };
    }

    return {
      localUri,
      pdfBase64,
    };
  };

  const handleOpenPdf = async () => {
    try {
      setProcessingPdf(true);
      const { pdfBase64 } = await preparePdfAsset({ includeBase64: true });
      if (!pdfBase64) {
        throw new Error('No se pudo preparar el PDF para visualizarlo.');
      }

      setPdfViewerHtml(buildPdfViewerHtml(pdfBase64));
      setPdfViewerVisible(true);
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo abrir la orden de hospedaje.');
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    try {
      setProcessingPdf(true);
      const { localUri } = await preparePdfAsset();
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

  const handleCheckOut = async () => {
    if (!hospedajeRecordId) {
      Alert.alert('Atencion', 'No se encontro el identificador de hospedaje para registrar el check out.');
      return;
    }

    try {
      setSavingCheckOut(true);
      const response = await registerHotelCheckOut({
        id_usuario_hospedaje: hospedajeRecordId,
        observaciones_check_out: observacionesCheckOut,
      });

      setOrderSummary((current) => ({
        ...(current ?? {}),
        ...(response?.data ?? {}),
        puede_check_out: false,
        puede_hacer_check_out: false,
      }));

      Alert.alert('Operacion exitosa', response?.message || 'Check out registrado correctamente.');
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo registrar el check out.');
    } finally {
      setSavingCheckOut(false);
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
    setObservacionesCheckOut('');
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
      <Modal
        animationType="slide"
        visible={pdfViewerVisible}
        onRequestClose={() => setPdfViewerVisible(false)}
      >
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>Orden de hospedaje</Text>
            <TouchableOpacity
              style={styles.viewerCloseButton}
              onPress={() => setPdfViewerVisible(false)}
            >
              <Text style={styles.viewerCloseButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          {pdfViewerHtml ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: pdfViewerHtml, baseUrl: 'https://localhost/' }}
              style={styles.viewerWebView}
              setSupportMultipleWindows={false}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.viewerLoadingState}>
                  <ActivityIndicator size="large" color="#263B80" />
                  <Text style={styles.viewerLoadingText}>Cargando PDF...</Text>
                </View>
              )}
            />
          ) : (
            <View style={styles.viewerLoadingState}>
              <ActivityIndicator size="large" color="#263B80" />
              <Text style={styles.viewerLoadingText}>Preparando PDF...</Text>
            </View>
          )}
        </View>
      </Modal>

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
            Revisa el hospedaje, distingue el total asignado del monto devengado y registra check in o check out cuando corresponda.
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

            {responsibleReceptionLabel ? (
              <>
                <Text style={styles.label}>Recepcion responsable</Text>
                <Text style={styles.value}>{responsibleReceptionLabel}</Text>
              </>
            ) : null}

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
                <Text style={styles.label}>Noches programadas</Text>
                <Text style={styles.value}>
                  {orderSummary?.noches_programadas !== null && orderSummary?.noches_programadas !== undefined
                    ? String(orderSummary.noches_programadas)
                    : 'Sin definir'}
                </Text>
              </View>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Noches ocupadas</Text>
                <Text style={styles.value}>
                  {orderSummary?.noches_ocupadas !== null && orderSummary?.noches_ocupadas !== undefined
                    ? String(orderSummary.noches_ocupadas)
                    : '0'}
                </Text>
              </View>
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Total asignado</Text>
                <Text style={styles.value}>
                  {formatCurrency(orderSummary?.tarifa_total_hospedaje ?? orderSummary?.tarifa_total ?? 0)}
                </Text>
              </View>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Monto devengado</Text>
                <Text style={styles.value}>
                  {formatCurrency(orderSummary?.tarifa_total_hospedaje_devengada ?? 0)}
                </Text>
              </View>
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.inlineBlock}>
                <Text style={styles.label}>Saldo pendiente</Text>
                <Text style={styles.value}>
                  {formatCurrency(orderSummary?.saldo_pendiente_hospedaje ?? 0)}
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

            <Text style={styles.label}>Puede hacer check out</Text>
            <Text style={styles.value}>
              {formatBooleanStatus(orderSummary?.puede_hacer_check_out ?? orderSummary?.puede_check_out)}
            </Text>
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

            <TextInput
              style={styles.observationsInput}
              value={observacionesCheckOut}
              onChangeText={setObservacionesCheckOut}
              placeholder="Observaciones de check out (opcional)"
              placeholderTextColor="#7A7A7A"
              multiline
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.checkoutButton,
                (!(orderSummary?.puede_hacer_check_out ?? orderSummary?.puede_check_out) || savingCheckOut) &&
                  styles.disabledButton,
              ]}
              onPress={handleCheckOut}
              disabled={!(orderSummary?.puede_hacer_check_out ?? orderSummary?.puede_check_out) || savingCheckOut}
            >
              <Text style={styles.primaryButtonText}>
                {savingCheckOut ? 'Registrando check out...' : 'Check out'}
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
  viewerContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  viewerHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#D7DEEE',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  viewerTitle: {
    color: '#263B80',
    fontSize: 18,
    fontWeight: '800',
  },
  viewerCloseButton: {
    backgroundColor: '#263B80',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  viewerCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  viewerWebView: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  viewerLoadingState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  viewerLoadingText: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
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
  checkoutButton: {
    backgroundColor: '#1F7A4C',
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
