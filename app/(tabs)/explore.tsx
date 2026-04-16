import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const getTipoLabel = (idTipo) => {
  const labels = {
    1: 'Restaurant',
    2: 'Hotel',
    3: 'General',
    4: 'Cliente FIC',
  };

  return labels[idTipo] || 'Sin tipo';
};

export default function ExploreScreen() {
  const { user, getTable } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isRestrictedRole =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;

  const title = useMemo(() => 'Establecimientos participantes', []);
  const subtitle = useMemo(
    () => 'Consulta nombre, tipo y direccion de los establecimientos visibles dentro del programa.',
    []
  );

  const loadData = useCallback(async () => {
    if (isRestrictedRole) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);

      const establecimientos = await getTable({
        tabla: 'establecimiento',
        where: { visible: 1 },
        order: 'dsc_establecimiento ASC',
      });

      setItems(
        establecimientos.map((item) => ({
          id: item.id_establecimiento,
          title: item.dsc_establecimiento || 'Establecimiento',
          type: getTipoLabel(item.id_tipo),
          address: item.direccion || 'Direccion pendiente',
        }))
      );
    } catch (error) {
      console.error('Error loading explore data:', error);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getTable, isRestrictedRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isRestrictedRole) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Participantes</Text>
        <Text style={styles.emptyText}>
          Esta vista no aplica para proveedor ni gerente de negocio.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A0B17" />
        <Text style={styles.loadingText}>Cargando informacion...</Text>
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
            loadData();
          }}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Sin registros</Text>
          <Text style={styles.emptyText}>No hay informacion disponible para mostrar.</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={String(item.id)} style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>

            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Tipo</Text>
              <Text style={styles.metaValue}>{item.type}</Text>
            </View>

            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Direccion</Text>
              <Text style={styles.metaValue}>{item.address}</Text>
            </View>
          </View>
        ))
      )}
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
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5f5f5f',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 12,
  },
  metaBlock: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E6C17',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f5f5f5',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
    textAlign: 'center',
  },
});
