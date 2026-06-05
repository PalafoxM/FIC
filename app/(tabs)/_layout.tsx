import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { isConsumerProfile, isInstitutionalPortalProfile, ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

export default function TabLayout() {
  const { user } = useAuth();
  const isClient = isConsumerProfile(user?.id_perfil);
  const isInstitutionalPortal = isInstitutionalPortalProfile(user?.id_perfil);
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;
  const isBusinessManager = user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isCashier = user?.id_perfil === ROLE_IDS.CASHIER;
  const isReception = user?.id_perfil === ROLE_IDS.RECEPTION;
  const isProviderOrBusinessManager = isProvider || isBusinessManager;
  const showNotificationsTab = isClient || isProviderOrBusinessManager;
  const showParticipantsTab = !isInstitutionalPortal && !isBusinessManager && !isCashier && !isReception;
  const showConsumptionTab = isInstitutionalPortal;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#263B80',
        tabBarInactiveTintColor: '#B23A48',
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#263B80',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: isInstitutionalPortal ? 'Mi perfil' : isClient ? 'Consumo' : isProviderOrBusinessManager ? 'Ventas' : 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={isInstitutionalPortal ? 'person-outline' : isClient || isProviderOrBusinessManager ? 'receipt-outline' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          href: showNotificationsTab ? '/alerts' : null,
          title: 'Notificaciones',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="consumption"
        options={{
          href: showConsumptionTab ? '/consumption' : null,
          title: 'Consumos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cashier-process"
        options={{
          href: null,
          title: 'Entrega de QR',
        }}
      />
      <Tabs.Screen
        name="institutional-users"
        options={{
          href: isInstitutionalPortal ? '/institutional-users' : null,
          title: 'Usuarios',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="institutional-budget"
        options={{
          href: null,
          title: 'Partida',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: showParticipantsTab ? '/explore' : null,
          title: isProvider ? 'Establecimientos' : 'Participantes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logout"
        options={{
          title: '',
          href: '/logout',
          tabBarShowLabel: false,
          tabBarAccessibilityLabel: 'Cerrar sesión',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-out-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

