import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getRoleLabel, ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

export default function ProfileScreen() {
  const { user } = useAuth();

  const displayName = [user?.nombre, user?.primer_apellido, user?.segundo_apellido]
    .filter(Boolean)
    .join(' ');

  const avatarLetter = (user?.nombre || user?.usuario || '?').charAt(0).toUpperCase();
  const isProviderOrClient =
    user?.id_perfil === ROLE_IDS.PROVIDER || user?.id_perfil === ROLE_IDS.CLIENT;

  const handleResetPassword = () => {
    Alert.alert(
      'Restablecer contraseña',
      'Esta función quedará conectada en una siguiente etapa.'
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <Text style={styles.name}>{displayName || user?.usuario}</Text>
        <Text style={styles.email}>{user?.correo || 'Sin correo registrado'}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{getRoleLabel(user?.id_perfil)}</Text>
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Usuario</Text>
          <Text style={styles.metaValue}>{user?.usuario || 'N/D'}</Text>
        </View>

        {!isProviderOrClient && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>ID de usuario</Text>
            <Text style={styles.metaValue}>{user?.id_usuario ?? 'N/D'}</Text>
          </View>
        )}

        {!isProviderOrClient && (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Establecimiento</Text>
            <Text style={styles.metaValue}>{user?.id_establecimiento ?? 'N/D'}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword}>
          <Text style={styles.resetButtonText}>Restablecer contraseña</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  profileCard: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#4A0B17',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 18,
  },
  badgeText: {
    color: '#4A0B17',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  metaBlock: {
    width: '100%',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  metaLabel: {
    fontSize: 13,
    color: '#777',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    color: '#222',
    fontWeight: '600',
  },
  resetButton: {
    width: '100%',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A0B17',
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#4A0B17',
    fontSize: 15,
    fontWeight: '700',
  },
});
