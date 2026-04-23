import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

export default function TabLayout() {
  const { user } = useAuth();
  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;
  const isBusinessManager = user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;
  const isProviderOrBusinessManager = isProvider || isBusinessManager;
  const showNotificationsTab = isClient || isProviderOrBusinessManager;
  const showParticipantsTab = !isBusinessManager;

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
          title: isClient ? 'Consumo' : isProviderOrBusinessManager ? 'Ventas' : 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={isClient || isProviderOrBusinessManager ? 'receipt-outline' : 'person-outline'}
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
          href: null,
          title: 'Consumo',
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
          tabBarAccessibilityLabel: 'Cerrar sesion',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-out-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

