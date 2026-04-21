import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { hasPermission } from '../../constants/roles';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import AccessDenied from '../AccessDenied';

const PayHistory = () => {
  const { user, getSalesByClient } = useAuth();
  const { createPaymentReport } = useApi();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  const reportOptions = [
    'Cobro duplicado',
    'Cobro no reconocido',
    'Cobro excede el monto',
    'Problema con evidencia o comprobante',
  ];

  const loadSales = useCallback(async (filters = {}, showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const salesData = await getSalesByClient(user.id_usuario, filters);
      setSales(salesData);
      setVisibleCount(10);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudieron cargar los consumos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getSalesByClient, user?.id_usuario]);

  useFocusEffect(
    useCallback(() => {
      if (user && hasPermission(user?.id_perfil, 'payHistory')) {
        loadSales({}, sales.length === 0);
      } else {
        setLoading(false);
      }
    }, [loadSales, sales.length, user])
  );

  if (!hasPermission(user?.id_perfil, 'payHistory')) {
    return (
      <AccessDenied
        title="Consumos restringidos"
        message="Solo el perfil de cliente puede consultar historial de consumo."
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
  const getEstablishmentLabel = (item) =>
    item.establecimiento_nombre ||
    item.establecimientoLabel ||
    item.dsc_establecimiento ||
    'Establecimiento no disponible';

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

  const formatTime = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Hora invalida';
    }
  };

  const openReportModal = (item) => {
    setSelectedSale(item);
    setReportModalVisible(true);
  };

  const closeReportModal = () => {
    setReportModalVisible(false);
    setSelectedSale(null);
  };

  const handleSelectReportType = async (reportType) => {
    if (!selectedSale) {
      return;
    }

    const paymentId = selectedSale.id_pagos ?? selectedSale.id_pago ?? null;
    const saleSnapshot = selectedSale;

    if (!paymentId) {
      Alert.alert(
        'Reporte no disponible',
        'Este movimiento no tiene un identificador de pago valido para reportarse.'
      );
      return;
    }

    const authenticatedUserId = Number(user?.id_usuario ?? 0);
    const paymentOwnerId = Number(saleSnapshot?.id_usuario ?? authenticatedUserId);

    if (paymentOwnerId > 0 && authenticatedUserId > 0 && paymentOwnerId !== authenticatedUserId) {
      console.log('Reporte bloqueado por cruce de usuario:', {
        authenticatedUserId,
        paymentOwnerId,
        paymentId,
      });

      Alert.alert(
        'Reporte no disponible',
        'Este consumo pertenece a otro usuario segun la informacion local. Cierra sesion e inicia de nuevo para sincronizar tus consumos.'
      );
      return;
    }

    try {
      const reportPayload = {
        id_pagos: Number(paymentId),
        id_usuario: authenticatedUserId,
        id_establecimiento:
          saleSnapshot?.id_establecimiento ??
          saleSnapshot?.establishmentId ??
          null,
        tipo_reporte: reportType,
        descripcion: '',
        monto: Number(saleSnapshot.monto || saleSnapshot.amount || 0),
        propina: Number(saleSnapshot.propina || 0),
        total: Number(saleSnapshot.total || saleSnapshot.totalAmount || saleSnapshot.amount || 0),
        fecha_movimiento: saleSnapshot.fec_reg || saleSnapshot.createdAt || saleSnapshot.date || null,
      };

      console.log('Creando reporte de pago payload:', {
        ...reportPayload,
        authenticatedUserId,
        paymentOwnerId: saleSnapshot?.id_usuario ?? null,
        rawPaymentId: paymentId,
      });

      const response = await createPaymentReport({
        ...reportPayload,
      });

      closeReportModal();

      Alert.alert(
        'Reporte enviado',
        response?.message || 'Tu reporte fue enviado al equipo TI para revision.'
      );
    } catch (error) {
      const permissionMessage = String(error?.message || '').includes('permisos');

      Alert.alert(
        permissionMessage ? 'No se pudo reportar' : 'Error',
        permissionMessage
          ? 'El backend rechazo el permiso para crear este reporte. Revisa la regla POST /api/reportes/create: cliente y gestor pueden crear reportes; solo TI puede leerlos y cambiar estatus.'
          : error.message || 'No se pudo enviar el reporte.'
      );
    }
  };

  const applyFilter = (filterType) => {
    const today = new Date();
    const filters = {};

    if (filterType === 'today') {
      filters.startDate = today.toISOString().split('T')[0];
    }

    if (filterType === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      filters.startDate = weekAgo.toISOString().split('T')[0];
    }

    if (filterType === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setMonth(today.getMonth() - 1);
      filters.startDate = monthAgo.toISOString().split('T')[0];
    }

    loadSales(filters);
  };

  const renderSaleItem = ({ item }) => (
    <View style={styles.saleItem}>
      <TouchableOpacity
        onPress={() =>
          Alert.alert(
            'Detalle de consumo',
            `Pago #${item.id_pagos || item.id || item._id}\nEstablecimiento: ${getEstablishmentLabel(item)}\nTipo: ${getPaymentTypeLabel(item)}\nMonto: ${formatCurrency(item.monto || item.amount)}\nPropina: ${formatCurrency(item.propina || 0)}\nTotal: ${formatCurrency(item.total || item.totalAmount || item.amount)}\nFecha: ${formatDate(item.fec_reg || item.createdAt || item.date)}\nHora: ${formatTime(item.fec_reg || item.createdAt || item.date)}\nEvidencias: ${getEvidenceStatusLabel(item)}`
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
          <Text style={styles.saleMeta}>{getEstablishmentLabel(item)}</Text>
          <Text style={styles.saleMeta}>{getPaymentTypeLabel(item)}</Text>
          <Text style={styles.saleMeta}>{getEvidenceStatusLabel(item)}</Text>
          <Text style={styles.saleDate}>{formatDate(item.fec_reg || item.createdAt || item.date)}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.saleActions}>
        <TouchableOpacity style={styles.reportButton} onPress={() => openReportModal(item)}>
          <Text style={styles.reportButtonText}>Levantar reporte</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Cargando consumos...</Text>
      </View>
    );
  }

  const visibleSales = sales.slice(0, visibleCount);
  const canShowMore = sales.length > visibleCount;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de consumo</Text>
        <Text style={styles.subtitle}>
          Mostrando {visibleSales.length} de {sales.length} movimientos
        </Text>
      </View>

      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filtrar por:</Text>
        <View style={styles.filterButtons}>
          {['today', 'week', 'month', 'all'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={styles.filterButton}
              onPress={() => applyFilter(filter)}
            >
              <Text style={styles.filterButtonText}>
                {filter === 'today' ? 'Hoy' : filter === 'week' ? 'Semana' : filter === 'month' ? 'Mes' : 'Todos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={visibleSales}
        renderItem={renderSaleItem}
        keyExtractor={(item, index) =>
          String(item.id_pagos ?? item.id_detalle_movimiento ?? item.id ?? item._id ?? `pay-${index}`)
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
            <Text style={styles.emptyText}>No hay consumos registrados</Text>
            <Text style={styles.emptySubtext}>Tus operaciones apareceran aqui.</Text>
          </View>
        }
      />

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeReportModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Crear reporte</Text>

            {selectedSale ? (
              <View style={styles.reportSummary}>
                <Text style={styles.reportSummaryText}>
                  Establecimiento: {getEstablishmentLabel(selectedSale)}
                </Text>
                <Text style={styles.reportSummaryText}>
                  Monto: {formatCurrency(selectedSale.total || selectedSale.totalAmount || selectedSale.amount)}
                </Text>
                <Text style={styles.reportSummaryText}>
                  Fecha: {formatDate(selectedSale.fec_reg || selectedSale.createdAt || selectedSale.date)}
                </Text>
                <Text style={styles.reportSummaryText}>
                  Hora: {formatTime(selectedSale.fec_reg || selectedSale.createdAt || selectedSale.date)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.modalSubtitle}>Tipo de reporte</Text>

            {reportOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.reportOptionButton}
                onPress={() => handleSelectReportType(option)}
              >
                <Text style={styles.reportOptionText}>{option}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.cancelButton} onPress={closeReportModal}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  filterContainer: { backgroundColor: 'white', padding: 15, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  filterTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  filterButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  filterButton: { flex: 1, padding: 8, marginHorizontal: 2, backgroundColor: '#f8f9fa', borderRadius: 8, alignItems: 'center' },
  filterButtonText: { fontSize: 12, fontWeight: '500', color: '#333' },
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
  saleActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  reportButton: {
    width: '100%',
    backgroundColor: '#C62828',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B4F0F',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reportSummary: {
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  reportSummaryText: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  reportOptionButton: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    backgroundColor: '#FFF5F5',
  },
  reportOptionText: {
    color: '#8B1E1E',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PayHistory;
