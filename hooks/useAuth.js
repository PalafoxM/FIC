import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl.replace(/\/+$/, '');
const AUTH_BASE_URL = API_BASE_URL;
const LEGACY_AUTH_BASE_URL = API_BASE_URL.endsWith('/api')
  ? `${API_BASE_URL.slice(0, -4)}/index.php/Login`
  : `${API_BASE_URL}/index.php/Login`;

const AuthContext = createContext(null);
const ACTIVE_ESTABLECIMIENTO_KEY = 'activeEstablecimientoId';

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

const normalizeEstablishments = (payload, userRecord) => {
  const rawList =
    userRecord?.establecimientos ??
    userRecord?.proveedorEstablecimientos ??
    payload?.establecimientos ??
    payload?.proveedorEstablecimientos ??
    payload?.assignedEstablishments ??
    [];

  if (!Array.isArray(rawList)) {
    return [];
  }

  return rawList
    .filter(Boolean)
    .map((item) => ({
      id_establecimiento:
        item?.id_establecimiento ??
        item?.idEstablecimiento ??
        item?.id ??
        null,
      dsc_establecimiento:
        item?.dsc_establecimiento ??
        item?.establecimiento_nombre ??
        item?.nombre ??
        item?.name ??
        'Establecimiento',
      id_tipo: item?.id_tipo ?? item?.idTipo ?? null,
    }))
    .filter((item) => item.id_establecimiento !== null);
};

const normalizeAuthenticatedUser = (payload, userRecord) => {
  if (!userRecord) {
    return null;
  }

  const establecimientos = normalizeEstablishments(payload, userRecord);
  const normalizedUser = {
    ...userRecord,
    saldo:
      userRecord?.monto_deposito ??
      userRecord?.saldo ??
      userRecord?.saldo_actual ??
      userRecord?.saldoDisponible ??
      payload?.monto_deposito ??
      payload?.saldo ??
      payload?.saldo_actual ??
      null,
  };

  if (establecimientos.length > 0) {
    normalizedUser.establecimientos = establecimientos;
  }

  if (
    normalizedUser.id_perfil === 5 &&
    !normalizedUser.establecimientos &&
    normalizedUser.id_establecimiento
  ) {
    normalizedUser.establecimientos = [
      {
        id_establecimiento: normalizedUser.id_establecimiento,
        dsc_establecimiento: normalizedUser.establecimiento_nombre ?? 'Establecimiento asignado',
        id_tipo: normalizedUser.id_tipo_establecimiento ?? null,
      },
    ];
  }

  return normalizedUser;
};

const normalizeTableRows = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.respuesta)) {
    return payload.respuesta;
  }

  return [];
};

const resolveDefaultEstablecimientoId = (userData) => {
  const normalizedList = Array.isArray(userData?.establecimientos) ? userData.establecimientos : [];

  if (normalizedList.length > 0) {
    return normalizedList[0]?.id_establecimiento ?? null;
  }

  return userData?.id_establecimiento ?? null;
};

