import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { resolveInstitutionalPartida } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';

export default function InstitutionalUsersScreen() {
  const { user: authUser } = useAuth();
  const { getInstitutionalUsers } = useApi();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const effectivePartida = useMemo(
    () => resolveInstitutionalPartida(authUser),
    [authUser]
  );
  const partidaDisplayLabel =
    effectivePartida?.clave_partida ||
    authUser?.partida_label ||
    'tu partida';

  const loadUsers = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setErrorMessage('');
      const response = await getInstitutionalUsers();
      setUsers(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading institutional users:', error);
      setUsers([]);
      setErrorMessage(
        error?.message || `No se pudo consultar el listado de usuarios de la partida ${partidaDisplayLabel}.`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getInstitutionalUsers, partidaDisplayLabel]);

  useFocusEffect(
    useCallback(() => {
      loadUsers(true);
    }, [loadUsers])
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const normalizedPartidaKey = String(effectivePartida?.clave_partida ?? '').trim().toLowerCase();

    const partidaScopedUsers = users.filter((user) => {
      if (!normalizedPartidaKey) {
        return true;
      }

      const userPartida = String(user?.partida_label ?? '').trim().toLowerCase();
      return !userPartida || userPartida.includes(normalizedPartidaKey);
    });

    if (!normalizedQuery) {
      return partidaScopedUsers;
    }

    return partidaScopedUsers.filter((user) =>
      [
        user?.nombre_completo,
        user?.usuario,
        user?.correo,
        user?.perfil_label,
        user?.partida_label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [effectivePartida?.clave_partida, searchQuery, users]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#263B80" />
        <Text style={styles.loadingText}>Consultando usuarios institucionales...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadUsers(false);
          }}
          colors={['#263B80']}
          tintColor="#263B80"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Usuarios</Text>
        <Text style={styles.subtitle}>
          {`Consulta restringida de usuarios asociados a la partida ${partidaDisplayLabel}. No se permiten altas, bajas ni edicion desde app.`}
        </Text>
      </View>

      <View style={styles.searchBlock}>
        <Text style={styles.inputLabel}>Buscar usuario</Text>
        <TextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por nombre, usuario, correo o perfil"
          placeholderTextColor="#999"
        />
      </View>

      {errorMessage ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No se pudo cargar la consulta</Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadUsers(true)}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!errorMessage && filteredUsers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sin usuarios visibles</Text>
          <Text style={styles.emptyText}>
            {`No encontramos usuarios para la partida ${partidaDisplayLabel} con el criterio de busqueda actual.`}
          </Text>
        </View>
      ) : null}

      {!errorMessage && filteredUsers.length > 0 ? (
        filteredUsers.map((user) => (
          <View key={String(user?.id_usuario)} style={styles.userCard}>
            <View style={styles.userHeader}>
              <Text style={styles.userName}>{user?.nombre_completo}</Text>
              <Text style={styles.userId}>ID {user?.id_usuario}</Text>
            </View>

            <Text style={styles.userMeta}>Usuario: {user?.usuario || 'Sin usuario'}</Text>
            <Text style={styles.userMeta}>Perfil: {user?.perfil_label || user?.id_perfil || 'Sin perfil'}</Text>
            <Text style={styles.userMeta}>Correo: {user?.correo || 'Sin correo'}</Text>
            <Text style={styles.userMeta}>
              Partida: {user?.partida_label || effectivePartida?.clave_partida || partidaDisplayLabel}
            </Text>
          </View>
        ))
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#5F6782',
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: '#263B80',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 21,
  },
  searchBlock: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B23A48',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DEEE',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 18,
  },
  emptyTitle: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 21,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: '#263B80',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAF6',
    padding: 16,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  userName: {
    color: '#263B80',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  userId: {
    color: '#B23A48',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  userMeta: {
    color: '#5F6782',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
});
