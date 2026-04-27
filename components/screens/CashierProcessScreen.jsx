import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import AccessDenied from '../AccessDenied';
import { hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const STEP_FOLIO = 'folio';
const STEP_FRONT = 'front';
const STEP_BACK = 'back';
const STEP_REVIEW = 'review';
const STEP_SIGNATURE = 'signature';
const STEP_SUMMARY = 'summary';

const buildStepTitle = (step) => {
  switch (step) {
    case STEP_FRONT:
      return 'Captura anverso';
    case STEP_BACK:
      return 'Captura reverso';
    case STEP_REVIEW:
      return 'Revision documental';
    case STEP_SIGNATURE:
      return 'Firma del interesado';
    case STEP_SUMMARY:
      return 'Resumen del tramite';
    default:
      return 'Validar folio';
  }
};

export default function CashierProcessScreen() {
  const router = useRouter();
  const { user, getCashierDeliverySummary, saveCashierDeliveryExpediente } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [folio, setFolio] = useState('');
  const [step, setStep] = useState(STEP_FOLIO);
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [isValidatingFolio, setIsValidatingFolio] = useState(false);
  const [isSavingExpediente, setIsSavingExpediente] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState(null);
  const cameraRef = useRef(null);
  const signatureRef = useRef(null);

  const currentPhotoUri = useMemo(() => {
    if (step === STEP_FRONT) {
      return frontPhoto?.uri ?? null;
    }

    if (step === STEP_BACK) {
      return backPhoto?.uri ?? null;
    }

    return null;
  }, [backPhoto, frontPhoto, step]);

  if (!hasPermission(user?.id_perfil, 'cashierProcess')) {
    return (
      <AccessDenied
        title="Proceso restringido"
        message="Solo el perfil de cajero puede iniciar la entrega documentada del QR."
      />
    );
  }

  const startDocumentCapture = async () => {
    if (!folio.trim()) {
      Alert.alert('Atencion', 'Captura el folio del interesado para continuar.');
      return;
    }

    try {
      setIsValidatingFolio(true);
      const summary = await getCashierDeliverySummary(folio);
      setDeliverySummary(summary);
    } catch (error) {
      console.error('Error validating cashier folio:', error);
      Alert.alert('Atencion', error.message || 'No se pudo validar el folio del interesado.');
      return;
    } finally {
      setIsValidatingFolio(false);
    }

    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert('Atencion', 'Necesitamos permiso de camara para capturar la identificacion.');
        return;
      }
    }

    setStep(STEP_FRONT);
  };

  const captureDocumentSide = async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    try {
      setIsCapturing(true);
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: true,
      });

      if (!picture?.uri || !picture?.base64) {
        throw new Error('No se obtuvo una imagen valida.');
      }

      const mimeType = 'image/jpeg';
      const photoPayload = {
        uri: picture.uri,
        dataUrl: `data:${mimeType};base64,${picture.base64}`,
      };

      if (step === STEP_FRONT) {
        setFrontPhoto(photoPayload);
      } else if (step === STEP_BACK) {
        setBackPhoto(photoPayload);
      }
    } catch (error) {
      Alert.alert('Atencion', error.message || 'No se pudo capturar la fotografia.');
    } finally {
      setIsCapturing(false);
    }
  };

  const retakeCurrentSide = () => {
    if (step === STEP_FRONT) {
      setFrontPhoto(null);
      return;
    }

    if (step === STEP_BACK) {
      setBackPhoto(null);
    }
  };

  const goToNextStep = () => {
    if (step === STEP_FRONT && frontPhoto?.uri) {
      setStep(STEP_BACK);
      return;
    }

    if (step === STEP_BACK && backPhoto?.uri) {
      setStep(STEP_REVIEW);
      return;
    }

    if (step === STEP_REVIEW) {
      setStep(STEP_SIGNATURE);
      return;
    }

    if (step === STEP_SUMMARY) {
      Alert.alert(
        'Fase 3 completada',
        'Ya tenemos folio, identificacion y firma. El siguiente paso sera ligar backend para mostrar QR, vigencia, NIP y desglose diario.'
      );
    }
  };

  const handleSignatureConfirm = (signature) => {
    setSignatureDataUrl(signature);
    setIsSavingSignature(false);
    setStep(STEP_SUMMARY);
  };

  const handleSignatureEmpty = () => {
    setIsSavingSignature(false);
    Alert.alert('Atencion', 'La firma esta vacia. Solicita al interesado que firme antes de continuar.');
  };

  const handleSignatureError = (error) => {
    setIsSavingSignature(false);
    Alert.alert('Atencion', error?.message || 'No se pudo procesar la firma.');
  };

  const saveSignature = () => {
    if (!signatureRef.current || isSavingSignature) {
      return;
    }

    setIsSavingSignature(true);
    signatureRef.current.readSignature();
  };

  const saveExpediente = async () => {
    if (isSavingExpediente) {
      return;
    }

    if (!deliverySummary?.folio || !deliverySummary?.id_usuario) {
      Alert.alert('Atencion', 'No contamos con el resumen del interesado para guardar el expediente.');
      return;
    }

    if (!frontPhoto?.dataUrl || !backPhoto?.dataUrl || !signatureDataUrl) {
      Alert.alert('Atencion', 'Faltan evidencias por capturar antes de guardar el expediente.');
      return;
    }

    try {
      setIsSavingExpediente(true);
      const response = await saveCashierDeliveryExpediente({
        folio: deliverySummary.folio,
        id_usuario: deliverySummary.id_usuario,
        anverso_base64: frontPhoto.dataUrl,
        reverso_base64: backPhoto.dataUrl,
        firma_base64: signatureDataUrl,
      });

      Alert.alert(
        'Operacion exitosa',
        response?.respuesta || 'Expediente de entrega guardado correctamente.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error saving cashier expediente:', error);
      Alert.alert('Atencion', error.message || 'No se pudo guardar el expediente.');
    } finally {
      setIsSavingExpediente(false);
    }
  };

  const renderFolioStep = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Folio del interesado</Text>
      <Text style={styles.cardDescription}>
        El cajero solo puede iniciar el tramite si la persona ya fue dada de alta por TI, cuenta con folio y esta lista para entrega.
      </Text>

      <Text style={styles.inputLabel}>Folio</Text>
      <TextInput
        style={styles.input}
        value={folio}
        onChangeText={setFolio}
        placeholder="Captura el folio"
        placeholderTextColor="#7A7A7A"
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.primaryButton, isValidatingFolio && styles.disabledButton]}
        onPress={startDocumentCapture}
        disabled={isValidatingFolio}
      >
        <Text style={styles.primaryButtonText}>
          {isValidatingFolio ? 'Validando folio...' : 'Continuar'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCaptureStep = () => (
    <View style={styles.captureWrapper}>
      <Text style={styles.captureTitle}>
        {step === STEP_FRONT
          ? 'Toma una fotografia clara del anverso de la identificacion oficial.'
          : 'Toma una fotografia clara del reverso de la identificacion oficial.'}
      </Text>

      {currentPhotoUri ? (
        <Image source={{ uri: currentPhotoUri }} style={styles.previewImage} resizeMode="cover" />
      ) : (
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      )}

      <View style={styles.captureActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </TouchableOpacity>

        {currentPhotoUri ? (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={retakeCurrentSide}>
              <Text style={styles.secondaryButtonText}>Repetir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={goToNextStep}>
              <Text style={styles.primaryButtonText}>Siguiente</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, isCapturing && styles.disabledButton]}
            onPress={captureDocumentSide}
            disabled={isCapturing}
          >
            <Text style={styles.primaryButtonText}>
              {isCapturing ? 'Capturando...' : 'Tomar fotografia'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderReviewStep = () => (
    <ScrollView contentContainerStyle={styles.reviewContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revision previa a firma</Text>
        <Text style={styles.cardDescription}>
          Estas son las evidencias locales reunidas en las fases 1 y 2. El siguiente paso sera capturar la firma del interesado.
        </Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Folio</Text>
          <Text style={styles.summaryValue}>{folio.trim()}</Text>
        </View>

        <Text style={styles.summarySectionTitle}>Anverso</Text>
        {frontPhoto?.uri ? (
          <Image source={{ uri: frontPhoto.uri }} style={styles.reviewImage} resizeMode="cover" />
        ) : null}

        <Text style={styles.summarySectionTitle}>Reverso</Text>
        {backPhoto?.uri ? (
          <Image source={{ uri: backPhoto.uri }} style={styles.reviewImage} resizeMode="cover" />
        ) : null}

        <View style={styles.reviewActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(STEP_FRONT)}>
            <Text style={styles.secondaryButtonText}>Editar fotos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={goToNextStep}>
            <Text style={styles.primaryButtonText}>Continuar a firma</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  const renderSignatureStep = () => (
    <View style={styles.signatureScreen}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Firma del interesado</Text>
        <Text style={styles.cardDescription}>
          Solicita al interesado que firme con su dedo dentro del recuadro. Esta firma quedara ligada al folio y a las fotografias del documento.
        </Text>
      </View>

      <View style={styles.signatureWrapper}>
        <SignatureCanvas
          ref={signatureRef}
          onOK={handleSignatureConfirm}
          onEmpty={handleSignatureEmpty}
          onError={handleSignatureError}
          autoClear={false}
          descriptionText="Firma dentro del recuadro"
          clearText="Limpiar"
          confirmText={isSavingSignature ? 'Guardando...' : 'Guardar'}
          penColor="#263B80"
          backgroundColor="#FFFFFF"
          webStyle={`
            .m-signature-pad {
              box-shadow: none;
              border: 1px solid #D7DEEE;
              border-radius: 18px;
            }
            .m-signature-pad--footer {
              background: #FFFFFF;
              border-top: 1px solid #E7ECF7;
            }
            .m-signature-pad--footer .button {
              background-color: #263B80;
              color: #FFFFFF;
              border-radius: 10px;
              box-shadow: none;
            }
            .m-signature-pad--description {
              color: #263B80;
              font-size: 14px;
            }
            body, html {
              background-color: #FFFFFF;
            }
          `}
          webviewProps={{
            cacheEnabled: true,
            androidLayerType: 'hardware',
          }}
        />
      </View>

      <View style={styles.signatureActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(STEP_REVIEW)}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, isSavingSignature && styles.disabledButton]}
          onPress={saveSignature}
          disabled={isSavingSignature}
        >
          <Text style={styles.primaryButtonText}>
            {isSavingSignature ? 'Guardando firma...' : 'Continuar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSummaryStep = () => (
    <ScrollView contentContainerStyle={styles.reviewContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumen local del tramite</Text>
        <Text style={styles.cardDescription}>
          La app ya reunio folio, identificacion oficial y firma. A continuacion se muestra el resumen real entregado por backend para el interesado.
        </Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Folio</Text>
          <Text style={styles.summaryValue}>{deliverySummary?.folio || folio.trim()}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Interesado</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.nombre_completo || 'Sin nombre disponible'}
            </Text>
          </View>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Monto total</Text>
            <Text style={styles.summaryMetricValue}>
              ${Number(deliverySummary?.monto_total ?? 0).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>QR del interesado</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.codigo_qr || 'Sin QR disponible'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Vigente desde</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.vigente_desde || 'Sin definir'}
            </Text>
          </View>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Vigente hasta</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.vigente_hasta || 'Sin definir'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>NIP</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.nip_legado_hash
                ? 'NIP legado, requiere regeneracion'
                : deliverySummary?.nip || 'Sin NIP disponible'}
            </Text>
          </View>
        </View>

        <Text style={styles.summarySectionTitle}>Anverso</Text>
        {frontPhoto?.uri ? (
          <Image source={{ uri: frontPhoto.uri }} style={styles.reviewImage} resizeMode="cover" />
        ) : null}

        <Text style={styles.summarySectionTitle}>Reverso</Text>
        {backPhoto?.uri ? (
          <Image source={{ uri: backPhoto.uri }} style={styles.reviewImage} resizeMode="cover" />
        ) : null}

        <Text style={styles.summarySectionTitle}>Firma</Text>
        {signatureDataUrl ? (
          <Image source={{ uri: signatureDataUrl }} style={styles.signaturePreview} resizeMode="contain" />
        ) : (
          <View style={styles.signaturePlaceholder}>
            <Text style={styles.signaturePlaceholderText}>Aun no hay firma capturada.</Text>
          </View>
        )}

        <Text style={styles.summarySectionTitle}>Desglose por dia</Text>
        {Array.isArray(deliverySummary?.desglose_por_dia) && deliverySummary.desglose_por_dia.length > 0 ? (
          <View style={styles.breakdownList}>
            {deliverySummary.desglose_por_dia.map((item, index) => (
              <View key={`${item?.fecha ?? 'fecha'}-${index}`} style={styles.breakdownRow}>
                <Text style={styles.breakdownDate}>{item?.fecha || 'Sin fecha'}</Text>
                <Text style={styles.breakdownAmount}>${Number(item?.monto ?? 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.signaturePlaceholder}>
            <Text style={styles.signaturePlaceholderText}>No hay desglose diario disponible.</Text>
          </View>
        )}

        <View style={styles.reviewActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(STEP_SIGNATURE)}>
            <Text style={styles.secondaryButtonText}>Repetir firma</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, isSavingExpediente && styles.disabledButton]}
            onPress={saveExpediente}
            disabled={isSavingExpediente}
          >
            <Text style={styles.primaryButtonText}>
              {isSavingExpediente ? 'Guardando expediente...' : 'Guardar expediente'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  if (!permission && step !== STEP_FOLIO) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color="#263B80" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Perfil cajero</Text>
        <Text style={styles.title}>{buildStepTitle(step)}</Text>
        <Text style={styles.subtitle}>
          Fases 1, 2, 3 y 5 del proceso de entrega documentada de QR.
        </Text>
      </View>

      {step === STEP_FOLIO ? renderFolioStep() : null}
      {(step === STEP_FRONT || step === STEP_BACK) ? renderCaptureStep() : null}
      {step === STEP_REVIEW ? renderReviewStep() : null}
      {step === STEP_SIGNATURE ? renderSignatureStep() : null}
      {step === STEP_SUMMARY ? renderSummaryStep() : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  eyebrow: {
    color: '#B23A48',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: '#263B80',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  card: {
    margin: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D7DEEE',
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    color: '#263B80',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardDescription: {
    color: '#49516A',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  inputLabel: {
    color: '#263B80',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#C9D3EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#263B80',
    backgroundColor: '#F7F9FE',
    marginBottom: 16,
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
  captureWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  captureTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  camera: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1F2430',
  },
  previewImage: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#E9EDF6',
  },
  captureActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  reviewContent: {
    paddingBottom: 24,
  },
  summaryBox: {
    backgroundColor: '#F7F9FE',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  summaryLabel: {
    color: '#5F6782',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#263B80',
    fontSize: 18,
    fontWeight: '800',
  },
  summaryGrid: {
    gap: 10,
    marginBottom: 12,
  },
  summaryMetricCard: {
    backgroundColor: '#F7F9FE',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F4',
  },
  summaryMetricLabel: {
    color: '#5F6782',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryMetricValue: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
  },
  summarySectionTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },
  reviewImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#E9EDF6',
    marginBottom: 14,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 8,
  },
  signatureScreen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  signatureWrapper: {
    flex: 1,
    minHeight: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    marginHorizontal: 20,
    marginTop: 4,
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  signatureActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  signaturePreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    marginBottom: 14,
  },
  signaturePlaceholder: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7DEEE',
    backgroundColor: '#F7F9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  signaturePlaceholderText: {
    color: '#5F6782',
    fontSize: 14,
  },
  breakdownList: {
    borderWidth: 1,
    borderColor: '#D7DEEE',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2FA',
  },
  breakdownDate: {
    color: '#263B80',
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownAmount: {
    color: '#B23A48',
    fontSize: 14,
    fontWeight: '800',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
