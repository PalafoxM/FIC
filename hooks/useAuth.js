import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

const parseSqlDate = (value) => {
  if (!value) {
    return null;
  }

  const normalizedValue = String(value).replace(' ', 'T');
  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const isQrCurrentlyValid = (qrRow) => {
  if (!qrRow || Number(qrRow?.activo ?? 0) !== 1 || Number(qrRow?.visible ?? 0) !== 1) {
    return false;
  }

  const now = new Date();
  const vigenteDesde = parseSqlDate(qrRow?.vigente_desde);
  const vigenteHasta = parseSqlDate(qrRow?.vigente_hasta);

  if (vigenteDesde && vigenteDesde > now) {
    return false;
  }

  if (vigenteHasta && vigenteHasta < now) {
    return false;
  }

  return true;
};

const getTipoPagoLabel = (paymentRow, tipoPagoMap) =>
  paymentRow?.tipo_pago ??
  paymentRow?.dsc_tipo_pago ??
  tipoPagoMap?.[Number(paymentRow?.id_tipo_pago ?? 0)] ??
  'Tipo de pago no disponible';

const enrichPaymentsWithCatalog = (payments, catalogRows) => {
  const tipoPagoMap = (Array.isArray(catalogRows) ? catalogRows : []).reduce((accumulator, row) => {
    const paymentTypeId = Number(row?.id_tipo_pago ?? 0);
    if (paymentTypeId > 0 && row?.dsc_tipo_pago) {
      accumulator[paymentTypeId] = row.dsc_tipo_pago;
    }
    return accumulator;
  }, {});

  return (Array.isArray(payments) ? payments : []).map((payment) => {
    const hasPdfEvidence = Boolean(String(payment?.evid_pdf ?? '').trim());
    const hasXmlEvidence = Boolean(String(payment?.evid_xml ?? '').trim());

    return {
      ...payment,
      tipo_pago: getTipoPagoLabel(payment, tipoPagoMap),
      dsc_tipo_pago: getTipoPagoLabel(payment, tipoPagoMap),
      evidencias_completas: hasPdfEvidence && hasXmlEvidence,
    };
  });
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeEstablecimientoId, setActiveEstablecimientoIdState] = useState(null);
  const authActionRef = useRef(false);

  const getApiJsonResponse = useCallback(async ({
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
  }, []);

  const getLoginResponse = useCallback(async (payload, attemptLabel) => {
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
  }, [getApiJsonResponse]);

  const getValidateTokenResponse = useCallback(async (url, token) =>
    await getApiJsonResponse({
      url,
      token,
      rawLabel: 'ValidarToken',
      allowCannotPostFallback: true,
    }), [getApiJsonResponse]);

  const getLogoutResponse = useCallback(async (url, token) =>
    await getApiJsonResponse({
      url,
      token,
      rawLabel: 'Logout',
      allowCannotPostFallback: true,
    }), [getApiJsonResponse]);

  const getTableResponse = useCallback(async (queryConfig, token) =>
    await getApiJsonResponse({
      url: `${API_BASE_URL}/getTabla`,
      token,
      body: {
        data: queryConfig,
      },
      rawLabel: 'getTabla',
    }), [getApiJsonResponse]);

  const getSaveTableResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${API_BASE_URL}/saveTabla`,
      token,
      body: payload,
      rawLabel: 'saveTabla',
    }), [getApiJsonResponse]);

  const hydrateAuthenticatedUser = useCallback(async (baseUser, token) => {
    if (!baseUser?.id_usuario || !token) {
      return baseUser;
    }

    try {
      const [userResponse, qrResponse] = await Promise.all([
        getTableResponse({
          tabla: 'usuario',
          where: {
            id_usuario: baseUser.id_usuario,
            visible: 1,
          },
          limit: 1,
        }, token),
        getTableResponse({
          tabla: 'qr_cliente',
          where: {
            id_usuario: baseUser.id_usuario,
            activo: 1,
            visible: 1,
          },
          order: 'id_qr_cliente DESC',
        }, token),
      ]);

      const hydratedUserRow = normalizeTableRows(userResponse?.data)?.[0] ?? null;
      const qrRows = normalizeTableRows(qrResponse?.data);
      const validQrRow = qrRows.find((row) => isQrCurrentlyValid(row)) ?? null;

      return {
        ...baseUser,
        ...(hydratedUserRow ?? {}),
        saldo:
          hydratedUserRow?.monto_deposito ??
          baseUser?.monto_deposito ??
          baseUser?.saldo ??
          baseUser?.saldo_actual ??
          baseUser?.saldoDisponible ??
          null,
        codigo_qr:
          validQrRow?.codigo_qr ??
          baseUser?.codigo_qr ??
          baseUser?.qr_code ??
          baseUser?.clientQrCode ??
          null,
        vigente_desde: validQrRow?.vigente_desde ?? null,
        vigente_hasta: validQrRow?.vigente_hasta ?? null,
      };
    } catch (currentError) {
      console.error('Error hydrating authenticated user:', currentError);
      return baseUser;
    }
  }, [getTableResponse]);

  const validateToken = useCallback(async (token) => {
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
          return { valid: false, userData: null };
        }

        const userRecord = extractUserRecord(data);
        return {
          valid: true,
          userData: normalizeAuthenticatedUser(data, userRecord),
        };
      }

      return { valid: true, userData: null };
    } catch (currentError) {
      console.error('No se pudo validar el token en background:', currentError);
      return { valid: true, userData: null };
    }
  }, [getValidateTokenResponse]);

  const checkAuthStatus = useCallback(async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');

      if (userJson && token) {
        const storedUserData = JSON.parse(userJson);
        const validation = await validateToken(token);

        if (!validation.valid) {
          return;
        }

        const tokenUserData = validation.userData?.id_usuario ? validation.userData : null;
        if (
          tokenUserData?.id_usuario &&
          storedUserData?.id_usuario &&
          Number(tokenUserData.id_usuario) !== Number(storedUserData.id_usuario)
        ) {
          console.log('Sesion local sincronizada con usuario del token:', {
            storedUserId: storedUserData.id_usuario,
            tokenUserId: tokenUserData.id_usuario,
          });
        }

        const userData = await hydrateAuthenticatedUser(tokenUserData ?? storedUserData, token);
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));

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

      }
    } catch (currentError) {
      console.error('Error checking auth:', currentError);
    } finally {
      setLoading(false);
    }
  }, [hydrateAuthenticatedUser, validateToken]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const getTable = useCallback(async (queryConfig) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const { response, data } = await getTableResponse(queryConfig, token);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'Error consultando datos');
    }

    return normalizeTableRows(data);
  }, [getTableResponse]);

  const saveTable = useCallback(async ({ data, config, bitacora = {} }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      data,
      config,
      bitacora: {
        id_user: user?.id_usuario ?? 0,
        script: bitacora.script ?? 'App.saveTable',
        ...bitacora,
      },
    };

    const { response, data: responseData } = await getSaveTableResponse(payload, token);

    if (!response.ok || responseData?.error) {
      throw new Error(responseData?.respuesta || responseData?.message || 'Error guardando datos');
    }

    return responseData;
  }, [getSaveTableResponse, user?.id_usuario]);

  const login = useCallback(async (username, password) => {
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
          (data?.respuesta === 'Usuario o contrasena incorrectos' || data?.error === true);

      if (shouldRetryTrimmedPassword) {
        console.log('Reintentando login con password trimmed');
        ({ response, data } = await performLoginRequest(trimmedPassword, 'trimmed'));
      }

      if (!response.ok || data?.error) {
        throw new Error(data?.respuesta || 'Error al iniciar sesion');
      }

      const userRecord = extractUserRecord(data);
      const normalizedUserData = normalizeAuthenticatedUser(data, userRecord);
      const sessionToken = extractToken(data, normalizedUserData);
      const userData = await hydrateAuthenticatedUser(normalizedUserData, sessionToken);

      console.log('Login userData encontrado:', !!userData);
      console.log('Login token encontrado:', !!sessionToken);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvio usuario/token');
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
      setError(currentError.message || 'Error al iniciar sesion');
      throw currentError;
    } finally {
      authActionRef.current = false;
      setLoading(false);
    }
  }, [getLoginResponse, hydrateAuthenticatedUser]);

  const register = useCallback(async (name, email, password, type) => {
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
      const normalizedUserData = normalizeAuthenticatedUser(data, userRecord);
      const sessionToken = extractToken(data, normalizedUserData);

      const userData = await hydrateAuthenticatedUser(normalizedUserData, sessionToken);

      if (!userData || !sessionToken) {
        throw new Error('El backend no devolvio usuario/token');
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
  }, [hydrateAuthenticatedUser]);

  const logout = useCallback(async () => {
    try {
      authActionRef.current = true;
      const token = await AsyncStorage.getItem('token');

      if (token) {
        try {
          const candidateUrls = [
            `${AUTH_BASE_URL}/logout`,
            `${LEGACY_AUTH_BASE_URL}/logoutApi`,
          ];

          for (const url of candidateUrls) {
            const { response, data, shouldContinue } = await getLogoutResponse(url, token);
            if (shouldContinue) {
              continue;
            }

            if (response.ok && !data?.error) {
              break;
            }
          }
        } catch (logoutError) {
          console.error('No se pudo cerrar sesion en backend:', logoutError);
        }
      }

      await AsyncStorage.multiRemove(['user', 'token', ACTIVE_ESTABLECIMIENTO_KEY]);
      setUser(null);
      setActiveEstablecimientoIdState(null);
      setError(null);
    } catch (currentError) {
      console.error('Error logging out:', currentError);
      setError('Error al cerrar sesion');
    } finally {
      authActionRef.current = false;
    }
  }, [getLogoutResponse]);

  const setActiveEstablecimiento = useCallback(async (establecimientoId) => {
    const nextValue = establecimientoId ? String(establecimientoId) : null;
    setActiveEstablecimientoIdState(nextValue);

      if (nextValue) {
        await AsyncStorage.setItem(ACTIVE_ESTABLECIMIENTO_KEY, nextValue);
      } else {
        await AsyncStorage.removeItem(ACTIVE_ESTABLECIMIENTO_KEY);
      }
  }, []);

  const getPaymentTypesCatalog = useCallback(async () =>
    await getTable({
      tabla: 'cat_tipo_pago',
      where: {
        visible: 1,
      },
      order: 'id_tipo_pago ASC',
    }), [getTable]);

  const getSalesByProvider = useCallback(async (_providerId = null, filters = {}) => {
    try {
      const where = {
        visible: 1,
      };

      const establecimientoId = Number(
        filters.id_establecimiento ?? activeEstablecimientoId ?? user?.id_establecimiento ?? 0
      );

      if (establecimientoId > 0) {
        where.id_establecimiento = establecimientoId;
      }

      const [paymentRows, paymentTypes] = await Promise.all([
        getTable({
          tabla: 'pagos',
          where,
          order: 'fec_reg DESC',
        }),
        getPaymentTypesCatalog(),
      ]);

      return enrichPaymentsWithCatalog(paymentRows, paymentTypes);
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  }, [activeEstablecimientoId, getPaymentTypesCatalog, getTable, user?.id_establecimiento]);

  const getSalesByClient = useCallback(async (clientId = null, _filters = {}) => {
    try {
      const [paymentRows, paymentTypes] = await Promise.all([
        getTable({
          tabla: 'pagos',
          where: {
            id_usuario: clientId,
            visible: 1,
          },
          order: 'fec_reg DESC',
        }),
        getPaymentTypesCatalog(),
      ]);

      return enrichPaymentsWithCatalog(paymentRows, paymentTypes);
    } catch (currentError) {
      console.error('Error fetching sales:', currentError);
      throw currentError;
    }
  }, [getPaymentTypesCatalog, getTable]);

  const getConsumptionPayments = useCallback(async (clientId = null) => {
    try {
      const normalizedClientId = Number(clientId ?? 0);
      const where = {
        visible: 1,
      };

      if (normalizedClientId > 0) {
        where.id_usuario = normalizedClientId;
      }

      const [paymentRows, paymentTypes, establishmentRows, userRows] = await Promise.all([
        getTable({
          tabla: 'pagos',
          where,
          order: 'fec_reg DESC',
        }),
        getPaymentTypesCatalog(),
        getTable({
          tabla: 'establecimiento',
          where: {
            visible: 1,
          },
        }),
        getTable({
          tabla: 'usuario',
          where: {
            visible: 1,
          },
        }),
      ]);

      const establishmentsMap = (Array.isArray(establishmentRows) ? establishmentRows : []).reduce(
        (accumulator, row) => {
          accumulator[String(row?.id_establecimiento ?? '')] = row?.dsc_establecimiento;
          return accumulator;
        },
        {}
      );
      const usersMap = (Array.isArray(userRows) ? userRows : []).reduce((accumulator, row) => {
        accumulator[String(row?.id_usuario ?? '')] = [row?.nombre, row?.primer_apellido, row?.segundo_apellido]
          .filter(Boolean)
          .join(' ');
        return accumulator;
      }, {});

      return enrichPaymentsWithCatalog(paymentRows, paymentTypes).map((payment) => ({
        ...payment,
        cliente_nombre:
          payment?.cliente_nombre ??
          usersMap[String(payment?.id_usuario ?? '')] ??
          'Cliente no disponible',
        establecimiento_nombre:
          payment?.establecimiento_nombre ??
          establishmentsMap[String(payment?.id_establecimiento ?? '')] ??
          'Establecimiento no disponible',
      }));
    } catch (currentError) {
      console.error('Error fetching consumption payments:', currentError);
      throw currentError;
    }
  }, [getPaymentTypesCatalog, getTable]);

  const getClientQrData = useCallback(async (clientId = user?.id_usuario) => {
    try {
      const normalizedClientId = Number(clientId ?? 0);
      if (normalizedClientId <= 0) {
        return null;
      }

      const qrRows = await getTable({
        tabla: 'qr_cliente',
        where: {
          id_usuario: normalizedClientId,
          activo: 1,
          visible: 1,
        },
        order: 'id_qr_cliente DESC',
      });

      return qrRows.find((row) => isQrCurrentlyValid(row)) ?? null;
    } catch (currentError) {
      console.error('Error fetching client QR data:', currentError);
      throw currentError;
    }
  }, [getTable, user?.id_usuario]);

  const getClientAvailableBalance = useCallback(async (clientId = user?.id_usuario) => {
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
        return Number(balance);
      }

      return 0;
    } catch (currentError) {
      console.error('Error fetching client balance:', currentError);
      throw currentError;
    }
  }, [getTable, user?.id_usuario, user?.monto_deposito, user?.saldo, user?.saldoDisponible, user?.saldo_actual]);

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
      saveTable,
      setActiveEstablecimiento,
      getSalesByProvider,
      getSalesByClient,
      getConsumptionPayments,
      getClientAvailableBalance,
      getClientQrData,
    }),
    [
      activeEstablecimientoId,
      error,
      getClientAvailableBalance,
      getConsumptionPayments,
      getSalesByClient,
      getSalesByProvider,
      getTable,
      getClientQrData,
      saveTable,
      loading,
      login,
      logout,
      register,
      setActiveEstablecimiento,
      user,
    ]
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

