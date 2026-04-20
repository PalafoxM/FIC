import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ClientQRGenerator from '../../components/ClientQRGenerator';
import { getRoleConfig, getRoleLabel, ROLE_IDS } from '../../constants/roles';
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

export default function HomeScreen() {
  const {
    user,
    activeEstablecimientoId,
    setActiveEstablecimiento,
    getClientAvailableBalance,
    getTable,
    saveTable,
  } = useAuth();
  const router = useRouter();

  const [clientBalance, setClientBalance] = useState(
    user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null
  );
  const [loadingClientBalance, setLoadingClientBalance] = useState(false);
  const [usersView, setUsersView] = useState([]);
  const [paymentsView, setPaymentsView] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(0);
  const [visibleUsersCount, setVisibleUsersCount] = useState(10);
  const [visiblePaymentsCount, setVisiblePaymentsCount] = useState(10);
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositQrCode, setDepositQrCode] = useState('');
  const [depositQrRowId, setDepositQrRowId] = useState(null);
  const [depositVigenteDesde, setDepositVigenteDesde] = useState('');
  const [depositVigenteHasta, setDepositVigenteHasta] = useState('');
  const [loadingDepositDetails, setLoadingDepositDetails] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);

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

      const [usuarios, establecimientos] = await Promise.all([
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
      ]);

      const establecimientosMap = establecimientos.reduce((accumulator, establecimiento) => {
        accumulator[String(establecimiento.id_establecimiento)] =
          establecimiento.dsc_establecimiento || 'Sin establecimiento';
        return accumulator;
      }, {});

      setUsersView(
        usuarios.map((usuarioRecord) => ({
          ...usuarioRecord,
          fullName: buildFullName(usuarioRecord),
          roleLabel: getRoleLabel(usuarioRecord.id_perfil),
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

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const refreshBalanceOnFocus = async () => {
        if (!isClient || !user?.id_usuario) {
          return;
        }

        try {
          setLoadingClientBalance(true);
          const balance = await getClientAvailableBalance(user.id_usuario);

          if (isMounted) {
            setClientBalance(balance);
          }
        } catch (balanceError) {
          console.error('Error refreshing client balance on focus:', balanceError);
        } finally {
          if (isMounted) {
            setLoadingClientBalance(false);
          }
        }
      };

      refreshBalanceOnFocus();

      if (isAdminOrManager) {
        loadUsersView();
        loadPaymentsView();
      }

      return () => {
        isMounted = false;
      };
    }, [getClientAvailableBalance, isAdminOrManager, isClient, loadPaymentsView, loadUsersView, user?.id_usuario])
  );

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
    setDepositTarget(targetUser);
    setDepositAmount('');
    setDepositQrCode('');
    setDepositQrRowId(null);
    setDepositVigenteDesde('');
    setDepositVigenteHasta('');
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
      setDepositVigenteDesde(qrRecord?.vigente_desde ?? '');
      setDepositVigenteHasta(qrRecord?.vigente_hasta ?? '');
    } catch (error) {
      console.error('Error loading deposit details:', error);
      Alert.alert('Error', error.message || 'No se pudieron consultar los datos del deposito.');
    } finally {
      setLoadingDepositDetails(false);
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
      new Date(depositVigenteHasta).getTime() < new Date(depositVigenteDesde).getTime()
    ) {
      Alert.alert('Vigencia invalida', 'La vigencia final del QR no puede ser menor a la inicial.');
      return;
    }

    try {
      setSavingDeposit(true);

      const previousBalance = Number(depositTarget?.monto_deposito ?? 0);
      const nextBalance = previousBalance + amountValue;

      if (depositQrRowId) {
        await saveTable({
          data: {
            vigente_desde: depositVigenteDesde.trim() || null,
            vigente_hasta: depositVigenteHasta.trim() || null,
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
      await loadUsersView();
      Alert.alert('Creditos depositados', 'El deposito fue registrado correctamente.');
    } catch (error) {
      console.error('Error depositing credits:', error);
      Alert.alert('Error', error.message || 'No se pudo registrar el deposito.');
    } finally {
      setSavingDeposit(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                {!loadingClientBalance && clientBalance !== null && clientBalance !== undefined
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

                    {isAdmin && isDepositoCreditosAllowedForPerfil(record.id_perfil) && (
                      <TouchableOpacity
                        style={styles.depositButton}
                        onPress={() => openDepositModal(record)}
                      >
                        <Text style={styles.depositButtonText}>Depositar creditos</Text>
                      </TouchableOpacity>
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

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Vigente desde</Text>
              <TextInput
                style={styles.input}
                value={depositVigenteDesde}
                onChangeText={setDepositVigenteDesde}
                placeholder="YYYY-MM-DD HH:MM:SS"
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Vigente hasta</Text>
              <TextInput
                style={styles.input}
                value={depositVigenteHasta}
                onChangeText={setDepositVigenteHasta}
                placeholder="YYYY-MM-DD HH:MM:SS"
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
            </View>

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
  depositButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
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
