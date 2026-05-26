import { useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ClientQRGenerator from "../../components/ClientQRGenerator";
import {
  getRoleConfig,
  getRoleLabel,
  isConsumerProfile,
  isInstitutionalPortalProfile,
  resolveInstitutionalPartida,
  ROLE_IDS,
} from "../../constants/roles";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";

const ADMIN_FILTERS = [
  { id: 0, label: "Todos" },
  { id: ROLE_IDS.ADMIN, label: "TI" },
  { id: ROLE_IDS.PROVIDER, label: "Proveedor" },
  { id: ROLE_IDS.CLIENT, label: "Cliente" },
  { id: ROLE_IDS.MANAGER, label: "Gestor" },
  { id: ROLE_IDS.BUSINESS_MANAGER, label: "Gerente" },
  { id: ROLE_IDS.RECEPTION, label: "Recepcion" },
  { id: ROLE_IDS.SECUL, label: "SECUL" },
  { id: ROLE_IDS.FIC, label: "FIC" },
  { id: ROLE_IDS.UG, label: "UG" },
];

const buildAdminOverviewCards = () => [
  {
    key: "partidas",
    title: "Partidas",
    description:
      "Consulta el resumen administrativo y la informacion asociada a partidas institucionales.",
  },
  {
    key: "usuarios",
    title: "Usuarios",
    description:
      "Consulta usuarios, su perfil, establecimiento y estado de QR.",
  },
  {
    key: "establecimientos",
    title: "Establecimientos",
    description:
      "Acceso de referencia a participantes y establecimientos del ecosistema. En hoteles, el mantenimiento debe entenderse como consulta y ajuste de tarifas, no como CRUD completo.",
  },
  {
    key: "pagos",
    title: "Pagos",
    description:
      "Consulta pagos registrados, montos, totales y trazabilidad operativa.",
  },
  {
    key: "solicitudes",
    title: "Solicitudes",
    description: "Revisa solicitudes de activacion QR pendientes de atencion.",
  },
  {
    key: "reportes",
    title: "Reportes",
    description: "Consulta reportes de pagos y da seguimiento a su resolucion.",
  },
  {
    key: "movimientos_hospedaje",
    title: "Movimientos de hospedaje",
    description:
      "Vista de referencia para el flujo hotelero y sus movimientos asociados.",
  },
];

const buildAdminCards = () => [
  {
    key: "reports",
    title: "Reportes y pagos",
    description:
      "Consulta reportes de pagos, pagos registrados y solicitudes de activacion QR.",
  },
];

const buildFullName = (record) =>
  [record?.nombre, record?.primer_apellido, record?.segundo_apellido]
    .filter(Boolean)
    .join(" ")
    .trim() || "Sin nombre";

const getRecordTimestamp = (record) =>
  new Date(
    record?.fec_reg ??
      record?.createdAt ??
      record?.date ??
      record?.fecha_movimiento ??
      0,
  ).getTime();

const getSafeReportIdLabel = (record) =>
  record?.report_identifier_label ||
  (Number.isFinite(Number(record?.id_reporte)) && Number(record.id_reporte) > 0
    ? `#${Number(record.id_reporte)}`
    : "Inconsistente");

const getSafePaymentIdLabel = (record) =>
  record?.payment_identifier_label ||
  (Number.isFinite(Number(record?.id_pagos)) && Number(record.id_pagos) > 0
    ? `#${Number(record.id_pagos)}`
    : "Inconsistente");

const getUserTarifaDiariaLabel = (record) =>
  String(
    record?.tarifa_diaria_label ??
      record?.dsc_tarifa_diaria ??
      record?.tarifa_diaria ??
      record?.tarifaDiaria ??
      record?.nivel_label ??
      record?.dsc_nivel ??
      record?.nivel ??
      "",
  ).trim() || "Sin tarifa diaria";

const getUserPartidaLabel = (record) =>
  String(
    record?.partida_label ??
      record?.dsc_partida ??
      record?.nombre_partida ??
      record?.clave_partida ??
      record?.partida ??
      record?.id_partida ??
      "",
  ).trim() || "Sin partida";

const getUserFolioLabel = (record) =>
  String(record?.folio_entrega ?? record?.folio ?? "").trim() || "Sin folio";

const getUserSubfolioLabel = (record) =>
  String(record?.subfolio_entrega ?? record?.subfolio ?? "").trim() ||
  "Sin subfolio";

const GENERIC_ESTABLISHMENT_LABELS = new Set([
  "establecimiento",
  "establecimiento asignado",
  "sin establecimiento",
]);

const getEstablishmentDisplayName = (record) =>
  record?.dsc_establecimiento ??
  record?.establecimiento_nombre ??
  record?.nombre ??
  record?.name ??
  "Establecimiento asignado";

const isGenericEstablishmentLabel = (value) =>
  GENERIC_ESTABLISHMENT_LABELS.has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );

const REPORTS_RETRY_COOLDOWN_MS = 60000;

