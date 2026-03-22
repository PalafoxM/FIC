import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function LoginScreen() {
  const [user, serUser] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const { login, error } = useAuth();

  const handleLogin = async () => {
    if (!user || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    setIsLoading(true);

    try {
      await login(user, password);
      // La navegación se maneja automáticamente en el hook
      // cuando se establece el usuario
    } catch (error) {
      Alert.alert('Error', error.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterRedirect = () => {
    console.log('entro al register');
    router.replace('/register');
  };

  // Datos de prueba para desarrollo
  const fillTestCredentials = (type) => {
    if (type === 'vendor') {
      serUser('proveedor@test.com');
      setPassword('123456');
    } else {
      serUser('cliente@test.com');
      setPassword('123456');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>FIC 2026</Text>
        <Text style={styles.subtitle}>SECTURI</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Usuario"
          value={user}
          onChangeText={serUser}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#999"
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#999"
        />

        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.disabledButton]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerLink}
          onPress={handleRegisterRedirect}
        >
          <Text style={styles.registerText}>
            ¿No tienes cuenta? <Text style={styles.registerBold}>Regístrate</Text>
          </Text>
        </TouchableOpacity>

        {/* Botones de prueba para desarrollo */}
        <View style={styles.testSection}>
          <Text style={styles.testTitle}>Datos de prueba (Desarrollo):</Text>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => fillTestCredentials('vendor')}
          >
            <Text style={styles.testButtonText}>Proveedor de Prueba</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => fillTestCredentials('client')}
          >
            <Text style={styles.testButtonText}>Cliente de Prueba</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fafafa',
  },
  loginButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    backgroundColor: '#95A5A6',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerLink: {
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
  },
  registerText: {
    color: '#666',
    fontSize: 16,
  },
  registerBold: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  testSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  testTitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  testButton: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 10,
  },
  testButtonText: {
    color: '#1976D2',
    fontSize: 14,
    fontWeight: '600',
  },
});