import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureCanvas from "react-native-signature-canvas";
// Nuevos imports ---------------------------------------------
import * as ImageManipulator from "expo-image-manipulator";
import { ENV } from "../../constants/env";
// ------------------------------------------------------------
import { hasPermission, ROLE_IDS } from "../../constants/roles";
import { useAuth } from "../../hooks/useAuth";
import AccessDenied from "../AccessDenied";

const STEP_FOLIO = "folio";
const STEP_FRONT = "front";
const STEP_BACK = "back";
const STEP_REVIEW = "review";
const STEP_SIGNATURE = "signature";
const STEP_SUMMARY = "summary";
const SELF_ACTIVATION_PROFILE_IDS = new Set([
  ROLE_IDS.ADMIN,
  ROLE_IDS.CLIENT,
  ROLE_IDS.MANAGER,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SECUL,
  ROLE_IDS.FIC,
  ROLE_IDS.UG,
]);
// DIMENSIONES DEL MARCO DE CAPTURA --------------------------------------------
const SCREEN_WIDTH = Dimensions.get("window").width;
const CAMERA_CONTAINER_WIDTH = SCREEN_WIDTH - 40;
const CARD_FRAME_WIDTH = CAMERA_CONTAINER_WIDTH * 0.9;
const CARD_FRAME_HEIGHT = CARD_FRAME_WIDTH / 1.585; // Proporción ISO 7810 ID-1
// -----------------------------------------------------------------------------

const buildStepTitle = (step) => {
  switch (step) {
    case STEP_FRONT:
      return "Captura anverso";
    case STEP_BACK:
      return "Captura reverso";
    case STEP_REVIEW:
      return "Revision documental";
    case STEP_SIGNATURE:
      return "Firma del interesado";
    case STEP_SUMMARY:
      return "Resumen del tramite";
    default:
      return "Validar folio";
  }
};

const resolveActivationStatus = (status) => {
  const solicitud = String(status?.solicitud_activacion_estatus ?? "")
    .trim()
    .toLowerCase();
  const expediente = String(status?.expediente_estatus ?? "")
    .trim()
    .toLowerCase();

  if (solicitud === "pendiente" || expediente === "solicitado_ti") {
    return "pendiente";
  }

  if (solicitud === "rechazada" || expediente === "cancelado") {
    return "rechazada";
  }

  if (solicitud === "aprobada" || expediente === "entregado") {
    return "aprobada";
  }

  return "";
};

const canRestartDocumentFlow = (status) => {
  const resolvedStatus = resolveActivationStatus(status);
  const expediente = String(status?.expediente_estatus ?? "")
    .trim()
    .toLowerCase();

  if (resolvedStatus === "rechazada") {
    return true;
  }

  return [
    "capturado",
    "pendiente_documentos",
    "pendiente_documental",
    "documentos_pendientes",
  ].includes(expediente);
};

const buildActivationRetryMessage = (status) => {
  const motivo = String(status?.motivo_rechazo ?? "").trim();
  const baseMessage =
    "La solicitud fue rechazada. Debes volver a cargar los documentos y reenviar la solicitud para continuar con la activacion.";

  return motivo ? `${baseMessage}\n\nMotivo: ${motivo}` : baseMessage;
};

const normalizeRouteParam = (value) => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
};

const firstDefinedValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const mergeBenefitSummary = (...sources) => {
  const normalizedSources = sources.filter(Boolean);
  const directOrderUrl = firstDefinedValue(
    ...normalizedSources.map((source) => source?.orden_hospedaje_pdf_url),
    ...normalizedSources.map((source) => source?.orden_hospedaje_url),
    ...normalizedSources.map((source) => source?.pdf_orden_hospedaje_url),
    ...normalizedSources.map((source) => source?.hospedaje_pdf_url),
  );
  const directFoodOrderUrl = firstDefinedValue(
    ...normalizedSources.map((source) => source?.orden_alimentos_pdf_url),
    ...normalizedSources.map((source) => source?.orden_alimentos_url),
    ...normalizedSources.map((source) => source?.pdf_orden_alimentos_url),
    ...normalizedSources.map((source) => source?.alimentos_pdf_url),
  );

  return {
    tiene_alimentos: firstDefinedValue(
      ...normalizedSources.map((source) => source?.tiene_alimentos),
    ),
    tiene_hospedaje: firstDefinedValue(
      ...normalizedSources.map((source) => source?.tiene_hospedaje),
    ),
    tipo_beneficio: firstDefinedValue(
      ...normalizedSources.map((source) => source?.beneficio_qr),
      ...normalizedSources.map((source) => source?.tipo_beneficio),
    ),
    tipo_beneficio_label: firstDefinedValue(
      ...normalizedSources.map((source) => source?.beneficio_qr_label),
      ...normalizedSources.map((source) => source?.tipo_beneficio_label),
    ),
    hotel: firstDefinedValue(
      ...normalizedSources.map((source) => source?.hotel_nombre),
      ...normalizedSources.map((source) => source?.hotel),
    ),
    id_establecimiento_hotel: firstDefinedValue(
      ...normalizedSources.map((source) => source?.id_establecimiento_hotel),
    ),
    id_tipo_habitacion: firstDefinedValue(
      ...normalizedSources.map((source) => source?.id_tipo_habitacion),
    ),
    tipo_habitacion: firstDefinedValue(
      ...normalizedSources.map((source) => source?.tipo_habitacion),
    ),
    fecha_check_in: firstDefinedValue(
      ...normalizedSources.map((source) => source?.fecha_check_in),
    ),
    fecha_check_out: firstDefinedValue(
      ...normalizedSources.map((source) => source?.fecha_check_out),
    ),
    noches: firstDefinedValue(
      ...normalizedSources.map((source) => source?.noches),
    ),
    tarifa_noche: firstDefinedValue(
      ...normalizedSources.map((source) => source?.tarifa_noche),
    ),
    tarifa_total_hospedaje: firstDefinedValue(
      ...normalizedSources.map((source) => source?.tarifa_total_hospedaje),
    ),
    folio_hospedaje: firstDefinedValue(
      ...normalizedSources.map((source) => source?.folio_hospedaje),
    ),
    observaciones_hospedaje: firstDefinedValue(
      ...normalizedSources.map((source) => source?.observaciones_hospedaje),
    ),
    orden_hospedaje_disponible: firstDefinedValue(
      ...normalizedSources.map((source) => source?.orden_hospedaje_disponible),
    ),
    orden_hospedaje_pdf_url: firstDefinedValue(
      ...normalizedSources.map((source) => source?.orden_hospedaje_pdf_url),
    ),
    orden_hospedaje_pdf_path: firstDefinedValue(
      ...normalizedSources.map((source) => source?.orden_hospedaje_pdf_path),
      ...normalizedSources.map((source) => source?.pdf_path),
    ),
    orden_hospedaje_url: directOrderUrl,
    orden_alimentos_disponible: firstDefinedValue(
      ...normalizedSources.map((source) => source?.orden_alimentos_disponible),
    ),
    orden_alimentos_pdf_url: firstDefinedValue(
      ...normalizedSources.map((source) => source?.orden_alimentos_pdf_url),
    ),
    orden_alimentos_url: directFoodOrderUrl,
  };
};

