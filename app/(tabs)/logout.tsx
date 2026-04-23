import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';

export default function LogoutScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const isPromptOpenRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (isPromptOpenRef.current) {
        return undefined;
      }

      isPromptOpenRef.current = true;

      const timeoutId = setTimeout(() => {
        Alert.alert('Cerrar sesion', 'Estas seguro de que deseas salir?', [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              isPromptOpenRef.current = false;
              router.replace('/(tabs)');
            },
          },
          {
            text: 'Salir',
            style: 'destructive',
            onPress: async () => {
              try {
                await logout();
              } finally {
                isPromptOpenRef.current = false;
                router.replace('/login');
              }
            },
          },
        ]);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        isPromptOpenRef.current = false;
      };
    }, [logout, router])
  );

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#263B80" />
      <Text style={styles.text}>Preparando cierre de sesion...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  text: {
    marginTop: 12,
    fontSize: 15,
    color: '#5f5f5f',
  },
});

