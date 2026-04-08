import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';

// Configurar manejo de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  
  // Registrar notificaciones push
  usePushNotifications();

  // Redirección automática basada en autenticación
 /*  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';
    
    if (!user && !inAuthGroup) {
      // Redirigir al login si no está autenticado
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Redirigir al home si ya está autenticado
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]); */

  // Manejar cuando se toca una notificación
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('📲 Notificación tocada:', data);
      
      // Navegar según el tipo de notificación
      if (data.type === 'PAYMENT_REQUEST') {
        router.push('/notifications');
      } else if (data.type === 'PAYMENT_APPROVED') {
        router.push('/(tabs)');
      }
    });

    return () => subscription.remove();
  }, []);

  // Mostrar loading mientras verifica autenticación
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen 
        name="login" 
        options={{ 
          headerShown: false,
          gestureEnabled: false
        }} 
      />
      <Stack.Screen 
        name="register" 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
          presentation: 'modal'
        }} 
      />
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false,
          gestureEnabled: false
        }} 
      />
      <Stack.Screen 
        name="(modals)/scanner" 
        options={{ 
          title: 'Escanear QR',
          presentation: 'modal'
        }} 
      />
      <Stack.Screen 
        name="enter-amount" 
        options={{ 
          title: 'Ingresar Monto',
          presentation: 'modal'
        }} 
      />
      <Stack.Screen 
        name="payment-confirmation" 
        options={{ 
          title: 'Confirmación de Pago',
          presentation: 'modal'
        }} 
      />
      <Stack.Screen 
        name="notifications" 
        options={{ 
          title: 'Notificaciones',
          presentation: 'modal'
        }} 
      />
    </Stack>
  );
}
