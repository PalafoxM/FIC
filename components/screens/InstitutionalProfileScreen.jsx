import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ClientQRGenerator from '../ClientQRGenerator';
import {
  getRoleLabel,
  getInstitutionalEstablishment,
  resolveInstitutionalPartida,
} from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const formatCurrency = (amount) => `$${Number(amount ?? 0).toFixed(2)}`;

const formatMovementDate = (value) => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Sin fecha';
  }

  return parsedDate.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getMovementTitle = (movement) => {
  const rawType = [
    movement?.tipo_pago,
    movement?.dsc_tipo_pago,
    movement?.tipo_movimiento,
    movement?.dsc_tipo_movimiento,
    movement?.concepto,
    movement?.descripcion,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(abono|deposito|dep[oó]sito|recarga|saldo inicial|saldo semanal)/i.test(rawType)) {
    return 'Abono';
  }

  return 'Consumo';
};

export default function InstitutionalProfileScreen() {
  const {
    user,
    getClientAvailableBalance,
    getConsumptionPayments,
  } = useAuth();
  const [balance, setBalance] = useState(
    user?.saldo ?? user?.saldo_actual ?? user?.saldoDisponible ?? null
  );
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const institutionalEstablishment = useMemo(
    () => getInstitutionalEstablishment(user?.id_perfil),
    [user?.id_perfil]
  );
  const effectivePartida = useMemo(
    () => resolveInstitutionalPartida(user),
    [user]
  );

  const displayName = [user?.nombre, user?.primer_apellido, user?.segundo_apellido]
    .filter(Boolean)
    .join(' ')
    .trim();

  const loadProfileData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setErrorMessage('');

      const [nextBalance, nextMovements] = await Promise.all([
        getClientAvailableBalance(user?.id_usuario).catch(() =>
          Number(
            user?.saldo ??
            user?.saldo_actual ??
            user?.saldoDisponible ??
            0
          )
        ),
        getConsumptionPayments(user?.id_usuario),
      ]);

      setBalance(nextBalance);
      setMovements(Array.isArray(nextMovements) ? nextMovements : []);
    } catch (error) {
      console.error('Error loading institutional profile:', error);
      setMovements([]);
      setErrorMessage(
        error?.message || 'No se pudo cargar la información de tu perfil institucional.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    getClientAvailableBalance,
    getConsumptionPayments,
    user?.id_usuario,
    user?.saldo,
    user?.saldoDisponible,
    user?.saldo_actual,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadProfileData(true);
    }, [loadProfileData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadProfileData(false);
  };

  const latestMovements = movements.slice(0, 20);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#263B80" />
        <Text style={styles.loadingText}>Cargando perfil institucional...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#263B80']}
          tintColor="#263B80"
        />
      }
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>{getRoleLabel(user?.id_perfil)}</Text>
        <Text style={styles.heroTitle}>{displayName || user?.usuario || 'Usuario institucional'}</Text>
        <Text style={styles.heroSubtitle}>
          Consulta tu saldo, QR vigente y el historial de consumos de tu cuenta.
        </Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo disponible</Text>
        <Text style={styles.balanceValue}>
          {balance !== null && balance !== undefined
            ? formatCurrency(balance)
            : 'Pendiente de sincronizar'}
        </Text>
      </View>

      <ClientQRGenerator />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos básicos</Text>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Usuario</Text>
            <Text style={styles.metaValue}>{user?.usuario || 'Sin usuario'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Correo</Text>
            <Text style={styles.metaValue}>{user?.correo || 'Sin correo'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Partida</Text>
            <Text style={styles.metaValue}>
              {effectivePartida?.clave_partida || effectivePartida?.nombre_partida || 'Sin partida'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Establecimiento</Text>
            <Text style={styles.metaValue}>
              {user?.establecimiento_nombre ||
                user?.dsc_establecimiento ||
                institutionalEstablishment?.dsc_establecimiento ||
                'Sin establecimiento'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>ID establecimiento</Text>
            <Text style={styles.metaValue}>
              {user?.id_establecimiento ??
                institutionalEstablishment?.id_establecimiento ??
                'N/D'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historial de consumos</Text>

        {errorMessage ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No se pudo cargar el historial</Text>
            <Text style={styles.emptyText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadProfileData(true)}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!errorMessage && latestMovements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin movimientos</Text>
            <Text style={styles.emptyText}>
              Tus consumos y abonos apareceran aqui cuando existan registros disponibles.
            </Text>
          </View>
        ) : null}

        {!errorMessage && latestMovements.length > 0 ? (
          latestMovements.map((movement, index) => (
            <View
              key={String(movement?.id_pagos ?? movement?.id ?? `movement-${index}`)}
              style={styles.movementCard}
            >
              <View style={styles.movementHeader}>
                <Text style={styles.movementTitle}>{getMovementTitle(movement)}</Text>
                <Text style={styles.movementAmount}>
                  {formatCurrency(movement?.total ?? movement?.monto ?? movement?.amount ?? 0)}
                </Text>
              </View>

              <Text style={styles.movementMeta}>
                {movement?.establecimiento_nombre ||
                  movement?.establecimientoLabel ||
                  movement?.dsc_establecimiento ||
                  'Establecimiento no disponible'}
              </Text>
              <Text style={styles.movementMeta}>
                {movement?.tipo_pago || movement?.dsc_tipo_pago || 'Tipo no disponible'}
              </Text>
              <Text style={styles.movementDate}>
                {formatMovementDate(
                  movement?.fec_reg ?? movement?.createdAt ?? movement?.date ?? null
                )}
              </Text>
            </View>
          ))
        ) : null}
      </View>
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
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#5F6782',
  },
  heroCard: {
    backgroundColor: '#263B80',
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
  },
  heroEyebrow: {
    color: '#F4C95D',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#E8EEFF',
    fontSize: 14,
    lineHeight: 21,
  },
  balanceCard: {
    backgroundColor: '#0F6D5F',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  balanceLabel: {
    color: '#D7FFF6',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    color: '#263B80',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 16,
  },
  metaRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3FA',
  },
  metaLabel: {
    color: '#7B8499',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: {
    color: '#263B80',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 18,
  },
  emptyTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 21,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: '#263B80',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  movementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 16,
    marginBottom: 12,
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  movementTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  movementAmount: {
    color: '#0F6D5F',
    fontSize: 16,
    fontWeight: '800',
  },
  movementMeta: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  movementDate: {
    color: '#8B93A6',
    fontSize: 12,
    marginTop: 4,
  },
});
