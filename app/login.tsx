import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

const LOGIN_BACKGROUND_KEY = 'loginBackgroundIndex';
const LOGIN_BACKGROUND_ROTATION_MS = 60000;
const LOGIN_BACKGROUNDS: ImageSourcePropType[] = [
  require('../images/Cervantes.jpg'),
  require('../images/Quijote3.jpg'),
  require('../images/Quijote4.jpg'),
];

const getNextBackgroundIndex = (lastIndex: number | null) => {
  if (LOGIN_BACKGROUNDS.length <= 1) {
    return 0;
  }

  const availableIndexes = LOGIN_BACKGROUNDS
    .map((_, index) => index)
    .filter((index) => index !== lastIndex);

  return availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
};

export default function LoginScreen() {
  const [user, serUser] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<ImageSourcePropType>(LOGIN_BACKGROUNDS[0]);

  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    let isMounted = true;

    const loadRandomBackground = async () => {
      try {
        const storedIndex = await AsyncStorage.getItem(LOGIN_BACKGROUND_KEY);
        const lastIndex = storedIndex !== null ? Number(storedIndex) : null;
        const nextIndex = getNextBackgroundIndex(Number.isNaN(lastIndex) ? null : lastIndex);

        if (!isMounted) {
          return;
        }

        setBackgroundImage(LOGIN_BACKGROUNDS[nextIndex]);
        await AsyncStorage.setItem(LOGIN_BACKGROUND_KEY, String(nextIndex));
      } catch (storageError) {
        console.error('Error loading login background:', storageError);

        if (!isMounted) {
          return;
        }

        setBackgroundImage(LOGIN_BACKGROUNDS[getNextBackgroundIndex(null)]);
      }
    };

    loadRandomBackground();

    const intervalId = setInterval(() => {
      loadRandomBackground();
    }, LOGIN_BACKGROUND_ROTATION_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

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

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>

          <View style={styles.formModal}>
            <View style={styles.header}>
              <Text style={styles.title}>FIC 2026</Text>
              <Text style={styles.subtitle}>En un lugar de la Mancha...</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Vuestro Usuario"
              value={user}
              onChangeText={serUser}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#666"
            />

            <TextInput
              style={styles.input}
              placeholder="Palabra Secreta"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#666"
            />

            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#F4D03F" />
              ) : (
                <Text style={styles.loginButtonText}>Adentrarse</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={handleRegisterRedirect}
            >
              <Text style={styles.registerText}>
                ¿Aún no sois caballero? <Text style={styles.registerBold}>Unirse</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // Oscurece el fondo para que resalte el modal
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 45,
    fontWeight: 'bold',
    color: '#D4AF37', // Oro viejo
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#E8DAB2', // Pergamino claro
    textAlign: 'center',
    fontFamily: 'serif',
    fontStyle: 'italic',
  },
  formModal: {
    backgroundColor: 'rgba(88, 15, 28, 0.25)', // Vino transparente
    padding: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#D4AF37', // Borde dorado medieval
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: 'rgba(244, 238, 224, 0.95)', // Tono papel avejentado
    fontFamily: 'serif',
    color: '#333',
  },
  loginButton: {
    backgroundColor: '#4A0B17', // Vino muy oscuro
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    backgroundColor: '#30060e',
    borderColor: '#7a641d',
  },
  loginButtonText: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'serif',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  registerLink: {
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
  },
  registerText: {
    color: '#E8DAB2',
    fontSize: 16,
    fontFamily: 'serif',
  },
  registerBold: {
    fontWeight: 'bold',
    color: '#D4AF37',
    fontFamily: 'serif',
    textDecorationLine: 'underline',
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
