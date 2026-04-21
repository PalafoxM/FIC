import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ClientQRGenerator from '../../components/ClientQRGenerator';
import { getRoleConfig, getRoleLabel, ROLE_IDS } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

const ADMIN_FILTERS = [
  { id: 0, label: 'Todos' },
  { id: ROLE_IDS.ADMIN, label: 'TI' },
  { id: ROLE_IDS.PROVIDER, label: 'Proveedor' },
  { id: ROLE_IDS.CLIENT, label: 'Cliente' },
  { id: ROLE_IDS.MANAGER, label: 'Gestor' },
  { id: ROLE_IDS.BUSINESS_MANAGER, label: 'Gerente' },
];

const buildAdminCards = () => [
  {
    key: 'reports',
    title: 'Reportes',
    description: 'Consulta reportes y seguimiento de actividad.',
    actionLabel: 'Disponible en siguiente etapa',
    onPress: () => Alert.alert('Reportes', 'La relacion de reportes en app se implementara en una etapa posterior.'),
  },
];

const buildFullName = (record) =>
  [record?.nombre, record?.primer_apellido, record?.segundo_apellido]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Sin nombre';

const isDepositoCreditosAllowedForPerfil = (idPerfil) => ![ROLE_IDS.PROVIDER, ROLE_IDS.BUSINESS_MANAGER].includes(Number(idPerfil ?? 0));
const CLIENT_BALANCE_REFRESH_COOLDOWN_MS = 30000;
const REPORTS_RETRY_COOLDOWN_MS = 60000;
const CALENDAR_DAY_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

const pad2 = (value) => String(value).padStart(2, '0');

const parseDateTimeInput = (value) => {
  if (!value) {
    return new Date();
  }

  const normalizedValue = String(value).trim().replace(' ', 'T');
  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
};

const formatDateTimeValue = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;

const normalizeDateTimeValue = (value) => {
  if (!value) {
    return '';
  }

  return formatDateTimeValue(parseDateTimeInput(value));
};

const buildQrClienteCode = (userId) =>
  `FIC-${String(userId).padStart(6, '0')}-${Date.now().toString(36).toUpperCase()}`;

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const setDatePart = (date, sourceDate) => {
  const nextDate = new Date(date);
  nextDate.setFullYear(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
  return nextDate;
};

const shiftHours = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setHours((nextDate.getHours() + amount + 24) % 24);
  return nextDate;
};

const shiftMinutes = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setMinutes((nextDate.getMinutes() + amount + 60) % 60);
  return nextDate;
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const isSameCalendarDay = (leftDate, rightDate) =>
  leftDate.getFullYear() === rightDate.getFullYear() &&
  leftDate.getMonth() === rightDate.getMonth() &&
  leftDate.getDate() === rightDate.getDate();

const formatCalendarDayLabel = (date) =>
  date.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
  });