export default function HomeScreen() {
  const {
    user,
    activeEstablecimientoId,
    setActiveEstablecimiento,
    getClientAvailableBalance,
    getTable,
    getTablePage,
    getTiQrActivationRequests,
    approveTiQrActivationRequest,
    rejectTiQrActivationRequest,
  } = useAuth();
  const { getPaymentReports, updatePaymentReportStatus } = useApi();
  const router = useRouter();
  const lastClientBalanceRefreshRef = useRef(0);
  const getClientAvailableBalanceRef = useRef(getClientAvailableBalance);
  const loadPaymentsViewRef = useRef(null);
  const loadReportsViewRef = useRef(null);
  const reportsEndpointUnavailableRef = useRef(false);
  const reportsRetryAtRef = useRef(0);

  const [clientBalance, setClientBalance] = useState(
    user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null,
  );
  const [usersView, setUsersView] = useState([]);
  const [paymentsView, setPaymentsView] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [reportsView, setReportsView] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsEndpointUnavailable, setReportsEndpointUnavailable] =
    useState(false);
  const [activationRequestsView, setActivationRequestsView] = useState([]);
  const [loadingActivationRequests, setLoadingActivationRequests] =
    useState(false);
  const [activationRequestsSearch, setActivationRequestsSearch] = useState("");
  const [visibleActivationRequestsCount, setVisibleActivationRequestsCount] =
    useState(10);
  const [rejectActivationModalVisible, setRejectActivationModalVisible] =
    useState(false);
  const [rejectActivationTarget, setRejectActivationTarget] = useState(null);
  const [rejectActivationReason, setRejectActivationReason] = useState("");
  const [savingActivationDecision, setSavingActivationDecision] =
    useState(false);
  const [providerEstablishmentsView, setProviderEstablishmentsView] = useState(
    [],
  );
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(0);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize] = useState(10);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSortField, setUsersSortField] = useState("id_usuario");
  const [usersSortOrder, setUsersSortOrder] = useState("desc");
  const [visiblePaymentsCount, setVisiblePaymentsCount] = useState(10);
  const [visibleReportsCount, setVisibleReportsCount] = useState(10);
  const [paymentsSearch, setPaymentsSearch] = useState("");
  const [reportsSearch, setReportsSearch] = useState("");
  const [refreshingHome, setRefreshingHome] = useState(false);

  const roleConfig = getRoleConfig(user?.id_perfil);
  const isProvider =
    user?.id_perfil === ROLE_IDS.PROVIDER ||
    user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isClient = isConsumerProfile(user?.id_perfil);
  const isInstitutionalPortal = isInstitutionalPortalProfile(user?.id_perfil);
  const isAdmin = user?.id_perfil === ROLE_IDS.ADMIN;
  const isManagerProfile = user?.id_perfil === ROLE_IDS.MANAGER;
  const isCashier = user?.id_perfil === ROLE_IDS.CASHIER;
  const isReception = user?.id_perfil === ROLE_IDS.RECEPTION;
  const isAdminOrManager = isAdmin || isManagerProfile;
  const effectiveInstitutionalPartida = useMemo(
    () => resolveInstitutionalPartida(user),
    [user],
  );
  const institutionalPartidaLabel =
    effectiveInstitutionalPartida?.clave_partida ||
    effectiveInstitutionalPartida?.nombre_partida ||
    "Partida asignada";
  const baseProviderEstablishments = useMemo(() => {
    const rawList =
      user?.establecimientos ??
      user?.assignedEstablishments ??
      user?.proveedorEstablecimientos ??
      user?.establishments ??
      [];

    if (Array.isArray(rawList) && rawList.length > 0) {
      return rawList
        .map((establecimiento) => ({
          ...establecimiento,
          id_establecimiento:
            establecimiento?.id_establecimiento ??
            establecimiento?.idEstablecimiento ??
            establecimiento?.id ??
            null,
          dsc_establecimiento: getEstablishmentDisplayName(establecimiento),
        }))
        .filter(
          (establecimiento) => establecimiento.id_establecimiento !== null,
        );
    }

    return [];
  }, [user]);

  const providerEstablishments =
    providerEstablishmentsView.length > 0
      ? providerEstablishmentsView
      : baseProviderEstablishments;

  useEffect(() => {
    setClientBalance(
      user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null,
    );
  }, [user?.saldo, user?.saldo_actual, user?.saldoDisponible]);

  const loadUsersView = useCallback(async () => {
    if (!isAdminOrManager) {
      return;
    }

    try {
      setLoadingUsers(true);

      const response = await getTablePage({
        tabla: "usuario",
        where: { visible: 1 },
        offset: Math.max(usersPage - 1, 0) * usersPageSize,
        limit: usersPageSize,
        search: usersSearch.trim(),
        sort: usersSortField,
        order: usersSortOrder,
        perfil: Number(selectedRoleFilter) > 0 ? Number(selectedRoleFilter) : null,
        preview: isManagerProfile ? 1 : 0,
      });

      setUsersView(
        response.rows.map((usuarioRecord) => ({
          ...usuarioRecord,
          fullName:
            String(usuarioRecord?.nombre_completo ?? "").trim() ||
            buildFullName(usuarioRecord),
          roleLabel:
            String(usuarioRecord?.perfil_label ?? "").trim() ||
            getRoleLabel(usuarioRecord.id_perfil),
          tarifaDiariaLabel: getUserTarifaDiariaLabel(usuarioRecord),
          partidaLabel: getUserPartidaLabel(usuarioRecord),
          folioEntregaLabel: getUserFolioLabel(usuarioRecord),
          subfolioEntregaLabel: getUserSubfolioLabel(usuarioRecord),
          establecimientoLabel:
            String(usuarioRecord?.establecimiento_label ?? "").trim() ||
            "Sin establecimiento",
          hasActiveQr:
            Number(usuarioRecord?.qr_activo ?? 0) === 1 ||
            Boolean(String(usuarioRecord?.codigo_qr ?? "").trim()),
        })),
      );
      setUsersTotal(Number(response.total ?? 0));
    } catch (error) {
      console.error("Error loading users view:", error);
      setUsersView([]);
      setUsersTotal(0);
    } finally {
      setLoadingUsers(false);
    }
  }, [
    getTablePage,
    isAdminOrManager,
    isManagerProfile,
    selectedRoleFilter,
    usersPage,
    usersPageSize,
    usersSearch,
    usersSortField,
    usersSortOrder,
  ]);

  const loadProviderEstablishmentsView = useCallback(async () => {
    if (!isProvider || baseProviderEstablishments.length === 0) {
      setProviderEstablishmentsView([]);
      return;
    }

    const hasGenericLabel = baseProviderEstablishments.some((establecimiento) =>
      isGenericEstablishmentLabel(establecimiento.dsc_establecimiento),
    );

    if (!hasGenericLabel) {
      setProviderEstablishmentsView(baseProviderEstablishments);
      return;
    }

    try {
      const establecimientos = await getTable({
        tabla: "establecimiento",
        where: { visible: 1 },
        order: "dsc_establecimiento ASC",
      });

      const establecimientosMap = establecimientos.reduce(
        (accumulator, establecimiento) => {
          accumulator[String(establecimiento.id_establecimiento)] =
            establecimiento;
          return accumulator;
        },
        {},
      );

      setProviderEstablishmentsView(
        baseProviderEstablishments.map((establecimiento) => {
          const matchedEstablishment =
            establecimientosMap[
              String(establecimiento.id_establecimiento ?? "")
            ];
          const displayName = getEstablishmentDisplayName(
            matchedEstablishment ?? establecimiento,
          );

          return {
            ...establecimiento,
            dsc_establecimiento: displayName,
          };
        }),
      );
    } catch (error) {
      console.error("Error loading provider establishments:", error);
      setProviderEstablishmentsView(baseProviderEstablishments);
    }
  }, [baseProviderEstablishments, getTable, isProvider]);

  const loadPaymentsView = useCallback(async () => {
    if (!isAdminOrManager) {
      return;
    }

    try {
      setLoadingPayments(true);

      const [pagos, usuarios, establecimientos, tiposPago] = await Promise.all([
        getTable({
          tabla: "pagos",
          where: { visible: 1 },
          order: "fec_reg DESC",
        }),
        getTable({
          tabla: "usuario",
          where: { visible: 1 },
        }),
        getTable({
          tabla: "establecimiento",
          where: { visible: 1 },
        }),
        getTable({
          tabla: "cat_tipo_pago",
          where: { visible: 1 },
        }),
      ]);

      const usuariosMap = usuarios.reduce((accumulator, record) => {
        accumulator[String(record.id_usuario)] = buildFullName(record);
        return accumulator;
      }, {});

      const establecimientosMap = establecimientos.reduce(
        (accumulator, record) => {
          accumulator[String(record.id_establecimiento)] =
            record.dsc_establecimiento || "Sin establecimiento";
          return accumulator;
        },
        {},
      );

      const tiposPagoMap = tiposPago.reduce((accumulator, record) => {
        accumulator[String(record.id_tipo_pago)] =
          record.dsc_tipo_pago || "Sin tipo";
        return accumulator;
      }, {});

      const normalizedPayments = pagos
        .map((paymentRecord) => ({
          ...paymentRecord,
          usuarioLabel:
            usuariosMap[String(paymentRecord.id_usuario ?? "")] ||
            "Sin usuario",
          establecimientoLabel:
            establecimientosMap[
              String(paymentRecord.id_establecimiento ?? "")
            ] || "Sin establecimiento",
          tipoPagoLabel:
            tiposPagoMap[String(paymentRecord.id_tipo_pago ?? "")] ||
            "Sin tipo",
        }))
        .sort(
          (first, second) =>
            getRecordTimestamp(second) - getRecordTimestamp(first),
        );

      setPaymentsView(normalizedPayments);
      setVisiblePaymentsCount(10);
    } catch (error) {
      console.error("Error loading payments view:", error);
      setPaymentsView([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [getTable, isAdminOrManager]);

  const loadReportsView = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    const now = Date.now();
    if (
      reportsEndpointUnavailableRef.current &&
      reportsRetryAtRef.current &&
      now < reportsRetryAtRef.current
    ) {
      return;
    }

    try {
      setLoadingReports(true);

      const [reportsResponse, usuarios, establecimientos] = await Promise.all([
        getPaymentReports(),
        getTable({
          tabla: "usuario",
          where: { visible: 1 },
        }),
        getTable({
          tabla: "establecimiento",
          where: { visible: 1 },
        }),
      ]);

      const reportRows = Array.isArray(reportsResponse?.data)
        ? reportsResponse.data
        : [];

      const usuariosMap = usuarios.reduce((accumulator, record) => {
        accumulator[String(record.id_usuario)] = buildFullName(record);
        return accumulator;
      }, {});

      const establecimientosMap = establecimientos.reduce(
        (accumulator, record) => {
          accumulator[String(record.id_establecimiento)] =
            record.dsc_establecimiento || "Sin establecimiento";
          return accumulator;
        },
        {},
      );

      setReportsView(
        reportRows.map((reportRecord) => ({
          ...reportRecord,
          usuarioLabel:
            usuariosMap[String(reportRecord.id_usuario ?? "")] || "Sin usuario",
          establecimientoLabel:
            establecimientosMap[
              String(reportRecord.id_establecimiento ?? "")
            ] || "Sin establecimiento",
          qaInconsistencyLabel: reportRecord?.has_inconsistent_identifiers
            ? "Identificadores inconsistentes detectados por backend."
            : "",
        })),
      );
      setVisibleReportsCount(10);
      reportsEndpointUnavailableRef.current = false;
      reportsRetryAtRef.current = 0;
      setReportsEndpointUnavailable(false);
    } catch (error) {
      console.log("Reportes no disponibles:", error?.message || error);
      if (
        String(error?.message || "").includes(
          "Revisa la ruta GET /api/reportes",
        ) ||
        String(error?.message || "").includes(
          "Consultando reportes devolvio una respuesta no valida",
        )
      ) {
        reportsEndpointUnavailableRef.current = true;
        reportsRetryAtRef.current = Date.now() + REPORTS_RETRY_COOLDOWN_MS;
        setReportsEndpointUnavailable(true);
      }
      setReportsView([]);
    } finally {
      setLoadingReports(false);
    }
  }, [getPaymentReports, getTable, isAdmin]);

  const loadActivationRequestsView = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    try {
      setLoadingActivationRequests(true);

      const requestRows = await getTiQrActivationRequests();

      setActivationRequestsView(
        requestRows.map((requestRecord) => ({
          ...requestRecord,
          fullName:
            String(requestRecord?.nombre_completo ?? "").trim() ||
            buildFullName(requestRecord),
        })),
      );
      setVisibleActivationRequestsCount(10);
    } catch (error) {
      console.error("Error loading activation requests view:", error);
      setActivationRequestsView([]);
    } finally {
      setLoadingActivationRequests(false);
    }
  }, [getTiQrActivationRequests, isAdmin]);

  useEffect(() => {
    getClientAvailableBalanceRef.current = getClientAvailableBalance;
  }, [getClientAvailableBalance]);

  useEffect(() => {
    if (!isAdminOrManager) {
      return;
    }

    loadUsersView();
  }, [isAdminOrManager, loadUsersView]);

  useEffect(() => {
    loadPaymentsViewRef.current = loadPaymentsView;
  }, [loadPaymentsView]);

  useEffect(() => {
    loadReportsViewRef.current = loadReportsView;
  }, [loadReportsView]);

  const loadActivationRequestsViewRef = useRef(null);

  useEffect(() => {
    loadActivationRequestsViewRef.current = loadActivationRequestsView;
  }, [loadActivationRequestsView]);

  useEffect(() => {
    if (!isAdmin) {
      reportsEndpointUnavailableRef.current = false;
      setReportsEndpointUnavailable(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "refreshClientBalanceNow",
      async () => {
        if (!isClient || !user?.id_usuario) {
          return;
        }

        try {
          const balance = await getClientAvailableBalanceRef.current(
            user.id_usuario,
          );
          setClientBalance(balance);
          lastClientBalanceRefreshRef.current = Date.now();
        } catch (balanceError) {
          console.error(
            "Error refreshing client balance from event:",
            balanceError,
          );
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [isClient, user?.id_usuario]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const refreshBalanceOnFocus = async () => {
        if (!isClient || !user?.id_usuario) {
          return;
        }

        try {
          const balance = await getClientAvailableBalanceRef.current(
            user.id_usuario,
          );

          if (isMounted) {
            setClientBalance(balance);
            lastClientBalanceRefreshRef.current = Date.now();
          }
        } catch (balanceError) {
          console.error(
            "Error refreshing client balance on focus:",
            balanceError,
          );
        }
      };

      refreshBalanceOnFocus();

      if (isProvider) {
        loadProviderEstablishmentsView();
      }

      if (isAdminOrManager) {
        loadPaymentsViewRef.current?.();
      }

      if (isAdmin) {
        loadReportsViewRef.current?.();
        loadActivationRequestsViewRef.current?.();
      }

      return () => {
        isMounted = false;
      };
    }, [
      isAdmin,
      isAdminOrManager,
      isClient,
      isProvider,
      loadProviderEstablishmentsView,
      user?.id_usuario,
    ]),
  );

  const refreshHomeData = useCallback(async () => {
    try {
      setRefreshingHome(true);

      if (isClient && user?.id_usuario) {
        const balance = await getClientAvailableBalanceRef.current(
          user.id_usuario,
        );
        setClientBalance(balance);
        lastClientBalanceRefreshRef.current = Date.now();
      }

      if (isProvider) {
        await loadProviderEstablishmentsView();
      }

      if (isAdminOrManager) {
        await Promise.all([
          loadUsersView(),
          loadPaymentsViewRef.current?.(),
        ]);
      }

      if (isAdmin) {
        await Promise.all([
          loadReportsViewRef.current?.(),
          loadActivationRequestsViewRef.current?.(),
        ]);
      }
    } catch (error) {
      console.error("Error refreshing home data:", error);
      Alert.alert(
        "Atenci\u00f3n",
        error.message || "No se pudo actualizar la informacion.",
      );
    } finally {
      setRefreshingHome(false);
    }
  }, [
    isAdmin,
    isAdminOrManager,
    isClient,
    isProvider,
    loadUsersView,
    loadProviderEstablishmentsView,
    user?.id_usuario,
  ]);

  const usersTotalPages = useMemo(
    () => Math.max(1, Math.ceil(Number(usersTotal ?? 0) / usersPageSize)),
    [usersPageSize, usersTotal],
  );

  const filteredPayments = useMemo(() => {
    const normalizedSearch = paymentsSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return paymentsView;
    }

    return paymentsView.filter((record) =>
      [
        record?.id_pagos,
        record?.usuarioLabel,
        record?.establecimientoLabel,
        record?.tipoPagoLabel,
        record?.monto,
        record?.total,
        record?.fec_reg,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [paymentsSearch, paymentsView]);

  const visiblePayments = useMemo(
    () => filteredPayments.slice(0, visiblePaymentsCount),
    [filteredPayments, visiblePaymentsCount],
  );

  const filteredReports = useMemo(() => {
    const normalizedSearch = reportsSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return reportsView;
    }

    return reportsView.filter((record) =>
      [
        record?.id_reporte,
        record?.id_pagos,
        record?.usuarioLabel,
        record?.establecimientoLabel,
        record?.tipo_reporte,
        record?.estatus,
        record?.total,
        record?.fecha_movimiento,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [reportsSearch, reportsView]);

  const visibleReports = useMemo(
    () => filteredReports.slice(0, visibleReportsCount),
    [filteredReports, visibleReportsCount],
  );

  const filteredActivationRequests = useMemo(() => {
    const normalizedSearch = activationRequestsSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return activationRequestsView;
    }

    return activationRequestsView.filter((record) =>
      [
        record?.id_usuario,
        record?.folio,
        record?.fullName,
        record?.solicitud_activacion_estatus,
        record?.expediente_estatus,
        record?.motivo_rechazo,
        record?.fec_reg,
        record?.fec_act,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [activationRequestsSearch, activationRequestsView]);

  const visibleActivationRequests = useMemo(
    () => filteredActivationRequests.slice(0, visibleActivationRequestsCount),
    [filteredActivationRequests, visibleActivationRequestsCount],
  );
  const hasClientBalanceValue =
    clientBalance !== null && clientBalance !== undefined;

  const handleReportStatusChange = async (reportId, nextStatus) => {
    try {
      await updatePaymentReportStatus(reportId, nextStatus);
      await loadReportsView();
      Alert.alert(
        "Reporte actualizado",
        "El estatus del reporte fue actualizado correctamente.",
      );
    } catch (error) {
      Alert.alert(
        "Atenci\u00f3n",
        Number(error?.status ?? 0) === 403
          ? "Solo el perfil TI puede cambiar el estatus de los reportes."
          : error.message || "No se pudo actualizar el reporte.",
      );
    }
  };

  const closeRejectActivationModal = () => {
    setRejectActivationModalVisible(false);
    setRejectActivationTarget(null);
    setRejectActivationReason("");
    setSavingActivationDecision(false);
  };

  const handleApproveActivationRequest = async (userId) => {
    try {
      setSavingActivationDecision(true);
      await approveTiQrActivationRequest(userId);
      await Promise.all([loadActivationRequestsView(), loadUsersView()]);
      Alert.alert(
        "Solicitud aprobada",
        "El QR del cliente ya quedo operativo.",
      );
    } catch (error) {
      Alert.alert(
        "Atención",
        error.message || "No se pudo aprobar la solicitud.",
      );
    } finally {
      setSavingActivationDecision(false);
    }
  };

  const openRejectActivationModal = (record) => {
    setRejectActivationTarget(record);
    setRejectActivationReason(String(record?.motivo_rechazo ?? "").trim());
    setRejectActivationModalVisible(true);
  };

  const submitRejectActivationRequest = async () => {
    const trimmedReason = String(rejectActivationReason ?? "").trim();

    if (!rejectActivationTarget?.id_usuario) {
      Alert.alert("Atención", "No se identificó la solicitud a rechazar.");
      return;
    }

    if (!trimmedReason) {
      Alert.alert("Atención", "Captura un motivo de rechazo para continuar.");
      return;
    }

    try {
      setSavingActivationDecision(true);
      await rejectTiQrActivationRequest(
        rejectActivationTarget.id_usuario,
        trimmedReason,
      );
      closeRejectActivationModal();
      await loadActivationRequestsView();
      Alert.alert(
        "Solicitud rechazada",
        "La solicitud fue rechazada. El expediente regreso al inicio documental y el usuario podra volver a cargar documentos para reenviarla.",
      );
    } catch (error) {
      Alert.alert(
        "Atención",
        error.message || "No se pudo rechazar la solicitud.",
      );
    } finally {
      setSavingActivationDecision(false);
    }
  };

  if (isReception) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshingHome}
            onRefresh={refreshHomeData}
            colors={["#263B80"]}
            tintColor="#263B80"
          />
        }
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Recepcion</Text>
          <Text style={styles.heroTitle}>{roleConfig.homeTitle}</Text>
          <Text style={styles.heroDescription}>{roleConfig.homeSubtitle}</Text>

          <TouchableOpacity
            style={styles.heroPrimaryAction}
            onPress={() => router.push("/hotel-operation")}
          >
            <Text style={styles.heroPrimaryActionText}>
              Abrir operacion hotelera
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Flujo disponible</Text>
          <View style={styles.summaryPanel}>
            <Text style={styles.summaryPanelText}>
              1. Escanear QR del huesped
            </Text>
            <Text style={styles.summaryPanelText}>
              2. Consultar orden de hospedaje
            </Text>
            <Text style={styles.summaryPanelText}>
              3. Abrir o compartir PDF autenticado
            </Text>
            <Text style={styles.summaryPanelText}>4. Registrar check in</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshingHome}
            onRefresh={refreshHomeData}
            colors={["#263B80"]}
            tintColor="#263B80"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{getRoleLabel(user?.id_perfil)}</Text>
          <Text style={styles.welcome}>
            Te damos la bienvenida, {user?.nombre}
          </Text>
          <Text style={styles.subtitle}>{roleConfig.homeSubtitle}</Text>
        </View>

        {isInstitutionalPortal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accesos institucionales</Text>

            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push("/(tabs)/institutional-budget")}
            >
              <Text style={styles.cardTitle}>Ver partida</Text>
              <Text style={styles.cardDescription}>
                {`Consulta ${institutionalPartidaLabel} filtrada para tu perfil sin mostrar otras partidas.`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push("/profile")}
            >
              <Text style={styles.cardTitle}>Mi perfil</Text>
              <Text style={styles.cardDescription}>
                Revisa tu saldo disponible, QR, datos basicos y el historial de
                consumos propios.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push("/(tabs)/institutional-users")}
            >
              <Text style={styles.cardTitle}>Usuarios</Text>
              <Text style={styles.cardDescription}>
                {`Vista de solo consulta con los usuarios visibles de ${institutionalPartidaLabel}.`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isProvider && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER
                ? "Operacion comercial"
                : "Acciones de proveedor"}
            </Text>

            {providerEstablishments.length > 0 && (
              <View style={styles.establishmentsCard}>
                <Text style={styles.establishmentsLabel}>
                  {user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER
                    ? "Establecimiento asignado"
                    : "Establecimientos ligados para operar"}
                </Text>
                <View style={styles.establishmentsList}>
                  {providerEstablishments.map((establecimiento) => {
                    const establecimientoId = String(
                      establecimiento.id_establecimiento,
                    );
                    const isActive =
                      String(activeEstablecimientoId ?? "") ===
                      establecimientoId;

                    return (
                      <TouchableOpacity
                        key={establecimientoId}
                        style={[
                          styles.establishmentChip,
                          isActive && styles.establishmentChipActive,
                        ]}
                        onPress={() =>
                          setActiveEstablecimiento(establecimientoId)
                        }
                      >
                        <Text
                          style={[
                            styles.establishmentChipText,
                            isActive && styles.establishmentChipTextActive,
                          ]}
                        >
                          {establecimiento.dsc_establecimiento}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {providerEstablishments.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>
                  {user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER
                    ? "No tienes un establecimiento ligado disponible para operar en este momento."
                    : "No tienes establecimientos ligados disponibles para operar. Cuando backend relacione establecimientos con tu usuario proveedor, apareceran aqui."}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push("/(modals)/scanner")}
            >
              <Text style={styles.cardTitle}>Escanear QR para cobrar</Text>
              <Text style={styles.cardDescription}>
                Inicia una solicitud de pago para un cliente.
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isCashier && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proceso de entrega</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Entrega documentada de QR</Text>
              <Text style={styles.cardDescription}>
                Captura el folio del interesado, toma foto del anverso y reverso
                de su identificacion oficial y prepara el siguiente paso del
                tramite.
              </Text>
              <Text style={styles.cardMeta}>Fases 1 y 2 listas en app</Text>

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 16 }]}
                onPress={() =>
                  router.push(`/(tabs)/cashier-process?reset=${Date.now()}`)
                }
              >
                <Text style={styles.primaryButtonText}>Iniciar tramite</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isClient && !isInstitutionalPortal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acciones de consumo</Text>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Saldo disponible</Text>
              <Text style={styles.balanceValue}>
                {hasClientBalanceValue
                  ? `$${Number(clientBalance).toFixed(2)}`
                  : "Pendiente de sincronizar"}
              </Text>
            </View>

            <ClientQRGenerator />
          </View>
        )}

        {isAdminOrManager && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Panel TI</Text>
              {buildAdminOverviewCards().map((card) => (
                <View key={card.key} style={styles.card}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                  <Text style={styles.cardMeta}>
                    Vista administrativa disponible
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Solicitudes de activación QR
              </Text>
              <Text style={styles.sectionDescription}>
                Revisa, aprueba o rechaza primero las solicitudes documentales
                enviadas por clientes.
              </Text>

              <View style={styles.searchBlock}>
                <Text style={styles.inputLabel}>Buscar solicitudes</Text>
                <TextInput
                  style={styles.input}
                  value={activationRequestsSearch}
                  onChangeText={setActivationRequestsSearch}
                  placeholder="Buscar por usuario, folio, estatus o motivo"
                  placeholderTextColor="#999"
                />
              </View>

              {loadingActivationRequests ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>
                    Cargando solicitudes...
                  </Text>
                </View>
              ) : visibleActivationRequests.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>
                    No hay solicitudes de activación para mostrar.
                  </Text>
                </View>
              ) : (
                <>
                  {visibleActivationRequests.map((record) => (
                    <View
                      key={`${record.id_usuario}-${record.folio}`}
                      style={styles.reportCard}
                    >
                      <View style={styles.userCardHeader}>
                        <Text style={styles.userCardTitle}>
                          {record.fullName || "Sin usuario"}
                        </Text>
                        <Text style={styles.userCardId}>
                          {record.solicitud_activacion_estatus || "pendiente"}
                        </Text>
                      </View>

                      <Text style={styles.userCardMeta}>
                        Usuario: #{record.id_usuario}
                      </Text>
                      <Text style={styles.userCardMeta}>
                        Folio: {record.folio || "Sin folio"}
                      </Text>
                      <Text style={styles.userCardMeta}>
                        QR activo:{" "}
                        {Number(record.qr_activo ?? 0) === 1 ? "Sí" : "No"}
                      </Text>
                      <Text style={styles.userCardMeta}>
                        Expediente completo:{" "}
                        {record.expediente_completo ? "Sí" : "No"}
                      </Text>
                      <Text style={styles.userCardMeta}>
                        Expediente: {record.expediente_estatus || "Sin estatus"}
                      </Text>
                      <Text style={styles.userCardMeta}>
                        Fecha solicitud: {record.fec_reg || "Sin fecha"}
                      </Text>
                      {String(record?.motivo_rechazo ?? "").trim() ? (
                        <Text style={styles.userCardMeta}>
                          Motivo: {String(record.motivo_rechazo).trim()}
                        </Text>
                      ) : null}

                      {String(
                        record?.solicitud_activacion_estatus ?? "",
                      ).toLowerCase() === "pendiente" ? (
                        <View style={styles.reportActions}>
                          <TouchableOpacity
                            style={[
                              styles.reportStatusButton,
                              savingActivationDecision && styles.disabledButton,
                            ]}
                            disabled={savingActivationDecision}
                            onPress={() =>
                              handleApproveActivationRequest(record.id_usuario)
                            }
                          >
                            <Text style={styles.reportStatusButtonText}>
                              Aprobar
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.reportStatusButton,
                              styles.reportStatusButtonDanger,
                              savingActivationDecision && styles.disabledButton,
                            ]}
                            disabled={savingActivationDecision}
                            onPress={() => openRejectActivationModal(record)}
                          >
                            <Text style={styles.reportStatusButtonText}>
                              Rechazar
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ))}

                  {filteredActivationRequests.length >
                  visibleActivationRequestsCount ? (
                    <TouchableOpacity
                      style={styles.loadMoreButton}
                      onPress={() =>
                        setVisibleActivationRequestsCount(
                          (current) => current + 10,
                        )
                      }
                    >
                      <Text style={styles.loadMoreButtonText}>
                        Ver mas solicitudes
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pagos y reportes</Text>
              {buildAdminCards().map((card) => (
                <View key={card.key} style={styles.card}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                  <Text style={styles.cardMeta}>
                    Vista administrativa disponible
                  </Text>

                  {isAdmin ? (
                    <>
                      {reportsEndpointUnavailable ? (
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyBoxText}>
                            El endpoint de reportes aun no esta disponible en
                            backend.
                          </Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.searchBlock}>
                            <Text style={styles.inputLabel}>
                              Buscar reportes
                            </Text>
                            <TextInput
                              style={styles.input}
                              value={reportsSearch}
                              onChangeText={setReportsSearch}
                              placeholder="Buscar por reporte, pago, cliente o estatus"
                              placeholderTextColor="#999"
                            />
                          </View>

                          {loadingReports ? (
                            <View style={styles.emptyBox}>
                              <Text style={styles.emptyBoxText}>
                                Cargando reportes...
                              </Text>
                            </View>
                          ) : visibleReports.length === 0 ? (
                            <View style={styles.emptyBox}>
                              <Text style={styles.emptyBoxText}>
                                No hay reportes registrados para mostrar.
                              </Text>
                            </View>
                          ) : (
                            <>
                              {visibleReports.map((record, index) => (
                                <View
                                  key={String(
                                    record.id_reporte ?? `report-row-${index}`,
                                  )}
                                  style={styles.reportCard}
                                >
                                  <View style={styles.userCardHeader}>
                                    <Text style={styles.userCardTitle}>
                                      Reporte {getSafeReportIdLabel(record)}
                                    </Text>
                                    <Text style={styles.userCardId}>
                                      {record.estatus || "pendiente"}
                                    </Text>
                                  </View>
                                  <Text style={styles.userCardMeta}>
                                    Pago relacionado:{" "}
                                    {getSafePaymentIdLabel(record)}
                                  </Text>
                                  <Text style={styles.userCardMeta}>
                                    Cliente: {record.usuarioLabel}
                                  </Text>
                                  <Text style={styles.userCardMeta}>
                                    Establecimiento:{" "}
                                    {record.establecimientoLabel}
                                  </Text>
                                  <Text style={styles.userCardMeta}>
                                    Tipo: {record.tipo_reporte || "Sin tipo"}
                                  </Text>
                                  <Text style={styles.userCardMeta}>
                                    Total: $
                                    {Number(record.total ?? 0).toFixed(2)}
                                  </Text>
                                  <Text style={styles.userCardMeta}>
                                    Fecha del movimiento:{" "}
                                    {record.fecha_movimiento || "Sin fecha"}
                                  </Text>
                                  {record.qaInconsistencyLabel ? (
                                    <Text style={styles.userCardMeta}>
                                      {record.qaInconsistencyLabel}
                                    </Text>
                                  ) : null}

                                  {record.has_valid_report_id ? (
                                    <View style={styles.reportActions}>
                                      <TouchableOpacity
                                        style={styles.reportStatusButton}
                                        onPress={() =>
                                          handleReportStatusChange(
                                            record.id_reporte,
                                            "en_revision",
                                          )
                                        }
                                      >
                                        <Text
                                          style={styles.reportStatusButtonText}
                                        >
                                          En revision
                                        </Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={[
                                          styles.reportStatusButton,
                                          styles.reportStatusButtonSuccess,
                                        ]}
                                        onPress={() =>
                                          handleReportStatusChange(
                                            record.id_reporte,
                                            "resuelto",
                                          )
                                        }
                                      >
                                        <Text
                                          style={styles.reportStatusButtonText}
                                        >
                                          Resuelto
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  ) : null}
                                </View>
                              ))}

                              {filteredReports.length > visibleReportsCount ? (
                                <TouchableOpacity
                                  style={styles.loadMoreButton}
                                  onPress={() =>
                                    setVisibleReportsCount(
                                      (current) => current + 10,
                                    )
                                  }
                                >
                                  <Text style={styles.loadMoreButtonText}>
                                    Ver mas reportes
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : null}

                  <View style={styles.searchBlock}>
                    <Text style={styles.inputLabel}>Buscar pagos</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentsSearch}
                      onChangeText={setPaymentsSearch}
                      placeholder="Buscar por ID, usuario, establecimiento o tipo"
                      placeholderTextColor="#999"
                    />
                  </View>

                  {loadingPayments ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyBoxText}>Cargando pagos...</Text>
                    </View>
                  ) : visiblePayments.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyBoxText}>
                        No hay pagos registrados para mostrar.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {visiblePayments.map((record) => (
                        <View
                          key={String(record.id_pagos)}
                          style={styles.reportCard}
                        >
                          <View style={styles.userCardHeader}>
                            <Text style={styles.userCardTitle}>
                              Pago #{record.id_pagos}
                            </Text>
                            <Text style={styles.userCardId}>
                              {record.tipoPagoLabel}
                            </Text>
                          </View>
                          <Text style={styles.userCardMeta}>
                            Usuario: {record.usuarioLabel}
                          </Text>
                          <Text style={styles.userCardMeta}>
                            Establecimiento: {record.establecimientoLabel}
                          </Text>
                          <Text style={styles.userCardMeta}>
                            Monto: ${Number(record.monto ?? 0).toFixed(2)}
                          </Text>
                          <Text style={styles.userCardMeta}>
                            Total: ${Number(record.total ?? 0).toFixed(2)}
                          </Text>
                          <Text style={styles.userCardMeta}>
                            Fecha: {record.fec_reg || "Sin fecha"}
                          </Text>
                        </View>
                      ))}

                      {filteredPayments.length > visiblePaymentsCount ? (
                        <TouchableOpacity
                          style={styles.loadMoreButton}
                          onPress={() =>
                            setVisiblePaymentsCount((current) => current + 10)
                          }
                        >
                          <Text style={styles.loadMoreButtonText}>
                            Ver mas pagos
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Solicitudes de gerente / recepción
              </Text>
              <Text style={styles.sectionDescription}>
                {isAdmin
                  ? "Consulta despues las solicitudes y referencias de personal. Usa los filtros para priorizar gerente y recepción sin cambiar la tabla actual."
                  : "Vista de consulta homologada con la web para seguimiento de personal y usuarios."}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {ADMIN_FILTERS.map((filter) => {
                  const isActive =
                    Number(selectedRoleFilter) === Number(filter.id);

                  return (
                    <TouchableOpacity
                      key={String(filter.id)}
                      style={[
                        styles.filterChip,
                        isActive && styles.filterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedRoleFilter(filter.id);
                        setUsersPage(1);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive && styles.filterChipTextActive,
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.searchBlock}>
                <Text style={styles.inputLabel}>Buscar usuarios</Text>
                <TextInput
                  style={styles.input}
                  value={usersSearch}
                  onChangeText={(value) => {
                    setUsersSearch(value);
                    setUsersPage(1);
                  }}
                  placeholder="Buscar por ID, usuario o nombre"
                  placeholderTextColor="#999"
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {[
                  { id: "id_usuario", label: "ID" },
                  { id: "usuario", label: "Usuario" },
                  { id: "establecimiento_label", label: "Establecimiento" },
                ].map((sortOption) => {
                  const isActive = usersSortField === sortOption.id;
                  return (
                    <TouchableOpacity
                      key={sortOption.id}
                      style={[
                        styles.filterChip,
                        isActive && styles.filterChipActive,
                      ]}
                      onPress={() => {
                        if (isActive) {
                          setUsersSortOrder((current) =>
                            current === "asc" ? "desc" : "asc",
                          );
                        } else {
                          setUsersSortField(sortOption.id);
                          setUsersSortOrder(
                            sortOption.id === "id_usuario" ? "desc" : "asc",
                          );
                        }
                        setUsersPage(1);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive && styles.filterChipTextActive,
                        ]}
                      >
                        {sortOption.label}
                        {isActive
                          ? usersSortOrder === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {loadingUsers ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>Cargando usuarios...</Text>
                </View>
              ) : usersView.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>
                    No hay usuarios para este filtro.
                  </Text>
                </View>
              ) : (
                usersView.map((record) => (
                  <View key={String(record.id_usuario)} style={styles.userCard}>
                    <View style={styles.userCardHeader}>
                      <Text style={styles.userCardTitle}>
                        ID Usuario: {record.id_usuario}
                      </Text>
                      <Text style={styles.userCardId}>
                        Usuario: {record.usuario || "N/D"}
                      </Text>
                    </View>

                    <Text style={styles.userCardMeta}>
                      Nombre completo: {record.fullName || "Sin nombre"}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Perfil: {record.roleLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Tarifa diaria: {record.tarifaDiariaLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Partida: {record.partidaLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Folio: {record.folioEntregaLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Subfolio: {record.subfolioEntregaLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>
                      Establecimiento: {record.establecimientoLabel}
                    </Text>
                  </View>
                ))
              )}

              <View style={styles.paginationRow}>
                <Text style={styles.paginationText}>
                  Pagina {usersPage} de {usersTotalPages} · Total {usersTotal}
                </Text>
                <View style={styles.paginationActions}>
                  <TouchableOpacity
                    style={[
                      styles.loadMoreButton,
                      usersPage <= 1 && styles.qrActionButtonDisabled,
                    ]}
                    disabled={usersPage <= 1}
                    onPress={() => setUsersPage((current) => Math.max(1, current - 1))}
                  >
                    <Text style={styles.loadMoreButtonText}>Anterior</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.loadMoreButton,
                      usersPage >= usersTotalPages &&
                        styles.qrActionButtonDisabled,
                    ]}
                    disabled={usersPage >= usersTotalPages}
                    onPress={() =>
                      setUsersPage((current) =>
                        Math.min(usersTotalPages, current + 1),
                      )
                    }
                  >
                    <Text style={styles.loadMoreButtonText}>Siguiente</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={rejectActivationModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.modalTitle}>Rechazar solicitud</Text>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Usuario</Text>
              <TextInput
                style={styles.input}
                value={rejectActivationTarget?.fullName || ""}
                editable={false}
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Folio</Text>
              <TextInput
                style={styles.input}
                value={rejectActivationTarget?.folio || ""}
                editable={false}
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Motivo de rechazo</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={rejectActivationReason}
                onChangeText={setRejectActivationReason}
                placeholder="Describe el motivo del rechazo"
                placeholderTextColor="#999"
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={closeRejectActivationModal}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.dangerButton,
                  savingActivationDecision && styles.disabledButton,
                ]}
                onPress={submitRejectActivationRequest}
                disabled={savingActivationDecision}
              >
                <Text style={styles.primaryButtonText}>
                  {savingActivationDecision
                    ? "Guardando..."
                    : "Confirmar rechazo"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginTop: 12,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: "#263B80",
    borderRadius: 20,
    padding: 22,
    marginTop: 12,
    marginBottom: 20,
    shadowColor: "#0D1B2A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: "#F4C95D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  heroDescription: {
    fontSize: 15,
    color: "#E8EEFF",
    lineHeight: 22,
  },
  heroPrimaryAction: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPrimaryActionText: {
    color: "#263B80",
    fontSize: 15,
    fontWeight: "800",
  },
  cardSection: {
    marginBottom: 24,
  },
  summaryPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
    gap: 10,
  },
  summaryPanelText: {
    color: "#49516A",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B23A48",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  welcome: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f1f1f",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#5f5f5f",
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#263B80",
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#263B80",
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  cardMeta: {
    marginTop: 10,
    fontSize: 12,
    color: "#B23A48",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  searchBlock: {
    marginTop: 16,
  },
  establishmentsCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  establishmentsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B23A48",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  establishmentsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  establishmentChip: {
    borderWidth: 1,
    borderColor: "#263B80",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  establishmentChipActive: {
    backgroundColor: "#263B80",
    borderColor: "#263B80",
  },
  establishmentChipText: {
    color: "#263B80",
    fontSize: 13,
    fontWeight: "600",
  },
  establishmentChipTextActive: {
    color: "#FFFFFF",
  },
  balanceCard: {
    backgroundColor: "#263B80",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterRow: {
    gap: 8,
    paddingBottom: 6,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#263B80",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: "#263B80",
    borderColor: "#263B80",
  },
  filterChipText: {
    color: "#263B80",
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  userCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  reportCard: {
    borderWidth: 1,
    borderColor: "#ECECEC",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  userCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  userCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#263B80",
  },
  userCardId: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B23A48",
    textTransform: "uppercase",
  },
  userCardMeta: {
    fontSize: 14,
    color: "#5f5f5f",
    marginBottom: 4,
  },
  userActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  depositButton: {
    alignSelf: "flex-start",
    backgroundColor: "#263B80",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  depositButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  qrActionButton: {
    alignSelf: "flex-start",
    backgroundColor: "#263B80",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  qrActionButtonDisabled: {
    backgroundColor: "#8E8E93",
  },
  qrActionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reportActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  reportStatusButton: {
    flex: 1,
    backgroundColor: "#B23A48",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  reportStatusButtonSuccess: {
    backgroundColor: "#263B80",
  },
  reportStatusButtonDanger: {
    backgroundColor: "#B23A48",
  },
  reportStatusButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  loadMoreButton: {
    marginTop: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
  },
  loadMoreButtonText: {
    color: "#263B80",
    fontSize: 14,
    fontWeight: "700",
  },
  paginationRow: {
    marginTop: 12,
    gap: 12,
  },
  paginationText: {
    fontSize: 13,
    color: "#5f5f5f",
    fontWeight: "600",
  },
  paginationActions: {
    flexDirection: "row",
    gap: 10,
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
  },
  emptyBoxText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalContent: {
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1f1f1f",
    marginBottom: 18,
  },
  formBlock: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B23A48",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#222",
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  dateTimeSelector: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#263B80",
    padding: 14,
    marginBottom: 14,
  },
  dateTimeHeader: {
    marginBottom: 12,
  },
  dateTimeValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "#263B80",
  },
  calendarControls: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  calendarNavButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#263B80",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  calendarNavText: {
    color: "#263B80",
    fontWeight: "700",
  },
  calendarTodayButton: {
    flex: 1,
    backgroundColor: "#263B80",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  calendarTodayText: {
    color: "#fff",
    fontWeight: "700",
  },
  calendarStrip: {
    gap: 8,
    paddingBottom: 10,
  },
  calendarDayChip: {
    minWidth: 76,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#263B80",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  calendarDayChipActive: {
    backgroundColor: "#263B80",
    borderColor: "#263B80",
  },
  calendarDayText: {
    color: "#263B80",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  calendarDayTextActive: {
    color: "#FFFFFF",
  },
  chronometerPanel: {
    alignItems: "center",
    backgroundColor: "#263B80",
    borderRadius: 18,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  chronometerLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  chronometerValue: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 4,
  },
  chronometerFormat: {
    color: "#FFF7D6",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  timeWheelRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeWheelColumn: {
    flex: 1,
  },
  timeWheelLabel: {
    color: "#777",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  timeWheel: {
    maxHeight: 150,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#263B80",
    borderRadius: 16,
  },
  timeWheelContent: {
    paddingVertical: 40,
  },
  timeWheelItem: {
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 6,
    marginVertical: 3,
    paddingVertical: 10,
  },
  timeWheelItemActive: {
    backgroundColor: "#263B80",
  },
  timeWheelItemText: {
    color: "#263B80",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
  },
  timeWheelItemTextActive: {
    color: "#FFFFFF",
  },
  timeWheelSelectionHint: {
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#263B80",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryButtonText: {
    color: "#263B80",
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#263B80",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  dangerButton: {
    backgroundColor: "#B23A48",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