const resolveOrderUrl = (...sources) =>
  firstDefinedValue(
    ...sources
      .filter(Boolean)
      .flatMap((source) => [
        source?.orden_hospedaje_pdf_url,
        source?.orden_hospedaje_url,
        source?.pdf_orden_hospedaje_url,
        source?.hospedaje_pdf_url,
      ]),
  );

const resolveFoodOrderUrl = (...sources) =>
  firstDefinedValue(
    ...sources
      .filter(Boolean)
      .flatMap((source) => [
        source?.orden_alimentos_pdf_url,
        source?.orden_alimentos_url,
        source?.pdf_orden_alimentos_url,
        source?.alimentos_pdf_url,
      ]),
  );

const hasLodgingBenefit = (summary) => {
  const benefitType = String(
    summary?.tipo_beneficio ?? summary?.tipo_beneficio_label ?? "",
  )
    .trim()
    .toLowerCase();
  return (
    Number(summary?.tiene_hospedaje ?? 0) === 1 ||
    summary?.tiene_hospedaje === true ||
    benefitType.includes("hospedaje") ||
    Boolean(
      summary?.hotel ||
      summary?.tipo_habitacion ||
      summary?.fecha_check_in ||
      summary?.fecha_check_out ||
      summary?.tarifa_total_hospedaje ||
      summary?.orden_hospedaje_url,
    )
  );
};

