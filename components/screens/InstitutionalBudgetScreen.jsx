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
import AccessDenied from '../AccessDenied';
import { isInstitutionalPortalProfile, resolveInstitutionalPartida } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';

const formatCurrency = (value) => `$${Number(value ?? 0).toFixed(2)}`;

export default function InstitutionalBudgetScreen() {
  const { user } = useAuth();
  const { getInstitutionalPartidas, getInstitutionalPartidasDashboard } = useApi();
  const [partidas, setPartidas] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const effectivePartida = useMemo(
    () => resolveInstitutionalPartida(user),
    [user]
  );
  const partidaKey = String(effectivePartida?.clave_partida ?? '').trim();
  const partidaName = effectivePartida?.nombre_partida || (partidaKey ? `Partida ${partidaKey}` : 'Partida');
  const institutionalAccessDenied = isInstitutionalPortalProfile(user?.id_perfil);

  const loadBudget = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setErrorMessage('');

      const [partidasResponse, dashboardResponse] = await Promise.all([
        getInstitutionalPartidas(),
        getInstitutionalPartidasDashboard(),
      ]);

      const normalizedPartidas = Array.isArray(partidasResponse?.data)
        ? partidasResponse.data
        : [];

      setPartidas(normalizedPartidas);
      setSummary(dashboardResponse?.summary ?? normalizedPartidas[0] ?? null);
    } catch (error) {
      console.error('Error loading institutional budget:', error);
      setPartidas([]);
      setSummary(null);
      setErrorMessage(
        error?.message || `No se pudo consultar la información de ${partidaName}.`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getInstitutionalPartidas, getInstitutionalPartidasDashboard, partidaName]);

  useFocusEffect(
    useCallback(() => {
      loadBudget(true);
    }, [loadBudget])
  );

  const visiblePartidas = useMemo(
    () =>
      partidas.filter((item) => {
        const currentKey = String(item?.clave_partida ?? '').trim();

        if (partidaKey && currentKey) {
          return currentKey === partidaKey;
        }

        if (effectivePartida?.id_partida !== null && effectivePartida?.id_partida !== undefined) {
          return Number(item?.id_partida ?? 0) === Number(effectivePartida.id_partida);
        }

        return true;
      }),
    [effectivePartida?.id_partida, partidaKey, partidas]
  );

  if (institutionalAccessDenied) {
    return (
      <AccessDenied
        title="Vista no disponible"
        message="Los perfiles institucionales ya no tienen acceso a la vista de partidas o presupuesto desde la app."
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#263B80" />
        <Text style={styles.loadingText}>{`Consultando ${partidaName}...`}</Text>
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
          onRefresh={() => {
            setRefreshing(true);
            loadBudget(false);
          }}
          colors={['#263B80']}
          tintColor="#263B80"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>{partidaName}</Text>
        <Text style={styles.subtitle}>
          Vista restringida a la partida institucional disponible para tu perfil.
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No se pudo cargar la partida</Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadBudget(true)}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!errorMessage && summary ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Partida activa</Text>
          <Text style={styles.heroTitle}>
            {summary?.clave_partida || partidaKey || 'Sin clave'} - {summary?.nombre_partida || partidaName}
          </Text>
          <Text style={styles.heroSubtitle}>
            Consulta informativa del dashboard institucional filtrado para tu perfil.
          </Text>
        </View>
      ) : null}

      {!errorMessage && summary ? (
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Disponible</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.disponible)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ejercido</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.ejercido)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.total)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Usuarios</Text>
            <Text style={styles.metricValue}>{String(summary?.usuarios ?? 0)}</Text>
          </View>
        </View>
      ) : null}

      {!errorMessage && visiblePartidas.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sin partida visible</Text>
          <Text style={styles.emptyText}>
            {`El backend no devolvio registros visibles para ${partidaName} en este momento.`}
          </Text>
        </View>
      ) : null}

      {!errorMessage && visiblePartidas.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle consultado</Text>
          {visiblePartidas.map((item) => (
            <View key={String(item?.id_partida)} style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                {item?.clave_partida || partidaKey || 'Sin clave'} - {item?.nombre_partida || partidaName}
              </Text>
              <Text style={styles.detailMeta}>Disponible: {formatCurrency(item?.disponible)}</Text>
              <Text style={styles.detailMeta}>Ejercido: {formatCurrency(item?.ejercido)}</Text>
              <Text style={styles.detailMeta}>Total: {formatCurrency(item?.total)}</Text>
              <Text style={styles.detailMeta}>Usuarios: {String(item?.usuarios ?? 0)}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  header: {
    marginBottom: 18,
  },
  title: {
    color: '#263B80',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 21,
  },
  heroCard: {
    backgroundColor: '#263B80',
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#F7F9FE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D7DEEE',
  },
  metricLabel: {
    color: '#7B8499',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  metricValue: {
    color: '#263B80',
    fontSize: 18,
    fontWeight: '800',
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    color: '#263B80',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 16,
    marginBottom: 12,
  },
  detailTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  detailMeta: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
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
});
