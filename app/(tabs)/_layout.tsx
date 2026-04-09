import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

export default function TabLayout() {
  const { user } = useAuth();
  const isClient = user?.id_perfil === ROLE_IDS.CLIENT;
  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerStyle: {
          backgroundColor: '#f5f5f5',
        },
        headerShadowVisible: false,
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
          title: isClient ? 'Consumo' : isProvider ? 'Ventas' : 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={isClient || isProvider ? 'receipt-outline' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: isClient || isProvider ? '/explore' : null,
          title: 'Participantes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
