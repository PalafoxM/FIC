import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function AccessDenied({ title = 'Sin acceso', message = 'Tu perfil no tiene permiso para ver esta pantalla.' }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#263B80',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 22,
  },
});