const persistUserSession = async (userData) => {
  await AsyncStorage.setItem('user', JSON.stringify(userData));
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeEstablecimientoId, setActiveEstablecimientoIdState] = useState(null);
  const authActionRef = useRef(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const getApiJsonResponse = async ({
    url,
    method = 'POST',
    token = null,
    body,
    rawLabel = 'API',
    allowCannotPostFallback = false,
  }) => {
    const response = await fetch(url, {
      method,
      headers: getHeaders(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const rawResponse = await response.text();
    let data = null;

    try {
      data = rawResponse ? JSON.parse(rawResponse) : null;
    } catch (_parseError) {
      if (allowCannotPostFallback && rawResponse?.includes('Cannot POST')) {
        return { response, data: null, rawResponse, shouldContinue: true };
      }

      console.error(`${rawLabel} raw response:`, rawResponse);
      throw new Error(`El backend devolvio una respuesta no valida en ${rawLabel}`);
    }

    return { response, data, rawResponse, shouldContinue: false };
  };

  const getLoginResponse = async (payload, attemptLabel) => {
    console.log('Login intento:', attemptLabel);
    console.log('Login URL:', `${AUTH_BASE_URL}/login`);
    console.log('Login usuario:', payload?.usuario ?? '');
    console.log('Login password length:', String(payload?.contrasenia ?? '').length);

    const result = await getApiJsonResponse({
      url: `${AUTH_BASE_URL}/login`,
      body: payload,
      rawLabel: 'Login',
    });

    console.log(result.data);
    console.log('Login status:', result.response.status);
    console.log('Login respuesta:', result.data?.respuesta ?? result.data?.message ?? result.data);

    return result;
  };

  const getValidateTokenResponse = async (url, token) =>
    await getApiJsonResponse({
      url,
      token,
      rawLabel: 'ValidarToken',
      allowCannotPostFallback: true,
    });

  const getLogoutResponse = async (token) =>
    await getApiJsonResponse({
      url: `${AUTH_BASE_URL}/logout`,
      token,
      rawLabel: 'Logout',
    });

  const getTableResponse = async (queryConfig, token) =>
    await getApiJsonResponse({
      url: `${API_BASE_URL}/getTabla`,
      token,
      body: {
        data: queryConfig,
      },
      rawLabel: 'getTabla',
    });

  const checkAuthStatus = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');

      if (userJson && token) {
        const userData = JSON.parse(userJson);
        setUser(userData);
        const storedEstablecimientoId = await AsyncStorage.getItem(ACTIVE_ESTABLECIMIENTO_KEY);
        const availableIds = (userData?.establecimientos ?? [])
          .map((item) => String(item?.id_establecimiento ?? ''))
          .filter(Boolean);
        const fallbackId = resolveDefaultEstablecimientoId(userData);

        if (storedEstablecimientoId && availableIds.includes(storedEstablecimientoId)) {
          setActiveEstablecimientoIdState(storedEstablecimientoId);
        } else if (fallbackId) {
          setActiveEstablecimientoIdState(String(fallbackId));
          await AsyncStorage.setItem(ACTIVE_ESTABLECIMIENTO_KEY, String(fallbackId));
        } else {
          setActiveEstablecimientoIdState(null);
        }

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
          const { response, data, shouldContinue } = await getValidateTokenResponse(url, token);
          if (shouldContinue) {
            continue;
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

  const getTable = async (queryConfig) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const { response, data } = await getTableResponse(queryConfig, token);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'Error consultando datos');
    }

    return normalizeTableRows(data);
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

      const performLoginRequest = async (passwordValue, attemptLabel) =>
        await getLoginResponse(buildPayload(passwordValue), attemptLabel);

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

      const userRecord = extractUserRecord(data);
      const userData = normalizeAuthenticatedUser(data, userRecord);
      const sessionToken = extractToken(data, userData);
      console.log('Login userData encontrado:', !!userData);
      console.log('Login token encontrado:', !!sessionToken);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvió usuario/token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);
      const defaultEstablecimientoId = resolveDefaultEstablecimientoId(userData);
      if (defaultEstablecimientoId) {
        await AsyncStorage.setItem(ACTIVE_ESTABLECIMIENTO_KEY, String(defaultEstablecimientoId));
        setActiveEstablecimientoIdState(String(defaultEstablecimientoId));
      } else {
        await AsyncStorage.removeItem(ACTIVE_ESTABLECIMIENTO_KEY);
        setActiveEstablecimientoIdState(null);
      }

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

      const userRecord = Array.isArray(data.data) ? data.data[0] : data.data;
      const userData = normalizeAuthenticatedUser(data, userRecord);
      const sessionToken = extractToken(data, userData);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvió usuario/token');
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('token', sessionToken);
      const defaultEstablecimientoId = resolveDefaultEstablecimientoId(userData);
      if (defaultEstablecimientoId) {
        await AsyncStorage.setItem(ACTIVE_ESTABLECIMIENTO_KEY, String(defaultEstablecimientoId));
        setActiveEstablecimientoIdState(String(defaultEstablecimientoId));
      } else {
        await AsyncStorage.removeItem(ACTIVE_ESTABLECIMIENTO_KEY);
        setActiveEstablecimientoIdState(null);
      }
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
          await getLogoutResponse(token);
        } catch (logoutError) {
          console.error('No se pudo cerrar sesión en backend:', logoutError);
        }
      }

      await AsyncStorage.multiRemove(['user', 'token', ACTIVE_ESTABLECIMIENTO_KEY]);
      setUser(null);
      setActiveEstablecimientoIdState(null);
      setError(null);
    } catch (currentError) {
      console.error('Error logging out:', currentError);
      setError('Error al cerrar sesión');
    } finally {
      authActionRef.current = false;
    }
  };

  const setActiveEstablecimiento = async (establecimientoId) => {
    const nextValue = establecimientoId ? String(establecimientoId) : null;
    setActiveEstablecimientoIdState(nextValue);

    if (nextValue) {
      await AsyncStorage.setItem(ACTIVE_ESTABLECIMIENTO_KEY, nextValue);
    } else {
      await AsyncStorage.removeItem(ACTIVE_ESTABLECIMIENTO_KEY);
    }
  };

  const getSalesByProvider = async (providerId = null, filters = {}) => {
    try {
      const where = {
        visible: 1,
      };

      const establecimientoId = Number(filters.id_establecimiento ?? activeEstablecimientoId ?? user?.id_establecimiento ?? 0);
      if (establecimientoId > 0) {
        where.id_establecimiento = establecimientoId;
      }

      const rows = await getTable({
        tabla: 'pagos',
        where,
        order: 'fec_reg DESC',
      });

      return rows;
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  };

  const getSalesByClient = async (providerId = null, filters = {}) => {
    try {
      const rows = await getTable({
        tabla: 'pagos',
        where: {
          id_usuario: providerId,
          visible: 1,
        },
        order: 'fec_reg DESC',
      });

      return rows;
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  };

  const getClientAvailableBalance = async (clientId = user?.id_usuario) => {
    try {
      const normalizedClientId = Number(clientId ?? 0);
      if (normalizedClientId <= 0) {
        return null;
      }

      const sessionToken = await AsyncStorage.getItem('token');
      if (!sessionToken) {
        return Number(
          user?.monto_deposito ??
            user?.saldo ??
            user?.saldo_actual ??
            user?.saldoDisponible ??
            0
        );
      }

      const userRows = await getTable({
        tabla: 'usuario',
        where: {
          id_usuario: normalizedClientId,
          visible: 1,
        },
        limit: 1,
      });

      const balance = userRows?.[0]?.monto_deposito;
      if (balance !== null && balance !== undefined && balance !== '') {
        if (user && Number(user?.id_usuario ?? 0) === normalizedClientId) {
          const nextUser = {
            ...user,
            monto_deposito: Number(balance),
            saldo: Number(balance),
          };
          setUser(nextUser);
          await persistUserSession(nextUser);
        }

        return Number(balance);
      }

      return 0;
    } catch (currentError) {
      console.error('Error fetching client balance:', currentError);
      throw currentError;
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      activeEstablecimientoId,
      login,
      register,
      logout,
      getTable,
      setActiveEstablecimiento,
      getSalesByProvider,
      getSalesByClient,
      getClientAvailableBalance,
    }),
    [user, loading, error, activeEstablecimientoId]
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
