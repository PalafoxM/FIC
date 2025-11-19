import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ClientQRGenerator from '../../components/ClientQRGenerator';
import { useAuth } from '../../hooks/useAuth';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

const handleLogout = async () => {
  Alert.alert(
    'Cerrar Sesión',
    '¿Estás seguro?',
    [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Cerrar Sesión', 
        onPress: async () => {
          console.log('🎯 Iniciando logout desde HomeScreen');
          await logout();
          console.log('🎯 Logout completado desde hook');
        }
      }
    ]
  );
};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Bienvenido, {user?.name}</Text>
        <Text style={styles.userType}>
          {user?.type === 'vendor' ? 'Vendedor' : 'Cliente'}
        </Text>
      </View>

      <View style={styles.menu}>
        {user?.type === 'vendor' ? (
          // Vista del Vendedor
          <>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('./(modals)/scanner')}
            >
              <Text style={styles.menuItemText}>Escanear QR para Cobrar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('./(modals)/historyStore')}
            >
              <Text style={styles.menuItemText}>Historial de Ventas</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('Próximamente', 'Estadísticas en desarrollo')}
            >
              <Text style={styles.menuItemText}>Estadísticas</Text>
            </TouchableOpacity>
          </>
        ) : (
          // Vista del Cliente
          <>
            <ClientQRGenerator />
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('./(modals)/historyPay')}
            >
              <Text style={styles.menuItemText}>Historial de Consumo</Text>
            </TouchableOpacity>
          
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => Alert.alert('Próximamente', 'Soporte en desarrollo')}
            >
              <Text style={styles.menuItemText}>Soporte</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
    marginTop: 20,
  },
  welcome: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  userType: {
    fontSize: 16,
    color: '#666',
  },
  menu: {
    flex: 1,
  },
  menuItem: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});