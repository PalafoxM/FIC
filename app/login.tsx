import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
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
  View,
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
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<ImageSourcePropType>(LOGIN_BACKGROUNDS[0]);

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
      Alert.alert('Atenci\u00f3n', 'Por favor completa todos los campos');
      return;
    }

    setIsLoading(true);

    try {
      await login(user, password.toLowerCase());
    } catch (error) {
      Alert.alert('Atenci\u00f3n', error.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
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
              onChangeText={setUser}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#666"
            />

            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Palabra Secreta"
                value={password}
                onChangeText={(value) => setPassword(value.toLowerCase())}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword((currentValue) => !currentValue)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#4A0B17"
                />
              </TouchableOpacity>
            </View>

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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    color: '#D4AF37',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#E8DAB2',
    textAlign: 'center',
    fontFamily: 'serif',
    fontStyle: 'italic',
  },
  formModal: {
    backgroundColor: 'rgba(88, 15, 28, 0.25)',
    padding: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#D4AF37',
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
    backgroundColor: 'rgba(244, 238, 224, 0.95)',
    fontFamily: 'serif',
    color: '#333',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: 'rgba(244, 238, 224, 0.95)',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    fontFamily: 'serif',
    color: '#333',
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loginButton: {
    backgroundColor: '#4A0B17',
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
});

