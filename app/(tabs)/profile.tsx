import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import PayHistory from '../../components/screens/PayHistory';
import SalesHistory from '../../components/screens/SalesHistory ';
import { getRoleLabel, ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';


const buildHotelGuestName = (record) =>
  [
    record?.nombre_completo,
    [record?.nombre, record?.primer_apellido, record?.segundo_apellido].filter(Boolean).join(' '),
  ].find((value) => String(value ?? '').trim()) || 'Huésped no disponible';

const formatHotelStatus = (value) => {
  const normalized = String(value ?? 'pendiente').trim().toLowerCase();
  return normalized.replace(/_/g, ' ');
};

const getHotelStatusTone = (value) => {
  const normalized = String(value ?? 'pendiente').trim().toLowerCase();

  if (normalized === 'check_in') {
    return 'checkin';
  }

  if (normalized === 'check_out') {
    return 'checkout';
  }

  if (normalized === 'cancelado') {
    return 'cancelled';
  }

  return 'pending';
};

const getAssignedEstablishments = (user) => {
  const rawList =
    user?.establecimientos ??
    user?.assignedEstablishments ??
    user?.proveedorEstablecimientos ??
    user?.establishments ??
    [];

  if (Array.isArray(rawList) && rawList.length > 0) {
    return rawList.map((item, index) => ({
      id:
        item?.id_establecimiento ??
        item?.idEstablecimiento ??
        item?.id ??
        `establecimiento-${index}`,
      name:
        item?.dsc_establecimiento ??
        item?.establecimiento_nombre ??
        item?.nombre ??
        item?.name ??
        `Establecimiento ${index + 1}`,
    }));
  }

  if (user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER && user?.id_establecimiento) {
    return [
      {
        id: user.id_establecimiento,
        name:
          user?.dsc_establecimiento ??
          user?.establecimiento_nombre ??
          'Establecimiento asignado',
      },
    ];
  }

  if (user?.id_perfil === ROLE_IDS.PROVIDER && user?.id_establecimiento) {
    return [
      {
        id: user.id_establecimiento,
        name:
          user?.dsc_establecimiento ??
          user?.establecimiento_nombre ??
          'Establecimiento principal',
      },
    ];
  }

  return [];
};

export default function ProfileScreen() {
  const {
    user,
    activeEstablecimientoId,
    getClientAvailableBalance,
    getClientQrData,
    getTable,
  } = useAuth();
  const { getHotelHospedajes } = useApi();
  const router = useRouter();
  const [availableBalance, setAvailableBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrPayload, setQrPayload] = useState(null);
  const [ownQrStatus, setOwnQrStatus] = useState(null);
  const [activatingOwnQr, setActivatingOwnQr] = useState(false);
  const [receptionOrders, setReceptionOrders] = useState([]);
  const [loadingReceptionOrders, setLoadingReceptionOrders] = useState(false);
  const [receptionOrdersMessage, setReceptionOrdersMessage] = useState('');
  const hotelHospedajesRef = useRef(getHotelHospedajes);

  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;
  const isBusinessManager = user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isCashier = user?.id_perfil === ROLE_IDS.CASHIER;
  const isReception = user?.id_perfil === ROLE_IDS.RECEPTION;
  const isProviderOrClient = isProvider || isClient;
  const isAdminOrManager =
    user?.id_perfil === ROLE_IDS.ADMIN || user?.id_perfil === ROLE_IDS.MANAGER;
  const canManageOwnWalletView = isAdminOrManager || isCashier;
  const showInternalMeta = !isProviderOrClient && !isAdminOrManager && !isCashier;
  const showsAssignedEstablishments =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const assignedEstablishments = getAssignedEstablishments(user);

  const displayName = [user?.nombre, user?.primer_apellido, user?.segundo_apellido]
    .filter(Boolean)
    .join(' ');
  const receptionHotelName =
    assignedEstablishments[0]?.name ??
    user?.dsc_establecimiento ??
    user?.establecimiento_nombre ??
    'Hotel asignado';
  const receptionStatusLabel =
    String(activeEstablecimientoId ?? '') === String(assignedEstablishments[0]?.id ?? '')
      ? 'Activo en app'
      : 'Disponible';

  const avatarLetter = (user?.nombre || user?.usuario || '?').charAt(0).toUpperCase();

  useEffect(() => {
    hotelHospedajesRef.current = getHotelHospedajes;
  }, [getHotelHospedajes]);

  const loadOwnBalance = useCallback(async (showLoader = true) => {
    if (!canManageOwnWalletView || !user?.id_usuario) {
      return;
    }

    try {
      if (showLoader) {
        setLoadingBalance(true);
      }
      const balance = await getClientAvailableBalance(user.id_usuario);
      setAvailableBalance(balance);
    } catch (error) {
      console.error('Error loading profile balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  }, [canManageOwnWalletView, getClientAvailableBalance, user?.id_usuario]);

  useEffect(() => {
    loadOwnBalance();
  }, [loadOwnBalance]);

  const loadReceptionOrders = useCallback(async (showLoader = true) => {
    if (!isReception) {
      setReceptionOrders([]);
      setReceptionOrdersMessage('');
      return;
    }

    try {
      if (showLoader) {
        setLoadingReceptionOrders(true);
      }

      const response = await hotelHospedajesRef.current({
        limit: 10,
      });

      setReceptionOrders(Array.isArray(response?.data) ? response.data : []);
      setReceptionOrdersMessage(String(response?.message ?? '').trim());
    } catch (error) {
      console.error('Error loading hotel orders:', error);
      setReceptionOrders([]);
      setReceptionOrdersMessage('No se pudo consultar el listado hotelero en este momento.');
    } finally {
      setLoadingReceptionOrders(false);
    }
  }, [isReception]);

  useEffect(() => {
    loadReceptionOrders();
  }, [loadReceptionOrders]);

  const refreshProfile = useCallback(async () => {
    try {
      setRefreshingProfile(true);
      await loadOwnBalance(false);
      await loadReceptionOrders(false);
    } finally {
      setRefreshingProfile(false);
    }
  }, [loadOwnBalance, loadReceptionOrders]);

  if (isClient) {
    return <PayHistory />;
  }

  if (isProvider || isBusinessManager) {
    return <SalesHistory />;
  }

  const handleGenerateQr = async () => {
    if (!user?.id_usuario) {
      return;
    }

    try {
      setLoadingQr(true);
      const qrRecord = await getClientQrData(user.id_usuario, { includeInactive: true });
      const qrCode = qrRecord?.codigo_qr ?? null;

      if (!qrCode) {
        Alert.alert('Atenci\u00f3n', 'No tienes un codigo QR vigente para mostrar.');
        return;
      }

      setOwnQrStatus(qrRecord);

      setQrPayload({
        type: 'client_payment',
        id: user?.id_usuario ?? null,
        clientId: user?.id_usuario ?? null,
        clientUserId: user?.id_usuario ?? null,
        clientName: [user?.nombre, user?.primer_apellido, user?.segundo_apellido].filter(Boolean).join(' '),
        codigo_qr: qrCode,
        qr_code: qrCode,
        clientQrCode: qrCode,
        qr_operativo: Number(qrRecord?.qr_activo ?? 0) === 1,
        timestamp: new Date().toISOString(),
      });
      setQrVisible(true);
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudo obtener el código QR.');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleActivateOwnQr = async () => {
    if (!user?.id_usuario) {
      return;
    }

    try {
      setActivatingOwnQr(true);

      const folioRows = await getTable({
        tabla: 'usuario_folio_entrega',
        where: {
          id_usuario: Number(user.id_usuario),
          activo: 1,
          visible: 1,
          tipo_folio: 'titular',
        },
        order: 'id_usuario_folio_entrega DESC',
        limit: 1,
      });

      const folio = String(folioRows?.[0]?.folio ?? '').trim();
      if (!folio) {
        throw new Error('No se encontró un folio activo para este usuario.');
      }

      Alert.alert(
        'Atención',
        'Tu activación seguirá la itineración del servicio. Debes completar tu expediente documental y esperar la confirmación de TI.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Continuar',
            onPress: () => {
              setQrVisible(false);
              router.push({
                pathname: '/cashier-process',
                params: {
                  mode: 'client',
                  folio,
                },
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Atención', error.message || 'No se pudo iniciar el proceso de activación.');
    } finally {
      setActivatingOwnQr(false);
    }
  };

  const handleCreateReport = () => {
    Alert.alert(
      'Crear reporte',
      'Esta accion se vinculara con la vista de TI y gestor en la siguiente etapa.'
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshingProfile}
          onRefresh={refreshProfile}
          colors={['#263B80']}
          tintColor="#263B80"
        />
      }
    >
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>

        <Text style={styles.name}>{displayName || user?.usuario}</Text>
        <Text style={styles.email}>{user?.correo || 'Sin correo registrado'}</Text>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{getRoleLabel(user?.id_perfil)}</Text>
        </View>

        {isReception ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Hotel asignado</Text>
              <Text style={styles.heroTitle}>{receptionHotelName}</Text>
              <Text style={styles.heroDescription}>
                Perfil de consulta para recepción. Aquí puedes revisar el contexto operativo del hotel sin editar configuraciones.
              </Text>
            </View>

            <View style={styles.receptionMetricsGrid}>
              <View style={[styles.receptionMetricCard, styles.receptionMetricCardPrimary]}>
                <Text style={styles.receptionMetricLabel}>Hotel</Text>
                <Text style={styles.receptionMetricValue}>{receptionHotelName}</Text>
              </View>

              <View style={styles.receptionMetricCard}>
                <Text style={styles.receptionMetricLabel}>Usuario</Text>
                <Text style={styles.receptionMetricValue}>{user?.usuario || 'N/D'}</Text>
              </View>

              <View style={styles.receptionMetricCard}>
                <Text style={styles.receptionMetricLabel}>Estado operativo</Text>
                <Text style={styles.receptionMetricValue}>{receptionStatusLabel}</Text>
              </View>

              <View style={styles.receptionMetricCard}>
                <Text style={styles.receptionMetricLabel}>Módulo principal</Text>
                <Text style={styles.receptionMetricValue}>Recepción hotelera</Text>
              </View>
            </View>

            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Correo operativo</Text>
              <Text style={styles.metaValue}>{user?.correo || 'Sin correo registrado'}</Text>
            </View>

            

            <View style={styles.receptionTableSection}>
              <View style={styles.receptionTableHeader}>
                <View>
                  <Text style={styles.receptionTableTitle}>Hospedajes recientes</Text>
                  <Text style={styles.receptionTableSubtitle}>
                    Resumen de consulta con folio, noches, estatus y check in.
                  </Text>
                </View>

              </View>

              <TouchableOpacity
                style={styles.receptionTableAction}
                onPress={() => router.push('/hotel-operation')}
              >
                <Text style={styles.receptionTableActionText}>Abrir módulo</Text>
              </TouchableOpacity>

              <View style={styles.receptionTableCard}>
                <View style={styles.receptionTableColumns}>
                  <Text style={[styles.receptionTableColumnLabel, styles.receptionTableColumnFolio]}>Folio</Text>
                  <Text style={[styles.receptionTableColumnLabel, styles.receptionTableColumnNights]}>Noches</Text>
                  <Text style={[styles.receptionTableColumnLabel, styles.receptionTableColumnStatus]}>Estatus</Text>
                </View>

                {receptionOrders.map((order) => {
                  const statusTone = getHotelStatusTone(order?.estatus_hospedaje);
                  const statusBadgeStyle =
                    statusTone === 'checkin'
                      ? styles.receptionStatusBadgeCheckin
                      : statusTone === 'checkout'
                        ? styles.receptionStatusBadgeCheckout
                        : statusTone === 'cancelled'
                          ? styles.receptionStatusBadgeCancelled
                          : styles.receptionStatusBadgePending;

                    return (
                      <View
                      key={String(order?.id_usuario_hospedaje ?? order?.folio ?? `${order?.usuario ?? 'row'}-${order?.noches ?? 0}`)}
                        style={styles.receptionTableRow}
                      >
                      <View style={styles.receptionTablePrimaryCell}>
                        <Text style={styles.receptionTableFolio}>
                          {order?.folio || 'Sin folio'}
                        </Text>
                        <Text style={styles.receptionTableGuest}>
                          {buildHotelGuestName(order)}
                        </Text>
                        <Text style={styles.receptionTableMeta}>
                          {order?.usuario || 'Usuario no disponible'}
                        </Text>
                      </View>

                      <View style={styles.receptionTableSecondaryCell}>
                        <Text style={styles.receptionTableNights}>
                          {Number(order?.noches ?? 0)}
                        </Text>
                      </View>

                      <View style={styles.receptionTableStatusCell}>
                        <View style={[styles.receptionStatusBadge, statusBadgeStyle]}>
                          <Text style={styles.receptionStatusBadgeText}>
                            {formatHotelStatus(order?.estatus_hospedaje)}
                          </Text>
                        </View>
                        <Text style={styles.receptionTableRoomType}>
                          {order?.tipo_habitacion || 'Sin habitacion'}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {loadingReceptionOrders ? (
                  <Text style={styles.receptionTableEmpty}>
                    Consultando hospedajes del hotel...
                  </Text>
                ) : null}

                {!loadingReceptionOrders && receptionOrders.length === 0 ? (
                  <Text style={styles.receptionTableEmpty}>
                    {receptionOrdersMessage || 'No hay hospedajes disponibles para mostrar en este momento.'}
                  </Text>
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Usuario</Text>
          <Text style={styles.metaValue}>{user?.usuario || 'N/D'}</Text>
        </View>

        {showInternalMeta && !isReception && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>ID de usuario</Text>
            <Text style={styles.metaValue}>{user?.id_usuario ?? 'N/D'}</Text>
          </View>
        )}

        {showInternalMeta && !isReception && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Establecimiento</Text>
            <Text style={styles.metaValue}>{user?.id_establecimiento ?? 'N/D'}</Text>
          </View>
        )}

        {canManageOwnWalletView && (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Saldo disponible</Text>
              <Text style={styles.balanceValue}>
                {!loadingBalance && availableBalance !== null && availableBalance !== undefined
                  ? `$${Number(availableBalance).toFixed(2)}`
                  : 'Pendiente de sincronizar'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.profileActionButton, styles.profileActionButtonPrimary]}
              onPress={handleGenerateQr}
              disabled={loadingQr}
            >
              <Text style={styles.profileActionButtonText}>
                {loadingQr ? 'Consultando QR vigente...' : 'Generar codigo QR'}
              </Text>
            </TouchableOpacity>

            {(isAdminOrManager || isCashier) ? (
              <TouchableOpacity
                style={[styles.profileActionButton, styles.profileActionButtonSecondary]}
                onPress={() => router.push('/alerts')}
              >
                <Text style={styles.profileActionButtonText}>Notificaciones</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.profileActionButton,
                isCashier ? styles.profileActionButtonSecondary : styles.profileActionButtonTertiary,
              ]}
              onPress={() => router.push('/consumption')}
            >
              <Text style={styles.profileActionButtonText}>Consumo</Text>
            </TouchableOpacity>
          </>
        )}

        {showsAssignedEstablishments && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>
              {user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER
                ? 'Establecimiento asignado'
                : 'Establecimientos asignados'}
            </Text>

            {assignedEstablishments.length > 0 ? (
              assignedEstablishments.map((establecimiento) => (
                <View key={String(establecimiento.id)} style={styles.establishmentItem}>
                  <Text style={styles.metaValue}>{establecimiento.name}</Text>
                  {String(activeEstablecimientoId ?? '') === String(establecimiento.id) && (
                    <Text style={styles.establishmentActive}>Activo en app</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.metaHint}>
                Aun no recibimos la lista completa de establecimientos desde backend.
              </Text>
            )}
          </View>
        )}

        {isClient && (
          <TouchableOpacity style={styles.reportButton} onPress={handleCreateReport}>
            <Text style={styles.reportButtonText}>Crear reporte</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={qrVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQrVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.qrContainer}>
            <Text style={styles.modalTitle}>QR de usuario</Text>
            {qrPayload ? (
              <>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={JSON.stringify(qrPayload)}
                    size={220}
                    color="#263B80"
                    backgroundColor="#FFFFFF"
                  />
                </View>

                <View style={styles.qrStatusBox}>
                  <Text style={styles.qrStatusTitle}>
                    {Number(ownQrStatus?.qr_activo ?? 0) === 1 ? 'QR operativo' : 'QR inactivo'}
                  </Text>
                  <Text style={styles.qrStatusText}>
                    {Number(ownQrStatus?.qr_activo ?? 0) === 1
                      ? 'Tu codigo ya puede utilizarse.'
                      : 'Tu codigo existe pero aun no esta activado para operar.'}
                  </Text>
                </View>

                {isAdminOrManager && Number(ownQrStatus?.qr_activo ?? 0) !== 1 ? (
                  <TouchableOpacity
                    style={[styles.activateQrButton, activatingOwnQr && styles.activateQrButtonDisabled]}
                    onPress={handleActivateOwnQr}
                    disabled={activatingOwnQr}
                  >
                    <Text style={styles.activateQrButtonText}>
                      {activatingOwnQr ? 'Activando QR...' : 'Activar QR'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.closeButton} onPress={() => setQrVisible(false)}>
                  <Text style={styles.closeButtonText}>Cerrar</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  heroCard: {
    width: '100%',
    backgroundColor: '#263B80',
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F4C95D',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 14,
    color: '#E8EEFF',
    lineHeight: 21,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#263B80',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#B23A48',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 18,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  receptionMetricsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  receptionMetricCard: {
    width: '48%',
    backgroundColor: '#F7F9FE',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D7DEEE',
  },
  receptionMetricCardPrimary: {
    backgroundColor: '#EEF3FF',
    borderColor: '#263B80',
  },
  receptionMetricLabel: {
    fontSize: 12,
    color: '#5F6782',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  receptionMetricValue: {
    fontSize: 15,
    color: '#263B80',
    fontWeight: '800',
  },
  metaBlock: {
    width: '100%',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  metaLabel: {
    fontSize: 13,
    color: '#777',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    color: '#222',
    fontWeight: '600',
  },
  metaHint: {
    fontSize: 14,
    color: '#777',
    lineHeight: 20,
  },
  receptionTableSection: {
    width: '100%',
    marginTop: 10,
  },
  receptionTableHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  receptionTableTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#263B80',
    marginBottom: 4,
  },
  receptionTableSubtitle: {
    fontSize: 13,
    color: '#5F6782',
    lineHeight: 18,
    maxWidth: 220,
  },
  receptionTableAction: {
    width: '100%',
    backgroundColor: '#263B80',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  receptionTableActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  receptionTableCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5EAF6',
    overflow: 'hidden',
  },
  receptionTableColumns: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F4F7FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF6',
  },
  receptionTableColumnLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5F6782',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  receptionTableColumnFolio: {
    flex: 1.6,
  },
  receptionTableColumnNights: {
    flex: 0.6,
    textAlign: 'center',
  },
  receptionTableColumnStatus: {
    flex: 1,
    textAlign: 'right',
  },
  receptionTableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3FA',
  },
  receptionTablePrimaryCell: {
    flex: 1.6,
    paddingRight: 10,
  },
  receptionTableSecondaryCell: {
    flex: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receptionTableStatusCell: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  receptionTableFolio: {
    fontSize: 15,
    fontWeight: '800',
    color: '#263B80',
    marginBottom: 2,
  },
  receptionTableGuest: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2A44',
    marginBottom: 3,
  },
  receptionTableMeta: {
    fontSize: 12,
    color: '#5F6782',
    lineHeight: 18,
  },
  receptionTableNights: {
    fontSize: 22,
    fontWeight: '800',
    color: '#263B80',
  },
  receptionStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  receptionStatusBadgePending: {
    backgroundColor: '#FFF4D8',
  },
  receptionStatusBadgeCheckin: {
    backgroundColor: '#DFF6EA',
  },
  receptionStatusBadgeCheckout: {
    backgroundColor: '#E2EAFF',
  },
  receptionStatusBadgeCancelled: {
    backgroundColor: '#FDE2E4',
  },
  receptionStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#263B80',
    textTransform: 'uppercase',
  },
  receptionTableRoomType: {
    fontSize: 12,
    color: '#5F6782',
    textAlign: 'right',
  },
  receptionTableEmpty: {
    fontSize: 14,
    color: '#5F6782',
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  balanceCard: {
    width: '100%',
    backgroundColor: '#263B80',
    borderRadius: 14,
    padding: 18,
    marginTop: 16,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileActionButton: {
    width: '100%',
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  profileActionButtonPrimary: {
    backgroundColor: '#263B80',
  },
  profileActionButtonSecondary: {
    backgroundColor: '#3C46C7',
  },
  profileActionButtonTertiary: {
    backgroundColor: '#7A80E8',
  },
  profileActionButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  establishmentItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  establishmentActive: {
    marginTop: 4,
    fontSize: 12,
    color: '#B23A48',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reportButton: {
    width: '100%',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#263B80',
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
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
  qrWrapper: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  qrStatusBox: {
    width: '100%',
    backgroundColor: '#F7F9FE',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  qrStatusTitle: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  qrStatusText: {
    color: '#4D5C7A',
    fontSize: 14,
    lineHeight: 20,
  },
  activateQrButton: {
    width: '100%',
    backgroundColor: '#263B80',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  activateQrButtonDisabled: {
    opacity: 0.6,
  },
  activateQrButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
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
