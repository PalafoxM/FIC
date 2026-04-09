import React, { useEffect, useMemo, useState } from 'react';
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

  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;

  const title = useMemo(() => {
    if (isClient) {
      return 'Establecimientos participantes';
    }

    if (isProvider) {
      return 'Mis establecimientos';
    }

    return 'Explorar';
  }, [isClient, isProvider]);

  const subtitle = useMemo(() => {
    if (isClient) {
      return 'Consulta los establecimientos visibles dentro del programa.';
    }

    if (isProvider) {
      return 'Revisa tus establecimientos y los gerentes asignados a cada uno.';
    }

    return 'Esta vista se habilitara para otros perfiles en una siguiente etapa.';
  }, [isClient, isProvider]);

  const loadData = async () => {
    if (!isClient && !isProvider) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);

      if (isClient) {
        const establecimientos = await getTable({
          tabla: 'establecimiento',
          where: { visible: 1 },
          order: 'dsc_establecimiento ASC',
        });

        setItems(
          establecimientos.map((item) => ({
            id: item.id_establecimiento,
            title: item.dsc_establecimiento || 'Establecimiento',
            subtitle: getTipoLabel(item.id_tipo),
            meta: item.no_proveedor ? `Proveedor ${item.no_proveedor}` : 'Participante',
          }))
        );
      } else {
        const establecimientos = await getTable({
          tabla: 'establecimiento',
          where: {
            visible: 1,
            no_proveedor: user?.id_usuario,
          },
          order: 'dsc_establecimiento ASC',
        });

        const gerentes = await getTable({
          tabla: 'usuario',
          where: {
            visible: 1,
            id_perfil: 5,
          },
          order: 'nombre ASC',
        });

        const gerentesPorEstablecimiento = gerentes.reduce((acc, gerente) => {
          const key = String(gerente.id_establecimiento ?? '');
          if (!key) {
            return acc;
          }

          if (!acc[key]) {
            acc[key] = [];
          }

          acc[key].push(
            [gerente.nombre, gerente.primer_apellido, gerente.segundo_apellido]
              .filter(Boolean)
              .join(' ') || gerente.usuario || 'Gerente'
          );

          return acc;
        }, {});

        setItems(
          establecimientos.map((item) => {
            const gerentesAsignados = gerentesPorEstablecimiento[String(item.id_establecimiento)] || [];

            return {
              id: item.id_establecimiento,
              title: item.dsc_establecimiento || 'Establecimiento',
              subtitle: getTipoLabel(item.id_tipo),
              meta:
                gerentesAsignados.length > 0
                  ? `Gerente${gerentesAsignados.length > 1 ? 's' : ''}: ${gerentesAsignados.join(', ')}`
                  : 'Sin gerente asignado',
            };
          })
        );
      }
    } catch (error) {
      console.error('Error loading explore data:', error);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id_perfil, user?.id_usuario]);

  if (!isClient && !isProvider) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Explorar</Text>
        <Text style={styles.emptyText}>
          Esta vista se activara para otros perfiles en una siguiente etapa.
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
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadData();
        }} />
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
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
            <Text style={styles.cardMeta}>{item.meta}</Text>
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
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#8E6C17',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
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
