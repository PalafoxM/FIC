import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { getRoleLabel, ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import PayHistory from '../../components/screens/PayHistory';
import SalesHistory from '../../components/screens/SalesHistory ';

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
  const { user, activeEstablecimientoId, getClientAvailableBalance, getClientQrData } = useAuth();
  const router = useRouter();
  const [availableBalance, setAvailableBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrPayload, setQrPayload] = useState(null);

  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;
  const isBusinessManager = user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isProviderOrClient = isProvider || isClient;
  const isAdminOrManager =
    user?.id_perfil === ROLE_IDS.ADMIN || user?.id_perfil === ROLE_IDS.MANAGER;
  const showInternalMeta = !isProviderOrClient && !isAdminOrManager;
  const showsAssignedEstablishments =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const assignedEstablishments = getAssignedEstablishments(user);

  const displayName = [user?.nombre, user?.primer_apellido, user?.segundo_apellido]
    .filter(Boolean)
    .join(' ');

  const avatarLetter = (user?.nombre || user?.usuario || '?').charAt(0).toUpperCase();

  const loadOwnBalance = useCallback(async (showLoader = true) => {
    if (!isAdminOrManager || !user?.id_usuario) {
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
  }, [getClientAvailableBalance, isAdminOrManager, user?.id_usuario]);

  useEffect(() => {
    loadOwnBalance();
  }, [loadOwnBalance]);

  const refreshProfile = useCallback(async () => {
    try {
      setRefreshingProfile(true);
      await loadOwnBalance(false);
    } finally {
      setRefreshingProfile(false);
    }
  }, [loadOwnBalance]);

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
      const qrRecord = await getClientQrData(user.id_usuario);
      const qrCode = qrRecord?.codigo_qr ?? null;

      if (!qrCode) {
        Alert.alert('Atenci\u00f3n', 'No tienes un codigo QR vigente para mostrar.');
        return;
      }

      setQrPayload({
        type: 'client_payment',
        codigo_qr: qrCode,
        qr_code: qrCode,
        clientQrCode: qrCode,
        timestamp: new Date().toISOString(),
      });
      setQrVisible(true);
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudo obtener el codigo QR.');
    } finally {
      setLoadingQr(false);
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
          colors={['#4A0B17']}
          tintColor="#4A0B17"
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

        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Usuario</Text>
          <Text style={styles.metaValue}>{user?.usuario || 'N/D'}</Text>
        </View>

        {showInternalMeta && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>ID de usuario</Text>
            <Text style={styles.metaValue}>{user?.id_usuario ?? 'N/D'}</Text>
          </View>
        )}

        {showInternalMeta && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Establecimiento</Text>
            <Text style={styles.metaValue}>{user?.id_establecimiento ?? 'N/D'}</Text>
          </View>
        )}

        {isAdminOrManager && (
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

            <TouchableOpacity
              style={[styles.profileActionButton, styles.profileActionButtonSecondary]}
              onPress={() => router.push('/alerts')}
            >
              <Text style={styles.profileActionButtonText}>Notificaciones</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileActionButton, styles.profileActionButtonTertiary]}
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
                    color="#2C3E50"
                    backgroundColor="#FFFFFF"
                  />
                </View>

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
    backgroundColor: '#f5f5f5',
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
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#4A0B17',
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
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 18,
  },
  badgeText: {
    color: '#4A0B17',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
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
  balanceCard: {
    width: '100%',
    backgroundColor: '#4A0B17',
    borderRadius: 14,
    padding: 18,
    marginTop: 16,
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
  profileActionButton: {
    width: '100%',
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  profileActionButtonPrimary: {
    backgroundColor: '#4A0B17',
  },
  profileActionButtonSecondary: {
    backgroundColor: '#6A2030',
  },
  profileActionButtonTertiary: {
    backgroundColor: '#8D3C4B',
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
    color: '#8E6C17',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reportButton: {
    width: '100%',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A0B17',
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#4A0B17',
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
    color: '#2C3E50',
  },
  qrWrapper: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  closeButton: {
    backgroundColor: '#FF3B30',
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

