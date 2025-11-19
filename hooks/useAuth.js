import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

const API_BASE_URL = 'http://172.16.2.118:4000/api';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  // Cargar usuario al iniciar la app
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');
      
      if (userJson && token) {
        const userData = JSON.parse(userJson);
        setUser(userData);
        
        // Verificar token en background (sin bloquear)
        validateToken(token).catch(console.error);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateToken = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Token inválido');
      
      const data = await response.json();
      if (data.success) {
        await AsyncStorage.setItem('user', JSON.stringify(data.data));
        setUser(data.data);
      }
    } catch (error) {
      console.error('Token inválido:', error);
      await logout();
    }
  };

  // FUNCIÓN PARA OBTENER VENTAS POR PROVEEDOR
  const getSalesByProvider = async (providerId = null, filters = {}) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No hay token de autenticación');

      // Construir query parameters
     const params = new URLSearchParams({
        clientId: providerId,  // O providerId si mantienes ese nombre
        limit: 50,
        page: 1
      });
      // Si no se proporciona providerId, usar el usuario actual
  
      
      const response = await fetch(
        `${API_BASE_URL}/transactions/provider?${params}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al obtener ventas');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error en la respuesta del servidor');
      }

      return data.data;

    } catch (error) {
      console.error('Error fetching sales:', error);
      throw error;
    }
  };
  const getSalesByClient = async (providerId = null, filters = {}) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No hay token de autenticación');

      // Construir query parameters
     const params = new URLSearchParams({
        clientId: providerId,  // O providerId si mantienes ese nombre
        limit: 50,
        page: 1
      });
      // Si no se proporciona providerId, usar el usuario actual    
      const response = await fetch(
        `${API_BASE_URL}/transactions/client?${params}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al obtener ventas');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error en la respuesta del servidor');
      }

      return data.data;

    } catch (error) {
      console.error('Error fetching sales:', error);
      throw error;
    }
  };

  // FUNCIÓN PARA OBTENER ESTADÍSTICAS DE VENTAS


  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
 
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Error en el login');
      if (!data.success) throw new Error(data.message || 'Error en el login');

      const userData = data.data;
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', userData.token);
      setUser(userData);
      // Redirigir manualmente después del login
      router.replace('/(tabs)');
      return userData;

    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name, email, password, type) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, type }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Error en el registro');
      if (!data.success) throw new Error(data.message || 'Error en el registro');

      const userData = data.data;
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', userData.token);
      setUser(userData);
      
      // Redirigir manualmente después del registro
      router.replace('/(tabs)');
      return userData;

    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['user', 'token']);
      setUser(null);
      setError(null);
      
      // Redirigir manualmente después del logout
      router.replace('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      setError('Error al cerrar sesión');
    }
  };

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    getSalesByProvider, // Exportar la nueva función
    getSalesByClient,      // Exportar función de estadísticas
  };
};