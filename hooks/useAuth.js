import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl;

const getHeaders = (token = null) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (ENV.tokenApi) {
    headers['X-API-Token'] = ENV.tokenApi;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const extractUserRecords = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.data && typeof payload.data === 'object') return [payload.data];
  if (Array.isArray(payload?.respuesta)) return payload.respuesta;
  if (payload?.respuesta && typeof payload.respuesta === 'object') return [payload.respuesta];
  if (Array.isArray(payload?.user)) return payload.user;
  if (payload?.user && typeof payload.user === 'object') return [payload.user];
  return [];
};

const extractToken = (payload, userRecord) =>
  userRecord?.token ??
  payload?.token ??
  payload?.accessToken ??
  payload?.access_token ??
  payload?.jwt ??
  payload?.data?.token ??
  payload?.data?.accessToken ??
  payload?.data?.access_token ??
  payload?.respuesta?.token ??
  payload?.respuesta?.accessToken ??
  payload?.respuesta?.access_token ??
  null;

const extractTokenFromHeaders = (response) => {
  const authorizationHeader = response.headers.get('authorization');
  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length);
  }

  return (
    response.headers.get('x-access-token') ??
    response.headers.get('x-auth-token') ??
    null
  );
};

const buildLoginPayload = (username, password) => {
  const normalizedUsername = String(username ?? '').trim();
  const normalizedPassword = String(password ?? '');

  return {
    data: {
      tabla: 'usuario',
      where: {
        usuario: normalizedUsername,
        contrasenia: normalizedPassword,
        visible: 1,
      },
    },
  };
};

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const authActionRef = useRef(false);

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
        validateToken(token).catch(console.error);
      }
    } catch (currentError) {
      console.error('Error checking auth:', currentError);
    } finally {
      setLoading(false);
    }
  };

  const validateToken = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/validar-token`, {
        method: 'POST',
        headers: getHeaders(token),
      });


      if (response.status === 403 || response.status === 401) {
        if (!authActionRef.current) {
          await AsyncStorage.multiRemove(['user', 'token']);
          setUser(null);
        }
        return false;
      }

      const data = await response.json();

      if (data.error && data.respuesta === 'Token invalido o expirado') {
        if (!authActionRef.current) {
          await AsyncStorage.multiRemove(['user', 'token']);
          setUser(null);
        }
        return false;
      }

      return true;
    } catch (currentError) {
      // Si el endpoint de validación falla por red o por un cambio de contrato,
      // no derribamos la sesión local automáticamente.
      console.error('No se pudo validar el token en background:', currentError);
      return true;
    }
  };

  const getSalesByProvider = async (providerId = null) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No hay token de autenticacion');

      const params = new URLSearchParams({
        clientId: providerId,
        limit: 50,
        page: 1,
      });

      const response = await fetch(
        `${API_BASE_URL}/transactions/provider?${params}`,
        {
          method: 'GET',
          headers: getHeaders(token),
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
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  };

  const getSalesByClient = async (providerId = null) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No hay token de autenticacion');

      const params = new URLSearchParams({
        clientId: providerId,
        limit: 50,
        page: 1,
      });

      const response = await fetch(
        `${API_BASE_URL}/transactions/client?${params}`,
        {
          method: 'GET',
          headers: getHeaders(token),
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
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  };

  const login = async (username, password) => {
    try {
      authActionRef.current = true;
      setLoading(true);
      setError(null);
      await AsyncStorage.multiRemove(['user', 'token']);

      const payload = buildLoginPayload(username, password);
      console.log('Intentando login con formato: legacy-query');

      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Respuesta no JSON en login (legacy-query)', parseError);
      }

      console.log('Login status:', response.status, 'formato: legacy-query');
      console.log(
        'Login respuesta:',
        'legacy-query',
        data?.message ?? data?.respuesta ?? data?.error ?? data
      );

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.respuesta ||
          'Error en la peticion de login'
        );
      }

      if (data?.error) {
        const errorInfo = data.respuesta ? String(data.respuesta).split('|') : ['Error en el login'];
        throw new Error(errorInfo.length > 1 ? errorInfo[1] : errorInfo[0]);
      }

      const userRecords = extractUserRecords(data);
      if (userRecords.length === 0) {
        throw new Error('Usuario o contrasena incorrectos');
      }

      const userData = userRecords[0];
      const sessionToken = extractToken(data, userData) ?? extractTokenFromHeaders(response);

      if (!sessionToken) {
        throw new Error('El backend autentico al usuario, pero no devolvio un token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);

      console.log('Login exitoso con formato: legacy-query');
      setUser(userData);
      router.replace('/(tabs)');
      return userData;
    } catch (currentError) {
      setError(currentError.message);
      throw currentError;
    } finally {
      authActionRef.current = false;
      setLoading(false);
    }
  };

  const register = async (name, email, password, type) => {
    try {
      authActionRef.current = true;
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, email, password: String(password ?? ''), type }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Error en el registro');
      if (!data.success) throw new Error(data.message || 'Error en el registro');

      const userData = Array.isArray(data.data) ? data.data[0] : data.data;
      const sessionToken = extractToken(data, userData) ?? extractTokenFromHeaders(response);

      if (!sessionToken) {
        throw new Error('El backend registro al usuario, pero no devolvio un token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);
      setUser(userData);

      router.replace('/(tabs)');
      return userData;
    } catch (currentError) {
      setError(currentError.message);
      throw currentError;
    } finally {
      authActionRef.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['user', 'token']);
      setUser(null);
      setError(null);
      router.replace('/login');
    } catch (currentError) {
      console.error('Error logging out:', currentError);
      setError('Error al cerrar sesion');
    }
  };

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    getSalesByProvider,
    getSalesByClient,
  };
};