const DateTimeSelector = ({ label, value, onChange }) => {
  const selectedDate = parseDateTimeInput(value);
  const setSelectedDate = (nextDate) => onChange(formatDateTimeValue(nextDate));
  const setHourValue = (text) => {
    const numericValue = Number(String(text).replace(/\D/g, '').slice(0, 2));
    if (Number.isNaN(numericValue)) {
      return;
    }

    const nextDate = new Date(selectedDate);
    nextDate.setHours(clampNumber(numericValue, 0, 23));
    setSelectedDate(nextDate);
  };

  const setMinuteValue = (text) => {
    const numericValue = Number(String(text).replace(/\D/g, '').slice(0, 2));
    if (Number.isNaN(numericValue)) {
      return;
    }

    const nextDate = new Date(selectedDate);
    nextDate.setMinutes(clampNumber(numericValue, 0, 59));
    setSelectedDate(nextDate);
  };

  return (
    <View style={styles.dateTimeSelector}>
      <View style={styles.dateTimeHeader}>
        <Text style={styles.inputLabel}>{label}</Text>
        <Text style={styles.dateTimeValue}>{formatDateTimeValue(selectedDate)}</Text>
      </View>

      <View style={styles.calendarControls}>
        <TouchableOpacity
          style={styles.calendarNavButton}
          onPress={() => setSelectedDate(addDays(selectedDate, -1))}
        >
          <Text style={styles.calendarNavText}>Dia -</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.calendarTodayButton}
          onPress={() => setSelectedDate(setDatePart(selectedDate, new Date()))}
        >
          <Text style={styles.calendarTodayText}>Hoy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.calendarNavButton}
          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
        >
          <Text style={styles.calendarNavText}>Dia +</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.calendarStrip}
      >
        {CALENDAR_DAY_OFFSETS.map((offset) => {
          const day = addDays(selectedDate, offset);
          const isActive = isSameCalendarDay(day, selectedDate);

          return (
            <TouchableOpacity
              key={offset}
              style={[styles.calendarDayChip, isActive && styles.calendarDayChipActive]}
              onPress={() => setSelectedDate(setDatePart(selectedDate, day))}
            >
              <Text style={[styles.calendarDayText, isActive && styles.calendarDayTextActive]}>
                {formatCalendarDayLabel(day)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.timePickerRow}>
        <View style={styles.timePickerColumn}>
          <Text style={styles.timePickerLabel}>Hora</Text>
          <View style={styles.timeStepper}>
            <TouchableOpacity
              style={styles.timeStepperButton}
              onPress={() => setSelectedDate(shiftHours(selectedDate, -1))}
            >
              <Text style={styles.timeStepperText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.timeStepperInput}
              value={pad2(selectedDate.getHours())}
              onChangeText={setHourValue}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.timeStepperButton}
              onPress={() => setSelectedDate(shiftHours(selectedDate, 1))}
            >
              <Text style={styles.timeStepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.timePickerColumn}>
          <Text style={styles.timePickerLabel}>Minuto</Text>
          <View style={styles.timeStepper}>
            <TouchableOpacity
              style={styles.timeStepperButton}
              onPress={() => setSelectedDate(shiftMinutes(selectedDate, -5))}
            >
              <Text style={styles.timeStepperText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.timeStepperInput}
              value={pad2(selectedDate.getMinutes())}
              onChangeText={setMinuteValue}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.timeStepperButton}
              onPress={() => setSelectedDate(shiftMinutes(selectedDate, 5))}
            >
              <Text style={styles.timeStepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const {
    user,
    activeEstablecimientoId,
    setActiveEstablecimiento,
    getClientAvailableBalance,
    getTable,
    saveTable,
  } = useAuth();
  const { getPaymentReports, updatePaymentReportStatus } = useApi();
  const router = useRouter();
  const lastClientBalanceRefreshRef = useRef(0);
  const getClientAvailableBalanceRef = useRef(getClientAvailableBalance);
  const loadUsersViewRef = useRef(null);
  const loadPaymentsViewRef = useRef(null);
  const loadReportsViewRef = useRef(null);
  const reportsEndpointUnavailableRef = useRef(false);
  const reportsRetryAtRef = useRef(0);

  const [clientBalance, setClientBalance] = useState(
    user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null
  );
  const [usersView, setUsersView] = useState([]);
  const [paymentsView, setPaymentsView] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [reportsView, setReportsView] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsEndpointUnavailable, setReportsEndpointUnavailable] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(0);
  const [visibleUsersCount, setVisibleUsersCount] = useState(10);
  const [visiblePaymentsCount, setVisiblePaymentsCount] = useState(10);
  const [visibleReportsCount, setVisibleReportsCount] = useState(10);
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [reportsSearch, setReportsSearch] = useState('');
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositQrCode, setDepositQrCode] = useState('');
  const [depositQrRowId, setDepositQrRowId] = useState(null);
  const [depositVigenteDesde, setDepositVigenteDesde] = useState('');
  const [depositVigenteHasta, setDepositVigenteHasta] = useState('');
  const [loadingDepositDetails, setLoadingDepositDetails] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [refreshingHome, setRefreshingHome] = useState(false);

  const roleConfig = getRoleConfig(user?.id_perfil);
  const isProvider =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isAdmin = user?.id_perfil === ROLE_IDS.ADMIN;
  const isManagerProfile = user?.id_perfil === ROLE_IDS.MANAGER;
  const isAdminOrManager = isAdmin || isManagerProfile;
  const providerEstablishments = Array.isArray(user?.establecimientos) ? user.establecimientos : [];

  useEffect(() => {
    setClientBalance(user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null);
  }, [user?.saldo, user?.saldo_actual, user?.saldoDisponible]);

  const loadUsersView = useCallback(async () => {
    if (!isAdminOrManager) {
      return;
    }

    try {
      setLoadingUsers(true);

      const [usuarios, establecimientos, qrClientes] = await Promise.all([
        getTable({
          tabla: 'usuario',
          where: { visible: 1 },
          order: 'id_usuario DESC',
        }),
        getTable({
          tabla: 'establecimiento',
          where: { visible: 1 },
          order: 'dsc_establecimiento ASC',
        }),
        getTable({
          tabla: 'qr_cliente',
          where: {
            activo: 1,
            visible: 1,
          },
          order: 'id_qr_cliente DESC',
        }),
      ]);

      const establecimientosMap = establecimientos.reduce((accumulator, establecimiento) => {
        accumulator[String(establecimiento.id_establecimiento)] =
          establecimiento.dsc_establecimiento || 'Sin establecimiento';
        return accumulator;
      }, {});
      const qrClientesMap = qrClientes.reduce((accumulator, qrRecord) => {
        const userId = String(qrRecord.id_usuario ?? '');
        if (userId && !accumulator[userId]) {
          accumulator[userId] = qrRecord;
        }
        return accumulator;
      }, {});

      setUsersView(
        usuarios.map((usuarioRecord) => ({
          ...usuarioRecord,
          fullName: buildFullName(usuarioRecord),
          roleLabel: getRoleLabel(usuarioRecord.id_perfil),
          qrCliente: qrClientesMap[String(usuarioRecord.id_usuario ?? '')] ?? null,
          establecimientoLabel:
            establecimientosMap[String(usuarioRecord.id_establecimiento ?? '')] || 'Sin establecimiento',
        }))
      );
      setVisibleUsersCount(10);
    } catch (error) {
      console.error('Error loading users view:', error);
      setUsersView([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [getTable, isAdminOrManager]);

  const loadPaymentsView = useCallback(async () => {
    if (!isAdminOrManager) {
      return;
    }

    try {
      setLoadingPayments(true);

      const [pagos, usuarios, establecimientos, tiposPago] = await Promise.all([
        getTable({
          tabla: 'pagos',
          where: { visible: 1 },
          order: 'fec_reg DESC',
        }),
        getTable({
          tabla: 'usuario',
          where: { visible: 1 },
        }),
        getTable({
          tabla: 'establecimiento',
          where: { visible: 1 },
        }),
        getTable({
          tabla: 'cat_tipo_pago',
          where: { visible: 1 },
        }),
      ]);

      const usuariosMap = usuarios.reduce((accumulator, record) => {
        accumulator[String(record.id_usuario)] = buildFullName(record);
        return accumulator;
      }, {});

      const establecimientosMap = establecimientos.reduce((accumulator, record) => {
        accumulator[String(record.id_establecimiento)] = record.dsc_establecimiento || 'Sin establecimiento';
        return accumulator;
      }, {});

      const tiposPagoMap = tiposPago.reduce((accumulator, record) => {
        accumulator[String(record.id_tipo_pago)] = record.dsc_tipo_pago || 'Sin tipo';
        return accumulator;
      }, {});

      setPaymentsView(
        pagos.map((paymentRecord) => ({
          ...paymentRecord,
          usuarioLabel: usuariosMap[String(paymentRecord.id_usuario ?? '')] || 'Sin usuario',
          establecimientoLabel:
            establecimientosMap[String(paymentRecord.id_establecimiento ?? '')] || 'Sin establecimiento',
          tipoPagoLabel: tiposPagoMap[String(paymentRecord.id_tipo_pago ?? '')] || 'Sin tipo',
        }))
      );
      setVisiblePaymentsCount(10);
    } catch (error) {
      console.error('Error loading payments view:', error);
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
          tabla: 'usuario',
          where: { visible: 1 },
        }),
        getTable({
          tabla: 'establecimiento',
          where: { visible: 1 },
        }),
      ]);

      const reportRows = Array.isArray(reportsResponse?.data) ? reportsResponse.data : [];

      const usuariosMap = usuarios.reduce((accumulator, record) => {
        accumulator[String(record.id_usuario)] = buildFullName(record);
        return accumulator;
      }, {});

      const establecimientosMap = establecimientos.reduce((accumulator, record) => {
        accumulator[String(record.id_establecimiento)] = record.dsc_establecimiento || 'Sin establecimiento';
        return accumulator;
      }, {});

      setReportsView(
        reportRows.map((reportRecord) => ({
          ...reportRecord,
          usuarioLabel: usuariosMap[String(reportRecord.id_usuario ?? '')] || 'Sin usuario',
          establecimientoLabel:
            establecimientosMap[String(reportRecord.id_establecimiento ?? '')] || 'Sin establecimiento',
        }))
      );
      setVisibleReportsCount(10);
      reportsEndpointUnavailableRef.current = false;
      reportsRetryAtRef.current = 0;
      setReportsEndpointUnavailable(false);
    } catch (error) {
      console.log('Reportes no disponibles:', error?.message || error);
      if (
        String(error?.message || '').includes('Revisa la ruta GET /api/reportes') ||
        String(error?.message || '').includes('Consultando reportes devolvio una respuesta no valida')
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

  useEffect(() => {
    getClientAvailableBalanceRef.current = getClientAvailableBalance;
  }, [getClientAvailableBalance]);

  useEffect(() => {
    loadUsersViewRef.current = loadUsersView;
  }, [loadUsersView]);

  useEffect(() => {
    loadPaymentsViewRef.current = loadPaymentsView;
  }, [loadPaymentsView]);

  useEffect(() => {
    loadReportsViewRef.current = loadReportsView;
  }, [loadReportsView]);

  useEffect(() => {
    if (!isAdmin) {
      reportsEndpointUnavailableRef.current = false;
      setReportsEndpointUnavailable(false);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const refreshBalanceOnFocus = async () => {
        if (!isClient || !user?.id_usuario) {
          return;
        }

        const now = Date.now();
        const hasCachedBalance =
          clientBalance !== null && clientBalance !== undefined;

        if (
          hasCachedBalance &&
          now - lastClientBalanceRefreshRef.current < CLIENT_BALANCE_REFRESH_COOLDOWN_MS
        ) {
          return;
        }

        try {
          const balance = await getClientAvailableBalanceRef.current(user.id_usuario);

          if (isMounted) {
            setClientBalance(balance);
            lastClientBalanceRefreshRef.current = Date.now();
          }
        } catch (balanceError) {
          console.error('Error refreshing client balance on focus:', balanceError);
        }
      };

      refreshBalanceOnFocus();

      if (isAdminOrManager) {
        loadUsersViewRef.current?.();
        loadPaymentsViewRef.current?.();
      }

      if (isAdmin) {
        loadReportsViewRef.current?.();
      }

      return () => {
        isMounted = false;
      };
    }, [clientBalance, isAdmin, isAdminOrManager, isClient, user?.id_usuario])
  );

  const refreshHomeData = useCallback(async () => {
    try {
      setRefreshingHome(true);

      if (isClient && user?.id_usuario) {
        const balance = await getClientAvailableBalanceRef.current(user.id_usuario);
        setClientBalance(balance);
        lastClientBalanceRefreshRef.current = Date.now();
      }

      if (isAdminOrManager) {
        await Promise.all([
          loadUsersViewRef.current?.(),
          loadPaymentsViewRef.current?.(),
        ]);
      }

      if (isAdmin) {
        await loadReportsViewRef.current?.();
      }
    } catch (error) {
      console.error('Error refreshing home data:', error);
      Alert.alert('Error', error.message || 'No se pudo actualizar la informacion.');
    } finally {
      setRefreshingHome(false);
    }
  }, [isAdmin, isAdminOrManager, isClient, user?.id_usuario]);

  const filteredUsers = useMemo(() => {
    if (selectedRoleFilter === 0) {
      return usersView;
    }

    return usersView.filter((record) => Number(record.id_perfil) === Number(selectedRoleFilter));
  }, [selectedRoleFilter, usersView]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, visibleUsersCount),
    [filteredUsers, visibleUsersCount]
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
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [paymentsSearch, paymentsView]);

  const visiblePayments = useMemo(
    () => filteredPayments.slice(0, visiblePaymentsCount),
    [filteredPayments, visiblePaymentsCount]
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
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [reportsSearch, reportsView]);

  const visibleReports = useMemo(
    () => filteredReports.slice(0, visibleReportsCount),
    [filteredReports, visibleReportsCount]
  );
  const hasClientBalanceValue = clientBalance !== null && clientBalance !== undefined;

  const closeDepositModal = () => {
    setDepositModalVisible(false);
    setDepositTarget(null);
    setDepositAmount('');
    setDepositQrCode('');
    setDepositQrRowId(null);
    setDepositVigenteDesde('');
    setDepositVigenteHasta('');
    setLoadingDepositDetails(false);
    setSavingDeposit(false);
  };

  const openDepositModal = async (targetUser) => {
    const defaultStartDate = new Date();
    const defaultEndDate = addDays(defaultStartDate, 1);

    setDepositTarget(targetUser);
    setDepositAmount('');
    setDepositQrCode('');
    setDepositQrRowId(null);
    setDepositVigenteDesde(formatDateTimeValue(defaultStartDate));
    setDepositVigenteHasta(formatDateTimeValue(defaultEndDate));
    setDepositModalVisible(true);

    try {
      setLoadingDepositDetails(true);

      const qrRows = await getTable({
        tabla: 'qr_cliente',
        where: {
          id_usuario: Number(targetUser?.id_usuario ?? 0),
          activo: 1,
          visible: 1,
        },
        order: 'id_qr_cliente DESC',
        limit: 1,
      });

      const qrRecord = qrRows?.[0] ?? null;

      setDepositQrRowId(qrRecord?.id_qr_cliente ?? null);
      setDepositQrCode(qrRecord?.codigo_qr ?? '');
      setDepositVigenteDesde(
        qrRecord?.vigente_desde
          ? normalizeDateTimeValue(qrRecord.vigente_desde)
          : formatDateTimeValue(defaultStartDate)
      );
      setDepositVigenteHasta(
        qrRecord?.vigente_hasta
          ? normalizeDateTimeValue(qrRecord.vigente_hasta)
          : formatDateTimeValue(defaultEndDate)
      );
    } catch (error) {
      console.error('Error loading deposit details:', error);
      Alert.alert('Error', error.message || 'No se pudieron consultar los datos del deposito.');
    } finally {
      setLoadingDepositDetails(false);
    }
  };

  const handleGenerateUserQr = async (targetUser) => {
    if (!targetUser?.id_usuario) {
      return;
    }

    if (targetUser?.qrCliente?.codigo_qr) {
      Alert.alert(
        'QR ya generado',
        `Este usuario ya tiene un QR activo:\n${targetUser.qrCliente.codigo_qr}`
      );
      return;
    }

    try {
      const qrCode = buildQrClienteCode(targetUser.id_usuario);

      await saveTable({
        data: {
          id_usuario: Number(targetUser.id_usuario),
          codigo_qr: qrCode,
          activo: 1,
          visible: 1,
          vigente_desde: null,
          vigente_hasta: null,
          usu_reg: user?.id_usuario ?? 0,
          usu_act: user?.id_usuario ?? 0,
        },
        config: {
          tabla: 'qr_cliente',
          editar: false,
        },
        bitacora: {
          script: 'App.home.generateUserQr',
        },
      });

      await loadUsersView();
      Alert.alert('QR generado', 'El codigo QR fue creado con vigencia vacia.');
    } catch (error) {
      console.error('Error generating user QR:', error);
      Alert.alert('Error', error.message || 'No se pudo generar el QR del usuario.');
    }
  };

  const handleDepositCredits = async () => {
    const amountValue = Number.parseFloat(depositAmount);

    if (!depositTarget?.id_usuario || Number.isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Monto invalido', 'Captura un monto valido para depositar creditos.');
      return;
    }

    if (
      depositVigenteDesde.trim() &&
      depositVigenteHasta.trim() &&
      parseDateTimeInput(depositVigenteHasta).getTime() < parseDateTimeInput(depositVigenteDesde).getTime()
    ) {
      Alert.alert('Vigencia invalida', 'La vigencia final del QR no puede ser menor a la inicial.');
      return;
    }

    try {
      setSavingDeposit(true);
      const vigenteDesdeSql = depositVigenteDesde.trim()
        ? normalizeDateTimeValue(depositVigenteDesde)
        : null;
      const vigenteHastaSql = depositVigenteHasta.trim()
        ? normalizeDateTimeValue(depositVigenteHasta)
        : null;

      const previousBalance = Number(depositTarget?.monto_deposito ?? 0);
      const nextBalance = previousBalance + amountValue;

      if (depositQrRowId) {
        await saveTable({
          data: {
            vigente_desde: vigenteDesdeSql,
            vigente_hasta: vigenteHastaSql,
            usu_act: user?.id_usuario ?? 0,
          },
          config: {
            tabla: 'qr_cliente',
            editar: true,
            idEditar: { id_qr_cliente: Number(depositQrRowId) },
          },
          bitacora: {
            script: 'App.home.depositCredits.qr',
          },
        });
      }

      const paymentResponse = await saveTable({
        data: {
          id_tipo_pago: 1,
          id_usuario: Number(depositTarget.id_usuario),
          id_establecimiento: depositTarget.id_establecimiento ? Number(depositTarget.id_establecimiento) : null,
          monto: amountValue.toFixed(2),
          propina: '0.00',
          total: amountValue.toFixed(2),
          visible: 0,
          usu_reg: user?.id_usuario ?? 0,
          usu_act: user?.id_usuario ?? 0,
        },
        config: {
          tabla: 'pagos',
          editar: false,
        },
        bitacora: {
          script: 'App.home.depositCredits.payment',
        },
      });

      await saveTable({
        data: {
          id_pagos: Number(paymentResponse?.idRegistro ?? 0) || null,
          id_usuario: Number(depositTarget.id_usuario),
          id_establecimiento: depositTarget.id_establecimiento ? Number(depositTarget.id_establecimiento) : null,
          tipo_movimiento: 'abono',
          tipo_origen: 'deposito_credito',
          creditos: amountValue.toFixed(2),
          saldo_anterior: previousBalance.toFixed(2),
          saldo_nuevo: nextBalance.toFixed(2),
          descripcion: 'Deposito de creditos desde la app TI',
          visible: 1,
          usu_reg: user?.id_usuario ?? 0,
          usu_act: user?.id_usuario ?? 0,
        },
        config: {
          tabla: 'detalle_movimiento',
          editar: false,
        },
        bitacora: {
          script: 'App.home.depositCredits.movement',
        },
      });

      await saveTable({
        data: {
          monto_deposito: nextBalance.toFixed(2),
          usu_act: user?.id_usuario ?? 0,
        },
        config: {
          tabla: 'usuario',
          editar: true,
          idEditar: { id_usuario: Number(depositTarget.id_usuario) },
        },
        bitacora: {
          script: 'App.home.depositCredits.userBalance',
        },
      });

      closeDepositModal();
      await Promise.all([
        loadUsersView(),
        loadPaymentsView(),
      ]);
      Alert.alert('Creditos depositados', 'El deposito fue registrado correctamente.');
    } catch (error) {
      console.error('Error depositing credits:', error);
      Alert.alert('Error', error.message || 'No se pudo registrar el deposito.');
    } finally {
      setSavingDeposit(false);
    }
  };

  const handleReportStatusChange = async (reportId, nextStatus) => {
    try {
      await updatePaymentReportStatus(reportId, nextStatus);
      await loadReportsView();
      Alert.alert('Reporte actualizado', 'El estatus del reporte fue actualizado correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el reporte.');
    }
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshingHome}
            onRefresh={refreshHomeData}
            colors={['#4A0B17']}
            tintColor="#4A0B17"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{getRoleLabel(user?.id_perfil)}</Text>
          <Text style={styles.welcome}>Te damos la bienvenida, {user?.nombre}</Text>
          <Text style={styles.subtitle}>{roleConfig.homeSubtitle}</Text>
        </View>

        {isProvider && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acciones de proveedor</Text>

            {providerEstablishments.length > 0 && (
              <View style={styles.establishmentsCard}>
                <Text style={styles.establishmentsLabel}>
                  {user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER
                    ? 'Establecimiento asignado'
                    : 'Establecimiento activo para cobro'}
                </Text>
                <View style={styles.establishmentsList}>
                  {providerEstablishments.map((establecimiento) => {
                    const establecimientoId = String(establecimiento.id_establecimiento);
                    const isActive = String(activeEstablecimientoId ?? '') === establecimientoId;

                    return (
                      <TouchableOpacity
                        key={establecimientoId}
                        style={[styles.establishmentChip, isActive && styles.establishmentChipActive]}
                        onPress={() => setActiveEstablecimiento(establecimientoId)}
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

            <TouchableOpacity style={styles.card} onPress={() => router.push('/(modals)/scanner')}>
              <Text style={styles.cardTitle}>Escanear QR para cobrar</Text>
              <Text style={styles.cardDescription}>Inicia una solicitud de pago para un cliente.</Text>
            </TouchableOpacity>
          </View>
        )}

        {isClient && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acciones de cliente</Text>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Saldo disponible</Text>
              <Text style={styles.balanceValue}>
                {hasClientBalanceValue
                  ? `$${Number(clientBalance).toFixed(2)}`
                  : 'Pendiente de sincronizar'}
              </Text>
            </View>

            <ClientQRGenerator />
          </View>
        )}

        {isAdminOrManager && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reportes</Text>
              {buildAdminCards().map((card) => (
                <View key={card.key} style={styles.card}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                  <Text style={styles.cardMeta}>{card.actionLabel}</Text>

                  {isAdmin ? (
                    <>
                      {reportsEndpointUnavailable ? (
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyBoxText}>
                            El endpoint de reportes aun no esta disponible en backend.
                          </Text>
                        </View>
                      ) : (
                        <>
                      <View style={styles.searchBlock}>
                        <Text style={styles.inputLabel}>Buscar reportes</Text>
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
                          <Text style={styles.emptyBoxText}>Cargando reportes...</Text>
                        </View>
                      ) : visibleReports.length === 0 ? (
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyBoxText}>No hay reportes registrados para mostrar.</Text>
                        </View>
                      ) : (
                        <>
                          {visibleReports.map((record) => (
                            <View key={String(record.id_reporte)} style={styles.reportCard}>
                              <View style={styles.userCardHeader}>
                                <Text style={styles.userCardTitle}>Reporte #{record.id_reporte}</Text>
                                <Text style={styles.userCardId}>{record.estatus || 'pendiente'}</Text>
                              </View>
                              <Text style={styles.userCardMeta}>Pago relacionado: #{record.id_pagos || 'N/D'}</Text>
                              <Text style={styles.userCardMeta}>Cliente: {record.usuarioLabel}</Text>
                              <Text style={styles.userCardMeta}>
                                Establecimiento: {record.establecimientoLabel}
                              </Text>
                              <Text style={styles.userCardMeta}>Tipo: {record.tipo_reporte || 'Sin tipo'}</Text>
                              <Text style={styles.userCardMeta}>Total: ${Number(record.total ?? 0).toFixed(2)}</Text>
                              <Text style={styles.userCardMeta}>
                                Fecha del movimiento: {record.fecha_movimiento || 'Sin fecha'}
                              </Text>

                              <View style={styles.reportActions}>
                                <TouchableOpacity
                                  style={styles.reportStatusButton}
                                  onPress={() => handleReportStatusChange(record.id_reporte, 'en_revision')}
                                >
                                  <Text style={styles.reportStatusButtonText}>En revision</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.reportStatusButton, styles.reportStatusButtonSuccess]}
                                  onPress={() => handleReportStatusChange(record.id_reporte, 'resuelto')}
                                >
                                  <Text style={styles.reportStatusButtonText}>Resuelto</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}

                          {filteredReports.length > visibleReportsCount ? (
                            <TouchableOpacity
                              style={styles.loadMoreButton}
                              onPress={() => setVisibleReportsCount((current) => current + 10)}
                            >
                              <Text style={styles.loadMoreButtonText}>Ver mas reportes</Text>
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
                      <Text style={styles.emptyBoxText}>No hay pagos registrados para mostrar.</Text>
                    </View>
                  ) : (
                    <>
                      {visiblePayments.map((record) => (
                        <View key={String(record.id_pagos)} style={styles.reportCard}>
                          <View style={styles.userCardHeader}>
                            <Text style={styles.userCardTitle}>Pago #{record.id_pagos}</Text>
                            <Text style={styles.userCardId}>{record.tipoPagoLabel}</Text>
                          </View>
                          <Text style={styles.userCardMeta}>Usuario: {record.usuarioLabel}</Text>
                          <Text style={styles.userCardMeta}>
                            Establecimiento: {record.establecimientoLabel}
                          </Text>
                          <Text style={styles.userCardMeta}>Monto: ${Number(record.monto ?? 0).toFixed(2)}</Text>
                          <Text style={styles.userCardMeta}>Total: ${Number(record.total ?? 0).toFixed(2)}</Text>
                          <Text style={styles.userCardMeta}>Fecha: {record.fec_reg || 'Sin fecha'}</Text>
                        </View>
                      ))}

                      {filteredPayments.length > visiblePaymentsCount ? (
                        <TouchableOpacity
                          style={styles.loadMoreButton}
                          onPress={() => setVisiblePaymentsCount((current) => current + 10)}
                        >
                          <Text style={styles.loadMoreButtonText}>Ver mas pagos</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Usuarios</Text>
              <Text style={styles.sectionDescription}>
                {isAdmin
                  ? 'Consulta usuarios y deposita creditos a los perfiles permitidos.'
                  : 'Vista de consulta homologada con la web para seguimiento de usuarios.'}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {ADMIN_FILTERS.map((filter) => {
                  const isActive = Number(selectedRoleFilter) === Number(filter.id);

                  return (
                    <TouchableOpacity
                      key={String(filter.id)}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() => setSelectedRoleFilter(filter.id)}
                    >
                      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {loadingUsers ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>Cargando usuarios...</Text>
                </View>
              ) : filteredUsers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxText}>No hay usuarios para este filtro.</Text>
                </View>
              ) : (
                visibleUsers.map((record) => (
                  <View key={String(record.id_usuario)} style={styles.userCard}>
                    <View style={styles.userCardHeader}>
                      <Text style={styles.userCardTitle}>{record.fullName}</Text>
                      <Text style={styles.userCardId}>ID {record.id_usuario}</Text>
                    </View>

                    <Text style={styles.userCardMeta}>Usuario: {record.usuario || 'N/D'}</Text>
                    <Text style={styles.userCardMeta}>Perfil: {record.roleLabel}</Text>
                    <Text style={styles.userCardMeta}>
                      Establecimiento: {record.establecimientoLabel}
                    </Text>
                    <Text style={styles.userCardMeta}>Correo: {record.correo || 'Sin correo'}</Text>
                    <Text style={styles.userCardMeta}>
                      QR: {record.qrCliente?.codigo_qr || 'Sin QR generado'}
                    </Text>

                    {isAdmin && isDepositoCreditosAllowedForPerfil(record.id_perfil) && (
                      <View style={styles.userActions}>
                        <TouchableOpacity
                          style={styles.depositButton}
                          onPress={() => openDepositModal(record)}
                        >
                          <Text style={styles.depositButtonText}>Depositar creditos</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.qrActionButton,
                            record.qrCliente?.codigo_qr && styles.qrActionButtonDisabled,
                          ]}
                          onPress={() => handleGenerateUserQr(record)}
                        >
                          <Text style={styles.qrActionButtonText}>
                            {record.qrCliente?.codigo_qr ? 'QR generado' : 'Generar QR'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}

              {filteredUsers.length > visibleUsersCount ? (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={() => setVisibleUsersCount((current) => current + 10)}
                >
                  <Text style={styles.loadMoreButtonText}>Ver mas usuarios</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}

      </ScrollView>

      <Modal visible={depositModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Depositar creditos</Text>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Usuario</Text>
              <TextInput style={styles.input} value={depositTarget?.usuario || ''} editable={false} />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Nombre completo</Text>
              <TextInput style={styles.input} value={depositTarget?.fullName || ''} editable={false} />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Codigo QR</Text>
              <TextInput
                style={styles.input}
                value={loadingDepositDetails ? 'Consultando...' : (depositQrCode || 'Sin QR vigente')}
                editable={false}
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Saldo actual</Text>
              <TextInput
                style={styles.input}
                value={`$${Number(depositTarget?.monto_deposito ?? 0).toFixed(2)}`}
                editable={false}
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Monto a depositar</Text>
              <TextInput
                style={styles.input}
                value={depositAmount}
                onChangeText={setDepositAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor="#999"
              />
            </View>

            <DateTimeSelector
              label="Vigente desde"
              value={depositVigenteDesde}
              onChange={setDepositVigenteDesde}
            />

            <DateTimeSelector
              label="Vigente hasta"
              value={depositVigenteHasta}
              onChange={setDepositVigenteHasta}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeDepositModal}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, savingDeposit && styles.disabledButton]}
                onPress={handleDepositCredits}
                disabled={savingDeposit}
              >
                <Text style={styles.primaryButtonText}>
                  {savingDeposit ? 'Guardando...' : 'Guardar deposito'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginTop: 12,
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E6C17',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  welcome: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#5f5f5f',
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  cardMeta: {
    marginTop: 10,
    fontSize: 12,
    color: '#8E6C17',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  searchBlock: {
    marginTop: 16,
  },
  establishmentsCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  establishmentsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B4F0F',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  establishmentsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  establishmentChip: {
    borderWidth: 1,
    borderColor: '#D8C48A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFF9EA',
  },
  establishmentChipActive: {
    backgroundColor: '#4A0B17',
    borderColor: '#4A0B17',
  },
  establishmentChipText: {
    color: '#4A0B17',
    fontSize: 13,
    fontWeight: '600',
  },
  establishmentChipTextActive: {
    color: '#F6E7B0',
  },
  balanceCard: {
    backgroundColor: '#4A0B17',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8DAB2',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F4D03F',
  },
  filterRow: {
    gap: 8,
    paddingBottom: 6,
  },
  filterChip: {
    backgroundColor: '#FFF9EA',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8C48A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#4A0B17',
    borderColor: '#4A0B17',
  },
  filterChipText: {
    color: '#4A0B17',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#F6E7B0',
  },
  userCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  reportCard: {
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  userCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
  },
  userCardId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E6C17',
    textTransform: 'uppercase',
  },
  userCardMeta: {
    fontSize: 14,
    color: '#5f5f5f',
    marginBottom: 4,
  },
  userActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  depositButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1F8A4D',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  depositButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  qrActionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#4A0B17',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  qrActionButtonDisabled: {
    backgroundColor: '#8E8E93',
  },
  qrActionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reportActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  reportStatusButton: {
    flex: 1,
    backgroundColor: '#A66A00',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reportStatusButtonSuccess: {
    backgroundColor: '#1F8A4D',
  },
  reportStatusButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  loadMoreButton: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: '#E8F1FB',
    borderRadius: 10,
    paddingVertical: 12,
  },
  loadMoreButtonText: {
    color: '#1C5D99',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  emptyBoxText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 18,
  },
  formBlock: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B4F0F',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
  },
  dateTimeSelector: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1D6B8',
    padding: 14,
    marginBottom: 14,
  },
  dateTimeHeader: {
    marginBottom: 12,
  },
  dateTimeValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#4A0B17',
  },
  calendarControls: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  calendarNavButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calendarNavText: {
    color: '#4A0B17',
    fontWeight: '700',
  },
  calendarTodayButton: {
    flex: 1,
    backgroundColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calendarTodayText: {
    color: '#fff',
    fontWeight: '700',
  },
  calendarStrip: {
    gap: 8,
    paddingBottom: 10,
  },
  calendarDayChip: {
    minWidth: 76,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8C48A',
    backgroundColor: '#FFF9EA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calendarDayChipActive: {
    backgroundColor: '#4A0B17',
    borderColor: '#4A0B17',
  },
  calendarDayText: {
    color: '#4A0B17',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  calendarDayTextActive: {
    color: '#F6E7B0',
  },
  timePickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  timePickerColumn: {
    flex: 1,
  },
  timePickerLabel: {
    fontSize: 12,
    color: '#777',
    marginBottom: 6,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1D6B8',
    borderRadius: 10,
    overflow: 'hidden',
  },
  timeStepperButton: {
    width: 42,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFF9EA',
  },
  timeStepperText: {
    color: '#4A0B17',
    fontSize: 18,
    fontWeight: '700',
  },
  timeStepperInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    paddingVertical: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#4A0B17',
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
