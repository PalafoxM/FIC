import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../../hooks/useAuth'; // Ajusta la ruta según tu estructura

const SalesHistory = () => {
  // ✅ CORREGIDO: Usar useAuth() correctamente
  const { user, getSalesByClient } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadSales();
    }
  }, [user]);

  const loadSales = async (filters = {}) => {
    try {
      setLoading(true);
      // ✅ Usar el user.id del hook useAuth
      const salesData = await getSalesByClient(user.id, filters);
      setSales(salesData);
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudieron cargar las ventas');
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSales();
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const applyFilter = (filterType) => {
    const today = new Date();
    const filters = {};
    
    switch (filterType) {
      case 'today':
        filters.startDate = today.toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        filters.startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        filters.startDate = monthAgo.toISOString().split('T')[0];
        break;
      default:
        // 'all' - no filters
        break;
    }
    
    loadSales(filters);
  };

  const renderSaleItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.saleItem}
      onPress={() => Alert.alert(
        'Detalle de Venta', 
        `Venta #${item.id || item._id}\n
Cliente: ${item.customerName || 'N/A'}\n
Monto: ${formatCurrency(item.totalAmount || item.amount)}\n
Fecha: ${formatDate(item.createdAt || item.date)}\n
Estado: ${item.status || 'Completada'}`
      )}
    >
      <View style={styles.saleHeader}>
        <Text style={styles.saleId}>Venta #{item.id || item._id}</Text>
        <Text style={styles.saleAmount}>
          {formatCurrency(item.totalAmount || item.amount)}
        </Text>
      </View>
      <View style={styles.saleDetails}>
        <Text style={styles.saleCustomer}>
          {item.customerName || item.customer || 'Cliente no especificado'}
        </Text>
        <Text style={styles.saleDate}>
          {formatDate(item.createdAt || item.date)}
        </Text>
      </View>
      <View style={styles.saleFooter}>
        <Text style={styles.saleItems}>
          {item.items ? item.items.length : 0} productos
        </Text>
        <View style={[
          styles.statusBadge, 
          (item.status === 'completed' || !item.status) && styles.statusCompleted,
          item.status === 'pending' && styles.statusPending,
          item.status === 'cancelled' && styles.statusCancelled
        ]}>
          <Text style={styles.statusText}>
            {item.status === 'completed' ? 'Completada' : 
             item.status === 'pending' ? 'Pendiente' :
             item.status === 'cancelled' ? 'Cancelada' : 'Completada'}
          </Text>
        </View>
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

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text>No se pudo cargar la información del usuario</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de Ventas</Text>
        <Text style={styles.subtitle}>
          {sales.length} ventas encontradas
        </Text>
      </View>

      {/* Filtros rápidos */}
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
                {filter === 'today' ? 'Hoy' :
                 filter === 'week' ? 'Semana' :
                 filter === 'month' ? 'Mes' : 'Todos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={sales}
        renderItem={renderSaleItem}
        keyExtractor={(item) => (item.id || item._id).toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay ventas registradas</Text>
            <Text style={styles.emptySubtext}>
              Las ventas que realices aparecerán aquí
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  filterContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterButton: {
    flex: 1,
    padding: 8,
    marginHorizontal: 2,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  listContainer: {
    padding: 10,
  },
  saleItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  saleId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  saleAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  saleDetails: {
    marginBottom: 8,
  },
  saleCustomer: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  saleDate: {
    fontSize: 12,
    color: '#666',
  },
  saleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleItems: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  statusCompleted: {
    backgroundColor: '#d4edda',
  },
  statusPending: {
    backgroundColor: '#fff3cd',
  },
  statusCancelled: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#155724',
  },
  centerContainer: {
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
  },
});

export default SalesHistory;