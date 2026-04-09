import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ClientQRGenerator from '../../components/ClientQRGenerator';
import { getRoleConfig, getRoleLabel, hasPermission, ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const buildAdminCards = (user) => [
  {
    key: 'dashboard',
    title: 'Panel general',
    description: 'Resumen operativo y acceso al centro administrativo.',
    actionLabel: 'Disponible en web',
    onPress: () => Alert.alert('Panel administrativo', 'Este perfil se administra principalmente desde la plataforma web.'),
  },
  {
    key: 'establishments',
    title: 'Establecimientos',
    description: hasPermission(user?.id_perfil, 'manageEstablishments')
      ? 'Consulta y supervision de establecimientos.'
      : 'Sin permiso de administracion de establecimientos.',
    actionLabel: 'Ver estado',
    onPress: () => Alert.alert('Establecimientos', 'La gestion detallada de establecimientos sigue disponible en la web.'),
  },
  {
    key: 'reports',
    title: 'Reportes',
    description: 'Consulta reportes y seguimiento de actividad.',
    actionLabel: 'Abrir resumen',
    onPress: () => Alert.alert('Reportes', 'Los reportes avanzados siguen centralizados en la web.'),
  },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const roleConfig = getRoleConfig(user?.id_perfil);
  const isProvider =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isAdminOrManager = hasPermission(user?.id_perfil, 'dashboard');

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{getRoleLabel(user?.id_perfil)}</Text>
        <Text style={styles.welcome}>Bienvenido, {user?.nombre}</Text>
        <Text style={styles.subtitle}>{roleConfig.homeSubtitle}</Text>
      </View>

      {isProvider && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones de proveedor</Text>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/(modals)/scanner')}>
            <Text style={styles.cardTitle}>Escanear QR para cobrar</Text>
            <Text style={styles.cardDescription}>Inicia una solicitud de pago para un cliente.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/(modals)/historyStore')}>
            <Text style={styles.cardTitle}>Historial de ventas</Text>
            <Text style={styles.cardDescription}>Consulta pagos y movimientos registrados.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/notifications')}>
            <Text style={styles.cardTitle}>Notificaciones</Text>
            <Text style={styles.cardDescription}>Revisa alertas y seguimiento de operaciones.</Text>
          </TouchableOpacity>
        </View>
      )}

      {isClient && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones de cliente</Text>
          <ClientQRGenerator />

          <TouchableOpacity style={styles.card} onPress={() => router.push('/(modals)/historyPay')}>
            <Text style={styles.cardTitle}>Historial de consumo</Text>
            <Text style={styles.cardDescription}>Consulta tus pagos y consumos anteriores.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/notifications')}>
            <Text style={styles.cardTitle}>Notificaciones</Text>
            <Text style={styles.cardDescription}>Aprueba o rechaza solicitudes pendientes.</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAdminOrManager && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{roleConfig.homeTitle}</Text>
          {buildAdminCards(user).map((card) => (
            <TouchableOpacity key={card.key} style={styles.card} onPress={card.onPress}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
              <Text style={styles.cardMeta}>{card.actionLabel}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
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
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