export default function CashierProcessScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const {
    user,
    activateCashierQr,
    getAccessToken,
    getCashierDeliverySummary,
    getClientAvailableBalance,
    getClientQrActivationStatus,
    getClientQrData,
    getTable,
    presignClientQrActivation,
    presignCashierDeliveryExpediente,
    requestClientQrActivationS3,
    saveCashierDeliveryExpedienteS3,
    sendCashierActivationRequest,
  } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const routeMode = normalizeRouteParam(params?.mode).toLowerCase();
  const routeFolio = normalizeRouteParam(params?.folio);
  const [folio, setFolio] = useState(routeFolio);
  const [step, setStep] = useState(STEP_FOLIO);
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [isValidatingFolio, setIsValidatingFolio] = useState(false);
  const [isSavingExpediente, setIsSavingExpediente] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState(null);
  // Para extracción de CURP -------------------------------------------------
  const [isExtractingCurp, setIsExtractingCurp] = useState(false);
  const [, setExtractedCurp] = useState(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  // -------------------------------------------------------------------------
  const cameraRef = useRef(null);
  const signatureRef = useRef(null);
  const activationMode = routeMode === "client" ? "client" : "cashier";
  const isClientActivation =
    activationMode === "client" &&
    SELF_ACTIVATION_PROFILE_IDS.has(Number(user?.id_perfil ?? 0));
  const isNativeClientProfile =
    Number(user?.id_perfil ?? 0) === ROLE_IDS.CLIENT;
  const usesClientActivationEndpoints =
    isClientActivation && isNativeClientProfile;
  const requiresTiReviewAfterSelfService =
    isClientActivation && !isNativeClientProfile;
  const finishAndExit = () => {
    DeviceEventEmitter.emit("refreshClientQrActivationState");
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      if (step !== STEP_FOLIO) {
        setStep(STEP_FOLIO);
        setFrontPhoto(null);
        setBackPhoto(null);
        setSignatureDataUrl(null);
        setDeliverySummary(null);
        setFolio(routeFolio);
      }
    }, [routeFolio]),
  );

  const resetParam = useLocalSearchParams().reset;

  useEffect(() => {
    if (resetParam) {
      setStep(STEP_FOLIO);
      setFrontPhoto(null);
      setBackPhoto(null);
      setSignatureDataUrl(null);
      setDeliverySummary(null);
      setFolio(routeFolio);
    }
  }, [resetParam]);

  const confirmContinueActivation = (message) => {
    Alert.alert(
      "Continuar activacion",
      `${message}\n\n¿Continuar con la activacion?`,
      [
        {
          text: "No",
          style: "cancel",
        },
        {
          text: "Si",
          onPress: () => setStep(STEP_BACK),
        },
      ],
      { cancelable: true },
    );
  };
  const buildOrderPdfFileName = (orderType = "hospedaje") => {
    const safeFolio = String(
      deliverySummary?.folio ?? user?.id_usuario ?? Date.now(),
    )
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-");
    const safeOrderType =
      String(orderType ?? "hospedaje")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-") || "orden";
    return `orden-${safeOrderType}-${safeFolio}.pdf`;
  };

  const currentPhotoUri = useMemo(() => {
    if (step === STEP_FRONT) {
      return frontPhoto?.uri ?? null;
    }

    if (step === STEP_BACK) {
      return backPhoto?.uri ?? null;
    }

    return null;
  }, [backPhoto, frontPhoto, step]);

  if (
    !hasPermission(user?.id_perfil, "cashierProcess") &&
    !isClientActivation
  ) {
    return (
      <AccessDenied
        title="Proceso restringido"
        message="Solo cajero o los perfiles habilitados para autoactivación pueden iniciar este proceso documental."
      />
    );
  }

  const startDocumentCapture = async () => {
    if (!isClientActivation && !folio.trim()) {
      Alert.alert(
        "Atencion",
        "Captura el folio del interesado para continuar.",
      );
      return;
    }

    try {
      setIsValidatingFolio(true);
      if (isClientActivation) {
        if (isNativeClientProfile) {
          const [qrRecord, balance, folioRows] = await Promise.all([
            getClientQrData(user?.id_usuario, { includeInactive: true }),
            getClientAvailableBalance(user?.id_usuario).catch(() =>
              Number(user?.monto_deposito ?? user?.saldo ?? 0),
            ),
            getTable({
              tabla: "usuario_folio_entrega",
              where: {
                id_usuario: Number(user?.id_usuario ?? 0),
                activo: 1,
                visible: 1,
                tipo_folio: "titular",
              },
              order: "id_usuario_folio_entrega DESC",
              limit: 1,
            }),
          ]);

          let activationStatus = null;
          try {
            activationStatus = await getClientQrActivationStatus(
              user?.id_usuario,
            );
          } catch (statusError) {
            const normalizedMessage = String(
              statusError?.message ?? "",
            ).toLowerCase();
            if (normalizedMessage.includes("no tienes permisos")) {
              console.warn(
                "Cliente activacion status fallback:",
                statusError?.message ?? statusError,
              );
            } else {
              throw statusError;
            }
          }

          const qrOperativo =
            typeof qrRecord?.qr_operativo === "boolean"
              ? qrRecord.qr_operativo
              : Number(
                  activationStatus?.qr_activo ??
                    qrRecord?.qr_activo ??
                    user?.qr_activo ??
                    0,
                ) === 1;

          if (qrOperativo) {
            Alert.alert(
              "Atencion",
              "Tu QR ya se encuentra activo y listo para operar.",
            );
            router.back();
            return;
          }

          if (
            activationStatus &&
            resolveActivationStatus(activationStatus) === "pendiente"
          ) {
            Alert.alert(
              "Atencion",
              "Tu solicitud ya está en revisión por TI. Espera su resolución para continuar.",
            );
            router.back();
            return;
          }

          if (activationStatus && canRestartDocumentFlow(activationStatus)) {
            Alert.alert(
              "Atencion",
              buildActivationRetryMessage(activationStatus),
            );
          }

          const resolvedFolio =
            String(activationStatus?.folio ?? "").trim() ||
            routeFolio ||
            String(folioRows?.[0]?.folio ?? "").trim();

          if (!resolvedFolio) {
            throw new Error(
              "No se encontró un folio activo para este usuario.",
            );
          }

          setDeliverySummary({
            folio: resolvedFolio,
            id_usuario: user?.id_usuario,
            nombre_completo: [
              user?.nombre,
              user?.primer_apellido,
              user?.segundo_apellido,
            ]
              .filter(Boolean)
              .join(" "),
            codigo_qr: qrRecord?.codigo_qr ?? user?.codigo_qr ?? null,
            monto_total: Number(
              balance ?? user?.monto_deposito ?? user?.saldo ?? 0,
            ),
            monto_diario:
              activationStatus?.monto_diario ??
              qrRecord?.monto_diario ??
              user?.monto_diario ??
              null,
            dias_vigencia:
              activationStatus?.dias_vigencia ??
              qrRecord?.dias_vigencia ??
              user?.dias_vigencia ??
              null,
            tarifa_total:
              activationStatus?.tarifa_total ??
              qrRecord?.tarifa_total ??
              user?.tarifa_total ??
              balance ??
              user?.monto_deposito ??
              user?.saldo ??
              0,
            vigente_desde:
              qrRecord?.vigente_desde ?? user?.vigente_desde ?? null,
            vigente_hasta:
              qrRecord?.vigente_hasta ?? user?.vigente_hasta ?? null,
            nip: null,
            nip_legado_hash: false,
            qr_activo: Number(
              activationStatus?.qr_activo ??
                qrRecord?.qr_activo ??
                user?.qr_activo ??
                0,
            ),
            expediente_completo: activationStatus?.expediente_completo ?? false,
            solicitud_activacion_estatus:
              activationStatus?.solicitud_activacion_estatus ?? null,
            expediente_estatus: activationStatus?.expediente_estatus ?? null,
            motivo_rechazo: activationStatus?.motivo_rechazo ?? "",
            desglose_por_dia: [],
            ...mergeBenefitSummary(activationStatus, qrRecord, user),
          });
        } else {
          const [qrRecord, balance, folioRows] = await Promise.all([
            getClientQrData(user?.id_usuario, { includeInactive: true }),
            getClientAvailableBalance(user?.id_usuario).catch(() =>
              Number(user?.monto_deposito ?? user?.saldo ?? 0),
            ),
            getTable({
              tabla: "usuario_folio_entrega",
              where: {
                id_usuario: Number(user?.id_usuario ?? 0),
                activo: 1,
                visible: 1,
                tipo_folio: "titular",
              },
              order: "id_usuario_folio_entrega DESC",
              limit: 1,
            }),
          ]);

          const qrOperativo =
            typeof qrRecord?.qr_operativo === "boolean"
              ? qrRecord.qr_operativo
              : Number(qrRecord?.qr_activo ?? user?.qr_activo ?? 0) === 1;

          if (qrOperativo) {
            Alert.alert(
              "Atencion",
              "Tu QR ya se encuentra activo y listo para operar.",
            );
            router.back();
            return;
          }

          const resolvedFolio =
            routeFolio || String(folioRows?.[0]?.folio ?? "").trim();

          if (!resolvedFolio) {
            throw new Error(
              "No se encontró un folio activo para este usuario.",
            );
          }

          let richSummary = null;
          try {
            richSummary = await getCashierDeliverySummary(resolvedFolio);
          } catch (summaryError) {
            console.warn(
              "Cashier-style summary fallback:",
              summaryError?.message ?? summaryError,
            );
          }

          setDeliverySummary({
            folio: richSummary?.folio ?? resolvedFolio,
            id_usuario: richSummary?.id_usuario ?? user?.id_usuario,
            nombre_completo:
              richSummary?.nombre_completo ??
              [user?.nombre, user?.primer_apellido, user?.segundo_apellido]
                .filter(Boolean)
                .join(" "),
            codigo_qr:
              richSummary?.codigo_qr ??
              qrRecord?.codigo_qr ??
              user?.codigo_qr ??
              null,
            monto_total: Number(
              richSummary?.monto_total ??
                balance ??
                user?.monto_deposito ??
                user?.saldo ??
                0,
            ),
            monto_diario:
              richSummary?.monto_diario ??
              qrRecord?.monto_diario ??
              user?.monto_diario ??
              null,
            dias_vigencia:
              richSummary?.dias_vigencia ??
              qrRecord?.dias_vigencia ??
              user?.dias_vigencia ??
              null,
            tarifa_total:
              richSummary?.tarifa_total ??
              qrRecord?.tarifa_total ??
              user?.tarifa_total ??
              balance ??
              user?.monto_deposito ??
              user?.saldo ??
              0,
            vigente_desde:
              richSummary?.vigente_desde ??
              qrRecord?.vigente_desde ??
              user?.vigente_desde ??
              null,
            vigente_hasta:
              richSummary?.vigente_hasta ??
              qrRecord?.vigente_hasta ??
              user?.vigente_hasta ??
              null,
            nip: richSummary?.nip ?? null,
            nip_legado_hash: Boolean(richSummary?.nip_legado_hash ?? false),
            qr_activo: Number(qrRecord?.qr_activo ?? user?.qr_activo ?? 0),
            expediente_completo: false,
            solicitud_activacion_estatus: null,
            expediente_estatus: null,
            motivo_rechazo: "",
            desglose_por_dia: Array.isArray(richSummary?.desglose_por_dia)
              ? richSummary.desglose_por_dia
              : [],
            ...mergeBenefitSummary(richSummary, qrRecord, user),
          });

          if (richSummary && canRestartDocumentFlow(richSummary)) {
            Alert.alert("Atencion", buildActivationRetryMessage(richSummary));
          }
        }
      } else {
        const summary = await getCashierDeliverySummary(folio);
        setDeliverySummary(summary);

        if (summary && canRestartDocumentFlow(summary)) {
          Alert.alert("Atencion", buildActivationRetryMessage(summary));
        }
      }
    } catch (error) {
      console.error("Error validating cashier folio:", error);
      Alert.alert(
        "Atencion",
        error.message || "No se pudo validar el folio del interesado.",
      );
      return;
    } finally {
      setIsValidatingFolio(false);
    }

    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert(
          "Atencion",
          "Necesitamos permiso de camara para capturar el documento oficial.",
        );
        return;
      }
    }

    setStep(STEP_FRONT);
  };

  const captureDocumentSide = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      const picture = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        skipProcessing: false,
      });

      if (!picture?.uri) {
        throw new Error("No se obtuvo una imagen válida.");
      }

      // Obtenemos las dimensiones reales leyendo la imagen con ImageManipulator
      const imageInfo = await ImageManipulator.manipulateAsync(
        picture.uri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
      );

      const croppedUri = await cropToCardFrame(
        imageInfo.uri,
        imageInfo.width,
        imageInfo.height,
      );

      // Convertir el recorte a base64 para envío al backend
      const manipResult = await ImageManipulator.manipulateAsync(
        croppedUri,
        [],
        {
          compress: 0.92,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      if (!manipResult?.base64) {
        throw new Error("No se pudo convertir la imagen recortada.");
      }

      const photoPayload = {
        uri: manipResult.uri,
        dataUrl: `data:image/jpeg;base64,${manipResult.base64}`,
      };

      if (step === STEP_FRONT) {
        setFrontPhoto(photoPayload);
      } else if (step === STEP_BACK) {
        setBackPhoto(photoPayload);
      }
    } catch (error) {
      Alert.alert(
        "Atencion",
        error.message || "No se pudo capturar la fotografia.",
      );
    } finally {
      setIsCapturing(false);
    }
  };

  // Recorta la imagen capturada para que coincida exactamente con el marco visual
  const cropToCardFrame = async (uri, photoWidth, photoHeight) => {
    if (!cameraLayout.width || !cameraLayout.height) {
      throw new Error("Las dimensiones de la cámara no están listas.");
    }

    const viewWidth = cameraLayout.width;
    const viewHeight = cameraLayout.height;

    const scale = Math.max(viewWidth / photoWidth, viewHeight / photoHeight);

    const displayedWidth = photoWidth * scale;
    const displayedHeight = photoHeight * scale;

    const offsetX = (viewWidth - displayedWidth) / 2;
    const offsetY = (viewHeight - displayedHeight) / 2;

    const frameX = (viewWidth - CARD_FRAME_WIDTH) / 2;
    const frameY = viewHeight * 0.15;

    const cropX = Math.round((frameX - offsetX) / scale);
    const cropY = Math.round((frameY - offsetY) / scale);
    const cropWidth = Math.round(CARD_FRAME_WIDTH / scale);
    const cropHeight = Math.round(CARD_FRAME_HEIGHT / scale);

    const safeOriginX = Math.max(0, Math.min(cropX, photoWidth - cropWidth));
    const safeOriginY = Math.max(0, Math.min(cropY, photoHeight - cropHeight));
    const safeWidth = Math.min(cropWidth, photoWidth - safeOriginX);
    const safeHeight = Math.min(cropHeight, photoHeight - safeOriginY);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX: safeOriginX,
            originY: safeOriginY,
            width: safeWidth,
            height: safeHeight,
          },
        },
      ],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
    );

    return result.uri;
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

  // Función de procesamiento de OCR y validación con RENAPO
  const processOcrAndContinue = async () => {
    if (!frontPhoto?.uri) return;

    try {
      setIsExtractingCurp(true);
      const sessionToken = await getAccessToken();

      // 1. Petición al backend local para hacer el OCR
      const formData = new FormData();
      formData.append("ine_front", {
        uri:
          Platform.OS === "android"
            ? frontPhoto.uri
            : frontPhoto.uri.replace("file://", ""),
        type: "image/jpeg",
        name: "ine_front.jpg",
      });

      const response = await fetch(`${ENV.apiBaseUrl}/ocr-ine`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          // fetch genera 'Content-Type' automáticamente para multipart/form-data
        },
        body: formData,
      });

      const result = await response.json();

      // 2. Validar que el OCR tuvo éxito y nos devolvió una CURP
      if (result.success && result.data?.curp) {
        const curpObtenida = result.data.curp;
        setExtractedCurp(curpObtenida);

        // Configuramos un AbortController para cancelar la petición si tarda mucho.
        // Si el OCR leyó mal una letra, se tarda mucho buscando.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos límite

        try {
          const renapoParams = new URLSearchParams();
          renapoParams.append("curp", curpObtenida);

          // 3. Petición a la API de RENAPO
          const renapoResponse = await fetch(`${ENV.apiCurpUrl}/api-curp`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ENV.tokenApi}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: renapoParams.toString(),
            signal: controller.signal,
          });

          clearTimeout(timeoutId); // Limpiamos el timeout si respondió a tiempo
          const renapoResult = await renapoResponse.json();

          // 4. Evaluar la respuesta de RENAPO
          if (!renapoResult.error) {
            // Éxito: La CURP es válida
            Alert.alert(
              "Validación Exitosa",
              `CURP obtenida: ${curpObtenida}\n\n${renapoResult.respuesta || "CURP validado por RENAPO."}`,
              [{ text: "Continuar", onPress: () => setStep(STEP_BACK) }],
            );
          } else {
            // Error lógico: La API respondió rápido, pero la CURP no es válida
            confirmContinueActivation(
              `CURP obtenida por OCR: ${curpObtenida}\n\nRespuesta RENAPO: ${renapoResult.respuesta || "No se encontro en la base de datos."}\n\nSi se trata de un menor de edad, una persona extranjera con pasaporte u otro documento oficial, puedes continuar manualmente.`,
            );
          }
        } catch (renapoError) {
          clearTimeout(timeoutId);

          // 5. Manejo de Errores (Timeout o Red)
          if (renapoError.name === "AbortError") {
            confirmContinueActivation(
              `La validacion esta tardando demasiado. Esto suele ocurrir cuando la CURP se detecto incorrectamente por OCR.\n\nCURP obtenida: ${curpObtenida}\n\nPuedes repetir la foto o continuar manualmente si el documento corresponde a un menor de edad, una persona extranjera con pasaporte u otro documento oficial.`,
            );
          } else {
            confirmContinueActivation(
              `No se pudo conectar con el servicio de validacion.\nCURP obtenida: ${curpObtenida}\n\nPuedes repetir la foto o continuar manualmente si el documento corresponde a un menor de edad, una persona extranjera con pasaporte u otro documento oficial.`,
            );
          }
        }
      } else {
        // El OCR falló desde el inicio
        confirmContinueActivation(
          result.respuesta ||
            "No fue posible leer la CURP del documento. Verifica la iluminacion, la nitidez o continua manualmente si corresponde.",
        );
      }
    } catch (error) {
      console.error("Error en flujo OCR/RENAPO:", error);
      confirmContinueActivation(
        "Ocurrio un problema interno al procesar el documento. Puedes reintentar o continuar manualmente con la activacion.",
      );
    } finally {
      setIsExtractingCurp(false);
    }
  };

  const goToNextStep = () => {
    if (step === STEP_FRONT && frontPhoto?.uri) {
      Alert.alert(
        "Continuar activacion",
        "Intentaremos validar la CURP si el documento lo permite. Si se trata de un menor de edad, una persona extranjera con pasaporte u otro documento oficial, puedes continuar manualmente.\n\n¿Continuar con la activacion?",
        [
          {
            text: "Validar CURP",
            onPress: processOcrAndContinue,
          },
          {
            text: "Si",
            onPress: () => setStep(STEP_BACK),
          },
          {
            text: "No",
            style: "cancel",
          },
        ],
      );
      return;
    }

    if (step === STEP_BACK && backPhoto?.uri) {
      setStep(STEP_REVIEW);
      return;
    }

    if (step === STEP_REVIEW) {
      setSignatureModalVisible(true);
      return;
    }

    if (step === STEP_SUMMARY) {
      Alert.alert(
        "Fase 3 completada",
        "Ya tenemos folio, identificación y firma. El siguiente paso es guardar o enviar el expediente según el perfil.",
      );
    }
  };

  const handleSignatureConfirm = (signature) => {
    setSignatureDataUrl(signature);
    setSignatureModalVisible(false);
    setStep(STEP_SUMMARY);
  };

  const handleSignatureEmpty = () => {
    Alert.alert(
      "Atencion",
      "La firma está vacía. Solicita al interesado que firme antes de continuar.",
    );
  };

  const handleSignatureError = (error) => {
    Alert.alert("Atencion", error?.message || "No se pudo procesar la firma.");
  };

  const uploadDataUrlToSignedUrl = async (uploadConfig, dataUrl) => {
    if (!uploadConfig?.upload_url || !dataUrl) {
      throw new Error("Falta información para subir un archivo a S3.");
    }

    const base64Payload = String(dataUrl).split(",")[1] ?? "";
    if (!base64Payload) {
      throw new Error(
        "No se pudo convertir el archivo local para subirlo a S3.",
      );
    }

    const normalizedBase64 = base64Payload.replace(/\s/g, "");
    const binaryString =
      typeof atob === "function"
        ? atob(normalizedBase64)
        : global?.atob?.(normalizedBase64);

    if (!binaryString) {
      throw new Error("El entorno no pudo decodificar el archivo para S3.");
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    const uploadHeaders =
      uploadConfig?.headers && typeof uploadConfig.headers === "object"
        ? {
            "Content-Type":
              uploadConfig.headers["Content-Type"] ||
              uploadConfig.headers["content-type"],
          }
        : {};

    console.log("S3 upload target:", {
      tipo: uploadConfig.tipo,
      file_key: uploadConfig.file_key,
      localUriSize: bytes.length,
      headers: uploadHeaders,
      method: "PUT",
    });

    const uploadResponse = await fetch(uploadConfig.upload_url, {
      method: "PUT",
      headers: uploadHeaders,
      body: bytes,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `No se pudo subir ${uploadConfig.tipo || "el archivo"} a S3.`,
      );
    }

    return uploadConfig.file_key;
  };

  const saveExpediente = async () => {
    if (isSavingExpediente) {
      return;
    }

    if (!deliverySummary?.folio || !deliverySummary?.id_usuario) {
      Alert.alert(
        "Atención",
        "No contamos con el resumen del interesado para guardar el expediente.",
      );
      return;
    }

    if (!frontPhoto?.dataUrl || !backPhoto?.dataUrl || !signatureDataUrl) {
      Alert.alert(
        "Atencion",
        "Faltan evidencias por capturar antes de guardar el expediente.",
      );
      return;
    }

    if (usesClientActivationEndpoints) {
      try {
        setIsSavingExpediente(true);
        const presignResponse = await presignClientQrActivation({
          folio: deliverySummary.folio,
          id_usuario: deliverySummary.id_usuario,
          archivos: [
            { tipo: "anverso", mime_type: "image/jpeg" },
            { tipo: "reverso", mime_type: "image/jpeg" },
            { tipo: "firma", mime_type: "image/png" },
          ],
        });

        const uploads = Array.isArray(presignResponse?.data?.uploads)
          ? presignResponse.data.uploads
          : Array.isArray(presignResponse?.uploads)
            ? presignResponse.uploads
            : [];

        const anversoUpload = uploads.find((item) => item?.tipo === "anverso");
        const reversoUpload = uploads.find((item) => item?.tipo === "reverso");
        const firmaUpload = uploads.find((item) => item?.tipo === "firma");

        if (!anversoUpload || !reversoUpload || !firmaUpload) {
          throw new Error(
            "El backend no devolvió las URLs firmadas completas para la activación.",
          );
        }

        await Promise.all([
          uploadDataUrlToSignedUrl(anversoUpload, frontPhoto.dataUrl),
          uploadDataUrlToSignedUrl(reversoUpload, backPhoto.dataUrl),
          uploadDataUrlToSignedUrl(firmaUpload, signatureDataUrl),
        ]);

        const response = await requestClientQrActivationS3({
          folio: deliverySummary.folio,
          id_usuario: deliverySummary.id_usuario,
          anverso_key: anversoUpload.file_key,
          reverso_key: reversoUpload.file_key,
          firma_key: firmaUpload.file_key,
        });

        const mergedSummary = {
          ...(deliverySummary ?? {}),
          ...(response?.data ?? {}),
          ...mergeBenefitSummary(deliverySummary, response?.data, response),
        };
        setDeliverySummary(mergedSummary);
        showSuccessAlert(
          response?.respuesta ||
            "Solicitud enviada correctamente. Si TI la rechaza, podras volver a cargar documentos y reenviarla.",
          {
            hospedaje: resolveOrderUrl(response?.data, response, mergedSummary),
            alimentos: resolveFoodOrderUrl(
              response?.data,
              response,
              mergedSummary,
            ),
          },
        );
      } catch (error) {
        console.error("Error sending client activation request:", error);
        Alert.alert(
          "Atencion",
          error.message || "No se pudo enviar la solicitud de activación.",
        );
      } finally {
        setIsSavingExpediente(false);
      }

      return;
    }

    try {
      setIsSavingExpediente(true);
      const presignResponse = await presignCashierDeliveryExpediente({
        folio: deliverySummary.folio,
        id_usuario: deliverySummary.id_usuario,
        archivos: [
          { tipo: "anverso", mime_type: "image/jpeg" },
          { tipo: "reverso", mime_type: "image/jpeg" },
          { tipo: "firma", mime_type: "image/png" },
        ],
      });

      const uploads = Array.isArray(presignResponse?.data?.uploads)
        ? presignResponse.data.uploads
        : Array.isArray(presignResponse?.uploads)
          ? presignResponse.uploads
          : [];

      const anversoUpload = uploads.find((item) => item?.tipo === "anverso");
      const reversoUpload = uploads.find((item) => item?.tipo === "reverso");
      const firmaUpload = uploads.find((item) => item?.tipo === "firma");

      if (!anversoUpload || !reversoUpload || !firmaUpload) {
        throw new Error(
          "El backend no devolvió las URLs firmadas completas para el expediente.",
        );
      }

      await Promise.all([
        uploadDataUrlToSignedUrl(anversoUpload, frontPhoto.dataUrl),
        uploadDataUrlToSignedUrl(reversoUpload, backPhoto.dataUrl),
        uploadDataUrlToSignedUrl(firmaUpload, signatureDataUrl),
      ]);

      const response = await saveCashierDeliveryExpedienteS3({
        folio: deliverySummary.folio,
        id_usuario: deliverySummary.id_usuario,
        anverso_key: anversoUpload.file_key,
        reverso_key: reversoUpload.file_key,
        firma_key: firmaUpload.file_key,
      });

      const rawCanActivateQr =
        Number(
          response?.data?.puede_activar_qr ?? response?.puede_activar_qr ?? 0,
        ) === 1 ||
        response?.data?.puede_activar_qr === true ||
        response?.puede_activar_qr === true;
      const shouldActivateQr =
        !requiresTiReviewAfterSelfService && rawCanActivateQr;

      let finalResponse = response;

      if (shouldActivateQr) {
        finalResponse = await activateCashierQr({
          folio: deliverySummary.folio,
          id_usuario: deliverySummary.id_usuario,
          activo: 1,
        });
      } else if (requiresTiReviewAfterSelfService) {
        finalResponse = await sendCashierActivationRequest({
          folio: deliverySummary.folio,
          id_usuario: deliverySummary.id_usuario,
        });
      }

      const mergedSummary = {
        ...(deliverySummary ?? {}),
        ...(response?.data ?? {}),
        ...(finalResponse?.data ?? {}),
        ...mergeBenefitSummary(
          deliverySummary,
          response?.data,
          finalResponse?.data,
          finalResponse,
        ),
      };
      setDeliverySummary(mergedSummary);
      showSuccessAlert(
        requiresTiReviewAfterSelfService
          ? finalResponse?.respuesta ||
              "Tu expediente documental fue enviado correctamente. Ahora debes esperar la confirmación de TI para que tu QR quede activo."
          : finalResponse?.respuesta ||
              response?.respuesta ||
              "Expediente de entrega guardado correctamente.",
        {
          hospedaje: resolveOrderUrl(
            finalResponse?.data,
            finalResponse,
            response?.data,
            mergedSummary,
          ),
          alimentos: resolveFoodOrderUrl(
            finalResponse?.data,
            finalResponse,
            response?.data,
            mergedSummary,
          ),
        },
      );
    } catch (error) {
      console.error("Error saving cashier expediente:", error);
      Alert.alert(
        "Atencion",
        error.message || "No se pudo guardar el expediente.",
      );
    } finally {
      setIsSavingExpediente(false);
    }
  };

  const openOrderResource = async (resourceUrl, orderType = "hospedaje") => {
    if (!resourceUrl) {
      return;
    }

    try {
      const localFileUri = await downloadOrderPdfAuthenticated(
        resourceUrl,
        orderType,
      );
      const supported = await Linking.canOpenURL(localFileUri);
      if (!supported) {
        throw new Error(
          "No se pudo abrir el PDF localmente. Puedes compartirlo desde la app.",
        );
      }

      await Linking.openURL(localFileUri);
    } catch (error) {
      Alert.alert(
        "Atencion",
        error.message || `No se pudo abrir la orden de ${orderType}.`,
      );
    }
  };

  const shareOrderResource = async (resourceUrl, orderType = "hospedaje") => {
    if (!resourceUrl) {
      return;
    }

    try {
      const localFileUri = await downloadOrderPdfAuthenticated(
        resourceUrl,
        orderType,
      );
      await Share.share({
        title: `Orden de ${orderType}`,
        message: localFileUri,
        url: localFileUri,
      });
    } catch (error) {
      Alert.alert(
        "Atencion",
        error.message || `No se pudo compartir la orden de ${orderType}.`,
      );
    }
  };

  const downloadOrderPdfAuthenticated = async (
    resourceUrl,
    orderType = "hospedaje",
  ) => {
    const sessionToken = await getAccessToken();
    if (!sessionToken) {
      throw new Error(
        "No hay token de autenticación para descargar la orden de hospedaje.",
      );
    }

    const baseDirectory =
      FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDirectory) {
      throw new Error(
        "No se encontró un directorio local para guardar la orden de hospedaje.",
      );
    }

    const targetDirectory = `${baseDirectory}ordenes-${String(orderType).toLowerCase()}`;
    await FileSystem.makeDirectoryAsync(targetDirectory, {
      intermediates: true,
    }).catch(() => null);
    const fileUri = `${targetDirectory}/${buildOrderPdfFileName(orderType)}`;

    const downloadResult = await FileSystem.downloadAsync(
      resourceUrl,
      fileUri,
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          Accept: "application/pdf",
        },
      },
    );

    if (!downloadResult || Number(downloadResult.status ?? 0) >= 400) {
      throw new Error(
        "No se pudo descargar la orden de hospedaje autenticada.",
      );
    }

    return downloadResult.uri;
  };

  const showSuccessAlert = (message, orderUrls = {}) => {
    const buttons = [
      {
        text: "OK",
        onPress: finishAndExit,
      },
    ];

    if (orderUrls?.alimentos) {
      buttons.unshift(
        {
          text: "Compartir alimentos",
          onPress: () => {
            shareOrderResource(orderUrls.alimentos, "alimentos");
            finishAndExit();
          },
        },
        {
          text: "Abrir alimentos",
          onPress: () => {
            openOrderResource(orderUrls.alimentos, "alimentos");
            finishAndExit();
          },
        },
      );
    }

    if (orderUrls?.hospedaje) {
      buttons.unshift(
        {
          text: "Compartir hospedaje",
          onPress: () => {
            shareOrderResource(orderUrls.hospedaje, "hospedaje");
            finishAndExit();
          },
        },
        {
          text: "Abrir hospedaje",
          onPress: () => {
            openOrderResource(orderUrls.hospedaje, "hospedaje");
            finishAndExit();
          },
        },
      );
    }

    Alert.alert("Operacion exitosa", message, buttons);
  };

  const renderFolioStep = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.formStepWrapper}
      keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.formStepContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isClientActivation
              ? canRestartDocumentFlow(deliverySummary)
                ? "Vuelve a cargar documentos"
                : "Comienza tu activación"
              : "Folio del interesado"}
          </Text>
          <Text style={styles.cardDescription}>
            {isClientActivation
              ? canRestartDocumentFlow(deliverySummary)
                ? "Tu solicitud fue rechazada o regreso al inicio documental. Vuelve a cargar los documentos y reenvia la solicitud para continuar."
                : "Completa tu expediente documental para que TI revise y active tu QR."
              : "El cajero solo puede iniciar el tramite si la persona ya fue dada de alta por TI, cuenta con folio y esta lista para entrega."}
          </Text>

          {isClientActivation &&
          String(deliverySummary?.motivo_rechazo ?? "").trim() ? (
            <View style={styles.rejectionHint}>
              <Text style={styles.rejectionHintTitle}>Solicitud rechazada</Text>
              <Text style={styles.rejectionHintText}>
                {buildActivationRetryMessage(deliverySummary)}
              </Text>
            </View>
          ) : null}

          {!isClientActivation ? (
            <>
              <Text style={styles.inputLabel}>Folio</Text>
              <TextInput
                style={styles.input}
                value={folio}
                onChangeText={setFolio}
                placeholder="Captura el folio"
                placeholderTextColor="#7A7A7A"
                autoCapitalize="characters"
                returnKeyType="done"
              />
            </>
          ) : null}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              isValidatingFolio && styles.disabledButton,
            ]}
            onPress={startDocumentCapture}
            disabled={isValidatingFolio}
          >
            <Text style={styles.primaryButtonText}>
              {isValidatingFolio
                ? isClientActivation
                  ? "Preparando activacion..."
                  : "Validando folio..."
                : isClientActivation && canRestartDocumentFlow(deliverySummary)
                  ? "Volver a cargar documentos"
                  : "Continuar"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderCaptureStep = () => (
    <View style={styles.captureWrapper}>
      <Text style={styles.captureTitle}>
        {step === STEP_FRONT
          ? "Encuadra el anverso del documento oficial dentro del marco."
          : "Encuadra el reverso del documento oficial dentro del marco."}
      </Text>

      {currentPhotoUri ? (
        <Image
          source={{ uri: currentPhotoUri }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      ) : (
        <View
          style={styles.camera}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
          />

          <View style={styles.cameraOverlay} pointerEvents="none">
            <View style={styles.overlayTop} />

            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />

              <View style={styles.cardFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>

              <View style={styles.overlaySide} />
            </View>

            <View style={styles.overlayBottom}>
              <Text style={styles.overlayHint}>
                Mantén el documento plano y bien iluminado
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.captureActions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </TouchableOpacity>

        {currentPhotoUri ? (
          <>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={retakeCurrentSide}
            >
              <Text style={styles.secondaryButtonText}>Repetir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isExtractingCurp && styles.disabledButton,
              ]}
              onPress={goToNextStep}
              disabled={isExtractingCurp}
            >
              {isExtractingCurp ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Siguiente</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, isCapturing && styles.disabledButton]}
            onPress={captureDocumentSide}
            disabled={isCapturing}
          >
            <Text style={styles.primaryButtonText}>
              {isCapturing ? "Capturando..." : "Tomar fotografía"}
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
          Estas son las evidencias locales reunidas en las fases 1 y 2. El
          siguiente paso sera capturar la firma del interesado.
        </Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Folio</Text>
          <Text style={styles.summaryValue}>
            {deliverySummary?.folio || folio.trim()}
          </Text>
        </View>

        <Text style={styles.summarySectionTitle}>Anverso</Text>
        {frontPhoto?.uri ? (
          <Image
            source={{ uri: frontPhoto.uri }}
            style={styles.reviewImage}
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.summarySectionTitle}>Reverso</Text>
        {backPhoto?.uri ? (
          <Image
            source={{ uri: backPhoto.uri }}
            style={styles.reviewImage}
            resizeMode="cover"
          />
        ) : null}

        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(STEP_FRONT)}
          >
            <Text style={styles.secondaryButtonText}>Editar fotos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={goToNextStep}>
            <Text style={styles.primaryButtonText}>Firmar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  const renderSignatureModal = () => (
    <Modal
      visible={signatureModalVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setSignatureModalVisible(false)}
    >
      <SafeAreaView style={styles.signatureModalRoot}>
        <View style={styles.signatureScreen}>
          <View style={styles.signatureTopBar}>
            <View style={styles.signatureTopCopy}>
              <Text style={styles.signatureTopTitle}>Firma del interesado</Text>
              <Text style={styles.signatureTopSubtitle}>
                Toca Firmar para usar el lienzo completo. Guardar te llevará al
                resumen.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.signatureCloseButton}
              onPress={() => setSignatureModalVisible(false)}
            >
              <Text style={styles.signatureCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
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
              confirmText="Guardar"
              penColor="#263B80"
              backgroundColor="#FFFFFF"
              webStyle={`
                .m-signature-pad {
                  box-shadow: none;
                  border: none;
                  display: flex;
                  flex-direction: column;
                  height: 100vh;
                }
                .m-signature-pad--body {
                  flex: 1;
                  border: none;
                  touch-action: none;
                  overscroll-behavior: contain;
                }
                .m-signature-pad--body canvas {
                  width: 100% !important;
                  height: 100% !important;
                  touch-action: none;
                }
                .m-signature-pad--footer {
                  background: #FFFFFF;
                  border-top: 1px solid #E7ECF7;
                  padding: 10px 12px;
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
                  height: 100%;
                  overflow: hidden;
                  position: fixed;
                  width: 100%;
                  touch-action: none;
                  overscroll-behavior: contain;
                }
              `}
              webviewProps={{
                cacheEnabled: true,
                androidLayerType: "hardware",
                nestedScrollEnabled: false,
                scrollEnabled: false,
                showsVerticalScrollIndicator: false,
                overScrollMode: "never",
                bounces: false,
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );

  const renderSummaryStep = () => (
    <ScrollView contentContainerStyle={styles.reviewContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumen local del trámite</Text>
        <Text style={styles.cardDescription}>
          La app ya reunió folio, documento oficial y firma. A continuación se
          muestra el resumen real entregado por backend para el interesado.
        </Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Folio</Text>
          <Text style={styles.summaryValue}>
            {deliverySummary?.folio || folio.trim()}
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Interesado</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.nombre_completo || "Sin nombre disponible"}
            </Text>
          </View>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Tipo de beneficio</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.tipo_beneficio_label ||
                deliverySummary?.tipo_beneficio ||
                "Sin definir"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Tarifa total</Text>
            <Text style={styles.summaryMetricValue}>
              $
              {Number(
                deliverySummary?.tarifa_total ??
                  deliverySummary?.monto_total ??
                  0,
              ).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Monto diario</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.monto_diario !== null &&
              deliverySummary?.monto_diario !== undefined
                ? `$${Number(deliverySummary.monto_diario).toFixed(2)}`
                : "Sin definir"}
            </Text>
          </View>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Dias de vigencia</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.dias_vigencia !== null &&
              deliverySummary?.dias_vigencia !== undefined
                ? String(deliverySummary.dias_vigencia)
                : "Sin definir"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>QR del interesado</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.codigo_qr || "Sin QR disponible"}
            </Text>
          </View>
        </View>

        {hasLodgingBenefit(deliverySummary) ? (
          <>
            <Text style={styles.summarySectionTitle}>Hospedaje</Text>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>Hotel</Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.hotel || "Sin definir"}
                </Text>
              </View>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>
                  Tipo de habitacion
                </Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.tipo_habitacion || "Sin definir"}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>Check-in</Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.fecha_check_in || "Sin definir"}
                </Text>
              </View>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>Check-out</Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.fecha_check_out || "Sin definir"}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>Noches</Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.noches !== null &&
                  deliverySummary?.noches !== undefined
                    ? String(deliverySummary.noches)
                    : "Sin definir"}
                </Text>
              </View>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>Tarifa por noche</Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.tarifa_noche !== null &&
                  deliverySummary?.tarifa_noche !== undefined
                    ? `$${Number(deliverySummary.tarifa_noche).toFixed(2)}`
                    : "Sin definir"}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricLabel}>
                  Tarifa total hospedaje
                </Text>
                <Text style={styles.summaryMetricValue}>
                  {deliverySummary?.tarifa_total_hospedaje !== null &&
                  deliverySummary?.tarifa_total_hospedaje !== undefined
                    ? `$${Number(deliverySummary.tarifa_total_hospedaje).toFixed(2)}`
                    : "Sin definir"}
                </Text>
              </View>
            </View>

            {String(deliverySummary?.observaciones_hospedaje ?? "").trim() ? (
              <View style={styles.summaryGrid}>
                <View style={styles.summaryMetricCard}>
                  <Text style={styles.summaryMetricLabel}>
                    Observaciones hospedaje
                  </Text>
                  <Text style={styles.summaryMetricValue}>
                    {String(deliverySummary.observaciones_hospedaje).trim()}
                  </Text>
                </View>
              </View>
            ) : null}

            {resolveOrderUrl(deliverySummary) ? (
              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    openOrderResource(
                      resolveOrderUrl(deliverySummary),
                      "hospedaje",
                    )
                  }
                >
                  <Text style={styles.secondaryButtonText}>
                    Orden hospedaje
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    shareOrderResource(
                      resolveOrderUrl(deliverySummary),
                      "hospedaje",
                    )
                  }
                >
                  <Text style={styles.secondaryButtonText}>
                    Compartir hospedaje
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}

        {(Number(deliverySummary?.tiene_alimentos ?? 0) === 1 ||
          deliverySummary?.tiene_alimentos === true ||
          resolveFoodOrderUrl(deliverySummary)) ? (
          <>
            <Text style={styles.summarySectionTitle}>Alimentos</Text>

            {resolveFoodOrderUrl(deliverySummary) ? (
              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    openOrderResource(
                      resolveFoodOrderUrl(deliverySummary),
                      "alimentos",
                    )
                  }
                >
                  <Text style={styles.secondaryButtonText}>
                    Orden alimentos
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    shareOrderResource(
                      resolveFoodOrderUrl(deliverySummary),
                      "alimentos",
                    )
                  }
                >
                  <Text style={styles.secondaryButtonText}>
                    Compartir alimentos
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.summaryGrid}>
                <View style={styles.summaryMetricCard}>
                  <Text style={styles.summaryMetricLabel}>Orden alimentos</Text>
                  <Text style={styles.summaryMetricValue}>
                    Disponible cuando backend publique una URL valida.
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : null}

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Vigente desde</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.vigente_desde || "Sin definir"}
            </Text>
          </View>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>Vigente hasta</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.vigente_hasta || "Sin definir"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetricCard}>
            <Text style={styles.summaryMetricLabel}>NIP</Text>
            <Text style={styles.summaryMetricValue}>
              {deliverySummary?.nip_legado_hash
                ? "NIP legado, requiere regeneración"
                : deliverySummary?.nip || "Sin NIP disponible"}
            </Text>
          </View>
        </View>

        {isClientActivation ? (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryMetricCard}>
              <Text style={styles.summaryMetricLabel}>
                Estatus de expediente
              </Text>
              <Text style={styles.summaryMetricValue}>
                {deliverySummary?.expediente_estatus ||
                  "Sin estatus disponible"}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.summarySectionTitle}>Anverso</Text>
        {frontPhoto?.uri ? (
          <Image
            source={{ uri: frontPhoto.uri }}
            style={styles.reviewImage}
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.summarySectionTitle}>Reverso</Text>
        {backPhoto?.uri ? (
          <Image
            source={{ uri: backPhoto.uri }}
            style={styles.reviewImage}
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.summarySectionTitle}>Firma</Text>
        {signatureDataUrl ? (
          <Image
            source={{ uri: signatureDataUrl }}
            style={styles.signaturePreview}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.signaturePlaceholder}>
            <Text style={styles.signaturePlaceholderText}>
              Aún no hay firma capturada.
            </Text>
          </View>
        )}

        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setSignatureModalVisible(true);
            }}
          >
            <Text style={styles.secondaryButtonText}>Repetir firma</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.summaryPrimaryAction,
              isSavingExpediente && styles.disabledButton,
            ]}
            onPress={saveExpediente}
            disabled={isSavingExpediente}
          >
            <Text style={styles.primaryButtonText}>
              {isSavingExpediente
                ? "Guardando expediente..."
                : isClientActivation
                  ? "Enviar solicitud"
                  : "Guardar expediente"}
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
        <Text style={styles.eyebrow}>
          {isClientActivation ? "Activacion de cliente" : "Perfil cajero"}
        </Text>
        <Text style={styles.title}>{buildStepTitle(step)}</Text>
        <Text style={styles.subtitle}>
          {isClientActivation
            ? "Completa tu expediente documental para solicitar la activacion de tu QR."
            : "Completa el expediente documental para la entrega segura del QR."}
        </Text>
      </View>

      {step === STEP_FOLIO ? renderFolioStep() : null}
      {step === STEP_FRONT || step === STEP_BACK ? renderCaptureStep() : null}
      {step === STEP_REVIEW ? renderReviewStep() : null}
      {renderSignatureModal()}
      {step === STEP_SUMMARY ? renderSummaryStep() : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  formStepWrapper: {
    flex: 1,
  },
  formStepContent: {
    flexGrow: 1,
    paddingVertical: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  eyebrow: {
    color: "#B23A48",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    color: "#263B80",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#5F6782",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  card: {
    margin: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#D7DEEE",
    shadowColor: "#0D1B2A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    color: "#263B80",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  cardDescription: {
    color: "#49516A",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  rejectionHint: {
    backgroundColor: "#FFF4F5",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E9BBC2",
    marginBottom: 18,
  },
  rejectionHintTitle: {
    color: "#B23A48",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  rejectionHintText: {
    color: "#7B3943",
    fontSize: 14,
    lineHeight: 20,
  },
  inputLabel: {
    color: "#263B80",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#C9D3EA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#263B80",
    backgroundColor: "#F7F9FE",
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "#263B80",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#263B80",
  },
  secondaryButtonText: {
    color: "#263B80",
    fontSize: 15,
    fontWeight: "700",
  },
  captureWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  captureTitle: {
    color: "#263B80",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  captureSubtitle: {
    color: "#5F6782",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  camera: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#1F2430",
  },
  previewImage: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#E9EDF6",
  },
  captureActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingTop: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  reviewContent: {
    paddingBottom: 24,
  },
  summaryBox: {
    backgroundColor: "#F7F9FE",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  summaryLabel: {
    color: "#5F6782",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryValue: {
    color: "#263B80",
    fontSize: 18,
    fontWeight: "800",
  },
  summaryGrid: {
    gap: 10,
    marginBottom: 12,
  },
  summaryMetricCard: {
    backgroundColor: "#F7F9FE",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F4",
  },
  summaryMetricLabel: {
    color: "#5F6782",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryMetricValue: {
    color: "#263B80",
    fontSize: 15,
    fontWeight: "700",
  },
  summarySectionTitle: {
    color: "#263B80",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 8,
  },
  reviewImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#E9EDF6",
    marginBottom: 14,
  },
  reviewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 8,
  },
  summaryPrimaryAction: {
    minWidth: 180,
  },
  signatureScreen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  signatureModalRoot: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  signatureTopBar: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7DEEE",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    shadowColor: "#0D1B2A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  signatureTopCopy: {
    flex: 1,
  },
  signatureTopTitle: {
    color: "#263B80",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 6,
  },
  signatureTopSubtitle: {
    color: "#49516A",
    fontSize: 14,
    lineHeight: 20,
  },
  signatureCloseButton: {
    borderWidth: 1,
    borderColor: "#263B80",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  signatureCloseButtonText: {
    color: "#263B80",
    fontSize: 13,
    fontWeight: "700",
  },
  signatureWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D7DEEE",
    marginTop: 4,
    shadowColor: "#0D1B2A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  signaturePreview: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7DEEE",
    marginBottom: 14,
  },
  signaturePlaceholder: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D7DEEE",
    backgroundColor: "#F7F9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  signaturePlaceholderText: {
    color: "#5F6782",
    fontSize: 14,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  // Estilos del overlay de cámara con marco de credencial
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  overlayTop: {
    height: "15%",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: CARD_FRAME_HEIGHT,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    paddingTop: 14,
  },
  overlayHint: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.85,
  },
  cardFrame: {
    width: CARD_FRAME_WIDTH,
    height: CARD_FRAME_HEIGHT,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#FFFFFF",
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
});
