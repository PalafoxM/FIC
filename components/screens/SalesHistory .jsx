import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import AccessDenied from '../AccessDenied';

const SalesHistory = () => {
  const { user, getSalesByProvider } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  const loadSales = useCallback(async (filters = {}, showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const salesData = await getSalesByProvider(user.id_usuario, filters);
      setSales(salesData);
      setVisibleCount(10);
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'No se pudieron cargar las ventas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getSalesByProvider, user?.id_usuario]);

  useFocusEffect(
    useCallback(() => {
      if (user && hasPermission(user?.id_perfil, 'salesHistory')) {
        loadSales({}, true);
      } else {
        setLoading(false);
      }
    }, [loadSales, user])
  );

  const filteredSales = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const sortedRows = [...sales].sort((first, second) => {
      const firstDate = new Date(first?.fec_reg || first?.createdAt || first?.date || 0).getTime();
      const secondDate = new Date(second?.fec_reg || second?.createdAt || second?.date || 0).getTime();
      return secondDate - firstDate;
    });

    if (!normalizedSearch) {
      return sortedRows;
    }

    return sortedRows.filter((item) =>
      [
        item?.id_pagos,
        item?.id_usuario,
        item?.cliente_nombre,
        item?.usuario_nombre,
        item?.establecimiento_nombre,
        item?.tipo_pago,
        item?.dsc_tipo_pago,
        item?.monto,
        item?.propina,
        item?.total,
        item?.fec_reg,
      ]
        .filter((value) => value !== undefined && value !== null)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))
    );
  }, [sales, searchTerm]);

  const visibleSales = filteredSales.slice(0, visibleCount);
  const canShowMore = filteredSales.length > visibleCount;

  if (!hasPermission(user?.id_perfil, 'salesHistory')) {
    return (
      <AccessDenied
        title="Ventas restringidas"
        message="Solo el perfil de proveedor puede consultar historial de ventas."
      />
    );
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadSales();
  };

  const formatCurrency = (amount) => `$${parseFloat(amount || 0).toFixed(2)}`;
  const getPaymentTypeLabel = (item) => item.tipo_pago || item.dsc_tipo_pago || 'Tipo no disponible';
  const getEvidenceStatusLabel = (item) =>
    item.evidencias_completas ? 'Evidencias completas' : 'Pendiente de evidencias';

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Fecha invalida';
    }
  };

  const renderSaleItem = ({ item }) => (
    <TouchableOpacity
      style={styles.saleItem}
      onPress={() =>
        Alert.alert(
          'Detalle de venta',
          `Pago #${item.id_pagos || item.id || item._id}\nTipo: ${getPaymentTypeLabel(item)}\nMonto: ${formatCurrency(item.monto || item.amount)}\nPropina: ${formatCurrency(item.propina || 0)}\nTotal: ${formatCurrency(item.total || item.totalAmount || item.amount)}\nFecha: ${formatDate(item.fec_reg || item.createdAt || item.date)}\nEvidencias: ${getEvidenceStatusLabel(item)}`
        )
      }
    >
      <View style={styles.saleHeader}>
        <Text style={styles.saleId}>Pago #{item.id_pagos || item.id || item._id}</Text>
        <Text style={styles.saleAmount}>{formatCurrency(item.total || item.totalAmount || item.amount)}</Text>
      </View>
      <View style={styles.saleDetails}>
        <Text style={styles.saleCustomer}>
          Monto {formatCurrency(item.monto || item.amount)} + Propina {formatCurrency(item.propina || 0)}
        </Text>
        <Text style={styles.saleMeta}>{getPaymentTypeLabel(item)}</Text>
        <Text style={styles.saleMeta}>{getEvidenceStatusLabel(item)}</Text>
        <Text style={styles.saleDate}>{formatDate(item.fec_reg || item.createdAt || item.date)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Cargando ventas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de ventas</Text>
        <Text style={styles.subtitle}>
          Mostrando {visibleSales.length} de {filteredSales.length} ventas
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchLabel}>Buscar venta</Text>
        <TextInput
          value={searchTerm}
          onChangeText={(value) => {
            setSearchTerm(value);
            setVisibleCount(10);
          }}
          placeholder="Buscar por pago, cliente, comercio, monto o fecha"
          placeholderTextColor="#888"
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={visibleSales}
        renderItem={renderSaleItem}
        keyExtractor={(item, index) =>
          String(item.id_pagos ?? item.id_detalle_movimiento ?? item.id ?? item._id ?? `sale-${index}`)
        }
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#007AFF']} />}
        ListFooterComponent={
          canShowMore ? (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => setVisibleCount((current) => current + 10)}
            >
              <Text style={styles.loadMoreButtonText}>Ver mas</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay ventas registradas</Text>
            <Text style={styles.emptySubtext}>Las ventas que realices apareceran aqui.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  searchContainer: { backgroundColor: 'white', padding: 15, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  searchLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
  searchInput: {
    backgroundColor: '#F7F7F7',
    borderColor: '#E0E0E0',
    borderRadius: 10,
    borderWidth: 1,
    color: '#222',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  listContainer: { padding: 10 },
  saleItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  saleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  saleId: { fontSize: 16, fontWeight: '600', color: '#333' },
  saleAmount: { fontSize: 18, fontWeight: 'bold', color: '#007AFF' },
  saleDetails: { marginBottom: 8 },
  saleCustomer: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 2 },
  saleMeta: { fontSize: 12, color: '#666', marginBottom: 2 },
  saleDate: { fontSize: 12, color: '#666' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 5 },
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: '#E8F1FB',
    borderRadius: 10,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 12,
  },
  loadMoreButtonText: {
    color: '#1C5D99',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SalesHistory;

