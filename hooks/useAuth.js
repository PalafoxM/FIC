import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl.replace(/\/+$/, '');
const AUTH_BASE_URL = API_BASE_URL;
const LEGACY_AUTH_BASE_URL = API_BASE_URL.endsWith('/api')
  ? `${API_BASE_URL.slice(0, -4)}/index.php/Login`
  : `${API_BASE_URL}/index.php/Login`;

const AuthContext = createContext(null);

const getHeaders = (token = null) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (ENV.tokenApi) {
    headers['X-API-Token'] = ENV.tokenApi;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const extractUserRecord = (payload) =>
  payload?.user ??
  (Array.isArray(payload?.data) ? payload.data[0] : null) ??
  (payload?.data && typeof payload.data === 'object' ? payload.data : null) ??
  null;

const extractToken = (payload, userRecord) =>
  payload?.token ??
  payload?.api_token ??
  userRecord?.token ??
  userRecord?.api_token ??
  (Array.isArray(payload?.data) ? payload.data[0]?.token : null) ??
  (Array.isArray(payload?.data) ? payload.data[0]?.api_token : null) ??
  payload?.accessToken ??
  payload?.access_token ??
  null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      const candidateUrls = [
        `${AUTH_BASE_URL}/validar-token`,
        `${LEGACY_AUTH_BASE_URL}/validarTokenApi`,
      ];

      for (const url of candidateUrls) {
        const response = await fetch(url, {
          method: 'POST',
          headers: getHeaders(token),
        });

        const rawResponse = await response.text();
        let data = null;

        try {
          data = rawResponse ? JSON.parse(rawResponse) : null;
        } catch (parseError) {
          if (rawResponse?.includes('Cannot POST')) {
            continue;
          }
          console.error('ValidarToken raw response:', rawResponse);
          return true;
        }

        if (!response.ok || data?.error) {
          if (!authActionRef.current) {
            await AsyncStorage.multiRemove(['user', 'token']);
            setUser(null);
          }
          return false;
        }

        return true;
      }

      return true;
    } catch (currentError) {
      console.error('No se pudo validar el token en background:', currentError);
      return true;
    }
  };

  const login = async (username, password) => {
    try {
      authActionRef.current = true;
      setLoading(true);
      setError(null);
      await AsyncStorage.multiRemove(['user', 'token']);

      const normalizedUsername = String(username ?? '').trim();
      const normalizedPassword = String(password ?? '').toLowerCase();
      const trimmedPassword = normalizedPassword.trim();

      const buildPayload = (passwordValue) => ({
        usuario: normalizedUsername,
        contrasenia: passwordValue,
        data: {
          where: {
            usuario: normalizedUsername,
            contrasenia: passwordValue,
            visible: 1,
          },
        },
      });

      const performLoginRequest = async (passwordValue, attemptLabel) => {
        console.log('Login intento:', attemptLabel);
        console.log('Login URL:', `${AUTH_BASE_URL}/login`);
        console.log('Login usuario:', normalizedUsername);
        console.log('Login password length:', passwordValue.length);

        const response = await fetch(`${AUTH_BASE_URL}/login`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(buildPayload(passwordValue)),
        });

        const rawResponse = await response.text();
        let data = null;

        try {
          data = rawResponse ? JSON.parse(rawResponse) : null;
          console.log(data);
        } catch (parseError) {
          console.error('Login raw response:', rawResponse);
          throw new Error('La respuesta del servidor no es JSON valido');
        }

        console.log('Login status:', response.status);
        console.log('Login respuesta:', data?.respuesta ?? data?.message ?? data);

        return { response, data };
      };

      let { response, data } = await performLoginRequest(normalizedPassword, 'original');

      const shouldRetryTrimmedPassword =
        normalizedPassword !== trimmedPassword &&
        (data?.respuesta === 'Usuario o contraseña incorrectos' || data?.error === true);

      if (shouldRetryTrimmedPassword) {
        console.log('Reintentando login con password trimmed');
        ({ response, data } = await performLoginRequest(trimmedPassword, 'trimmed'));
      }

      if (!response.ok || data?.error) {
        throw new Error(data?.respuesta || 'Error al iniciar sesión');
      }

      const userData = extractUserRecord(data);
      const sessionToken = extractToken(data, userData);
      console.log('Login userData encontrado:', !!userData);
      console.log('Login token encontrado:', !!sessionToken);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvió usuario/token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);

      setUser(userData);
      return userData;
    } catch (currentError) {
      setError(currentError.message || 'Error al iniciar sesión');
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

      const response = await fetch(`${AUTH_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, email, password: String(password ?? ''), type }),
      });

      const rawResponse = await response.text();
      const data = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Error en el registro');
      }

      const userData = Array.isArray(data.data) ? data.data[0] : data.data;
      const sessionToken = extractToken(data, userData);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvió usuario/token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);
      setUser(userData);

      return userData;
    } catch (currentError) {
      setError(currentError.message || 'Error en el registro');
      throw currentError;
    } finally {
      authActionRef.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      authActionRef.current = true;
      const token = await AsyncStorage.getItem('token');

      if (token) {
        try {
          await fetch(`${AUTH_BASE_URL}/logout`, {
            method: 'POST',
            headers: getHeaders(token),
          });
        } catch (logoutError) {
          console.error('No se pudo cerrar sesión en backend:', logoutError);
        }
      }

      await AsyncStorage.multiRemove(['user', 'token']);
      setUser(null);
      setError(null);
    } catch (currentError) {
      console.error('Error logging out:', currentError);
      setError('Error al cerrar sesión');
    } finally {
      authActionRef.current = false;
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

      const response = await fetch(`${API_BASE_URL}/transactions/provider?${params}`, {
        method: 'GET',
        headers: getHeaders(token),
      });

      const rawResponse = await response.text();
      const data = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Error al obtener ventas');
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

      const response = await fetch(`${API_BASE_URL}/transactions/client?${params}`, {
        method: 'GET',
        headers: getHeaders(token),
      });

      const rawResponse = await response.text();
      const data = rawResponse ? JSON.parse(rawResponse) : null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Error al obtener ventas');
      }

      return data.data;
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      register,
      logout,
      getSalesByProvider,
      getSalesByClient,
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
};
