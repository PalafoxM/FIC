import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

const API_BASE_URL = 'http://3.220.153.13/api/';

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
      // Hacemos una consulta ligera a getTabla solo para que el middleware `verifyStaticToken` valide el token.
      const response = await fetch(`${API_BASE_URL}getTabla`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: { tabla: 'usuario', limit: 1 } // Solo le pedimos 1 registro para validar
        })
      });

      // Si el middleware del backend rechaza el token (status 403 Forbidden o Error no autorizado)
      if (response.status === 403 || response.status === 401) {
        throw new Error('Token inválido');
      }

      const data = await response.json();

      // En el formato de tu backend, si el Token es inválido, devuelve error: true y la respuesta
      if (data.error && data.respuesta === 'Token inválido o expirado') {
        throw new Error('Token inválido');
      }

      // Si pasa, no es necesario hacer un SetUser aquí a menos que tu backend devuelva el perfil
      // Pero si tu backend no tiene un 'auth/profile', solo usamos esto para comprobar que el Token no ha expirado.

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


  const login = async (user, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            tabla: 'usuario',
            where: {
              usuario: user,
              contrasenia: password,
              visible: 1
            }
          }
        }),
      });

      const data = await response.json();
      console.log(data);
      // Verificar si la petición HTTP falló
      if (!response.ok) throw new Error('Error en la petición de login');

      // Verificar si el API en Node devolvió un error lógico (error: true)
      if (data.error) {
        const errorInfo = data.respuesta ? data.respuesta.split('|') : ['Error en el login'];
        throw new Error(errorInfo.length > 1 ? errorInfo[1] : errorInfo[0]);
      }

      // Si data.data viene vacío, significa que las credenciales no coinciden
      if (!data.data || data.data.length === 0) {
        throw new Error('Usuario o contraseña incorrectos');
      }

      // Tomamos el primer registro de la búsqueda
      const userData = data.data[0];

      await AsyncStorage.setItem('user', JSON.stringify(userData));

      // Guardar el token si el registro lo incluye, si no, generamos uno temporal
      // ya que mencionas que aún no has implementado la generación del token en el backend
      if (userData.token) {
        await AsyncStorage.setItem('token', userData.token);
      } else {
        await AsyncStorage.setItem('token', 'token-temporal-hasta-implementar-jwt');
      }

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