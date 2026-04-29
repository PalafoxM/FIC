import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl.replace(/\/+$/, '');
const AUTH_BASE_URL = API_BASE_URL;
const PHP_BASE_URL = API_BASE_URL.endsWith('/api')
  ? `${API_BASE_URL.slice(0, -4)}/index.php`
  : `${API_BASE_URL}/index.php`;
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

const normalizeQrStatus = (qrRow) => {
  if (!qrRow) {
    return {
      qr_activo: 0,
      qr_operativo: false,
      qr_vencido: false,
    };
  }

  const vigenteHasta = parseSqlDate(qrRow?.vigente_hasta);
  const now = new Date();
  const qrVencido = Boolean(vigenteHasta && vigenteHasta < now);
  const qrActivo = Number(
    qrRow?.qr_activo ??
    qrRow?.activo ??
    0
  ) === 1 ? 1 : 0;

  return {
    qr_activo: qrActivo,
    qr_operativo: qrActivo === 1 && isQrCurrentlyValid(qrRow),
    qr_vencido: qrVencido,
  };
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

  const getDepositoCreditoResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/Inicio/guardarDepositoCreditoUsuarioFic`,
      token,
      body: payload,
      rawLabel: 'guardarDepositoCreditoUsuarioFic',
    }), [getApiJsonResponse]);

  const getCashierSummaryResponse = useCallback(async (folio, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cajero/resumen?folio=${encodeURIComponent(String(folio ?? '').trim())}`,
      method: 'GET',
      token,
      rawLabel: 'cajeroResumen',
    }), [getApiJsonResponse]);

  const getCashierSaveExpedienteResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cajero/guardar-expediente`,
      token,
      body: payload,
      rawLabel: 'cajeroGuardarExpediente',
    }), [getApiJsonResponse]);

  const getCashierPresignExpedienteResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cajero/presign-expediente`,
      token,
      body: payload,
      rawLabel: 'cajeroPresignExpediente',
    }), [getApiJsonResponse]);

  const getCashierSaveExpedienteS3Response = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cajero/guardar-expediente-s3`,
      token,
      body: payload,
      rawLabel: 'cajeroGuardarExpedienteS3',
    }), [getApiJsonResponse]);

  const getClientActivationStatusResponse = useCallback(async (userId, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cliente/activacion-qr-status?id_usuario=${encodeURIComponent(String(userId ?? '').trim())}`,
      method: 'GET',
      token,
      rawLabel: 'clienteActivacionQrStatus',
    }), [getApiJsonResponse]);

  const getClientRequestActivationResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cliente/solicitar-activacion-qr`,
      token,
      body: payload,
      rawLabel: 'clienteSolicitarActivacionQr',
    }), [getApiJsonResponse]);

  const getClientPresignActivationResponse = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cliente/presign-activacion-qr`,
      token,
      body: payload,
      rawLabel: 'clientePresignActivacionQr',
    }), [getApiJsonResponse]);

  const getClientRequestActivationS3Response = useCallback(async (payload, token) =>
    await getApiJsonResponse({
      url: `${PHP_BASE_URL}/api/cliente/solicitar-activacion-qr-s3`,
      token,
      body: payload,
      rawLabel: 'clienteSolicitarActivacionQrS3',
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
          qrRows?.[0]?.codigo_qr ??
          baseUser?.codigo_qr ??
          baseUser?.qr_code ??
          baseUser?.clientQrCode ??
          null,
        vigente_desde: validQrRow?.vigente_desde ?? qrRows?.[0]?.vigente_desde ?? null,
        vigente_hasta: validQrRow?.vigente_hasta ?? qrRows?.[0]?.vigente_hasta ?? null,
        ...normalizeQrStatus(validQrRow ?? qrRows?.[0] ?? null),
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

  const saveDepositoCredito = useCallback(async ({
    id_usuario,
    monto_deposito,
    vigente_desde,
    vigente_hasta,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      id_usuario: Number(id_usuario ?? 0),
      monto_deposito:
        monto_deposito !== undefined && monto_deposito !== null
          ? String(monto_deposito)
          : '',
      vigente_desde: vigente_desde ?? '',
      vigente_hasta: vigente_hasta ?? '',
    };

    const { response, data } = await getDepositoCreditoResponse(payload, token);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo guardar el deposito.');
    }

    return data;
  }, [getDepositoCreditoResponse]);

  const getCashierDeliverySummary = useCallback(async (folio) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const normalizedFolio = String(folio ?? '').trim();
    if (!normalizedFolio) {
      throw new Error('Captura un folio valido.');
    }

    console.log('Cajero resumen URL:', `${PHP_BASE_URL}/api/cajero/resumen?folio=${encodeURIComponent(normalizedFolio)}`);
    console.log('Cajero resumen token encontrado:', Boolean(token));
    const { response, data } = await getCashierSummaryResponse(normalizedFolio, token);
    console.log('Cajero resumen status:', response.status);
    console.log('Cajero resumen respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo consultar el resumen del interesado.');
    }

    return data?.data ?? null;
  }, [getCashierSummaryResponse]);

  const saveCashierDeliveryExpediente = useCallback(async ({
    folio,
    id_usuario,
    anverso_base64,
    reverso_base64,
    firma_base64,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      folio: String(folio ?? '').trim(),
      id_usuario: Number(id_usuario ?? 0),
      anverso_base64: anverso_base64 ?? '',
      reverso_base64: reverso_base64 ?? '',
      firma_base64: firma_base64 ?? '',
    };

    console.log('Guardar expediente URL:', `${PHP_BASE_URL}/api/cajero/guardar-expediente`);
    console.log('Guardar expediente payload:', {
      folio: payload.folio,
      id_usuario: payload.id_usuario,
      hasAnverso: Boolean(payload.anverso_base64),
      hasReverso: Boolean(payload.reverso_base64),
      hasFirma: Boolean(payload.firma_base64),
    });
    const { response, data } = await getCashierSaveExpedienteResponse(payload, token);
    console.log('Guardar expediente status:', response.status);
    console.log('Guardar expediente respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo guardar el expediente.');
    }

    return data;
  }, [getCashierSaveExpedienteResponse]);

  const presignCashierDeliveryExpediente = useCallback(async ({
    folio,
    id_usuario,
    archivos,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      folio: String(folio ?? '').trim(),
      id_usuario: Number(id_usuario ?? 0),
      archivos: Array.isArray(archivos) ? archivos : [],
    };

    console.log('Presign expediente URL:', `${PHP_BASE_URL}/api/cajero/presign-expediente`);
    console.log('Presign expediente payload:', payload);
    const { response, data, rawResponse } = await getCashierPresignExpedienteResponse(payload, token);
    console.log('Presign expediente status:', response.status);
    console.log('Presign expediente respuesta:', data?.respuesta ?? data?.message ?? data);
    console.log('Presign expediente body:', data);
    console.log(
      'Presign expediente uploads count:',
      Array.isArray(data?.data?.uploads) ? data.data.uploads.length : 0
    );

    if (!response.ok || data?.error) {
      if (!data && rawResponse) {
        console.error('Presign expediente raw response:', rawResponse);
      }

      if (response.status === 403) {
        throw new Error('No tienes permisos para generar las URLs firmadas del expediente.');
      }

      throw new Error(data?.respuesta || data?.message || 'No se pudieron generar las URLs firmadas.');
    }

    return data;
  }, [getCashierPresignExpedienteResponse]);

  const saveCashierDeliveryExpedienteS3 = useCallback(async ({
    folio,
    id_usuario,
    anverso_key,
    reverso_key,
    firma_key,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      folio: String(folio ?? '').trim(),
      id_usuario: Number(id_usuario ?? 0),
      anverso_key: String(anverso_key ?? '').trim(),
      reverso_key: String(reverso_key ?? '').trim(),
      firma_key: String(firma_key ?? '').trim(),
    };

    console.log('Guardar expediente S3 URL:', `${PHP_BASE_URL}/api/cajero/guardar-expediente-s3`);
    console.log('Guardar expediente S3 payload:', payload);
    const { response, data } = await getCashierSaveExpedienteS3Response(payload, token);
    console.log('Guardar expediente S3 status:', response.status);
    console.log('Guardar expediente S3 respuesta:', data?.respuesta ?? data?.message ?? data);
    console.log('Guardar expediente S3 body:', data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo confirmar el expediente en S3.');
    }

    return data;
  }, [getCashierSaveExpedienteS3Response]);

  const getClientQrActivationStatus = useCallback(async (clientId = user?.id_usuario) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const normalizedClientId = Number(clientId ?? 0);
    if (normalizedClientId <= 0) {
      throw new Error('No se pudo identificar al cliente.');
    }

    console.log('Cliente activacion status URL:', `${PHP_BASE_URL}/api/cliente/activacion-qr-status?id_usuario=${normalizedClientId}`);
    const { response, data } = await getClientActivationStatusResponse(normalizedClientId, token);
    console.log('Cliente activacion status:', response.status);
    console.log('Cliente activacion respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo consultar el estatus de activacion.');
    }

    return data?.data ?? null;
  }, [getClientActivationStatusResponse, user?.id_usuario]);

  const requestClientQrActivation = useCallback(async ({
    id_usuario,
    folio,
    anverso_base64,
    reverso_base64,
    firma_base64,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      id_usuario: Number(id_usuario ?? 0),
      folio: String(folio ?? '').trim(),
      anverso_base64: anverso_base64 ?? '',
      reverso_base64: reverso_base64 ?? '',
      firma_base64: firma_base64 ?? '',
    };

    console.log('Solicitar activacion QR URL:', `${PHP_BASE_URL}/api/cliente/solicitar-activacion-qr`);
    console.log('Solicitar activacion payload:', {
      id_usuario: payload.id_usuario,
      folio: payload.folio,
      hasAnverso: Boolean(payload.anverso_base64),
      hasReverso: Boolean(payload.reverso_base64),
      hasFirma: Boolean(payload.firma_base64),
    });
    const { response, data } = await getClientRequestActivationResponse(payload, token);
    console.log('Solicitar activacion status:', response.status);
    console.log('Solicitar activacion respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo enviar la solicitud de activacion.');
    }

    return data;
  }, [getClientRequestActivationResponse]);

  const presignClientQrActivation = useCallback(async ({
    id_usuario,
    folio,
    archivos,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      id_usuario: Number(id_usuario ?? 0),
      folio: String(folio ?? '').trim(),
      archivos: Array.isArray(archivos) ? archivos : [],
    };

    console.log('Presign activacion cliente URL:', `${PHP_BASE_URL}/api/cliente/presign-activacion-qr`);
    console.log('Presign activacion cliente payload:', payload);
    const { response, data, rawResponse } = await getClientPresignActivationResponse(payload, token);
    console.log('Presign activacion cliente status:', response.status);
    console.log('Presign activacion cliente respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      if (!data && rawResponse) {
        console.error('Presign activacion cliente raw response:', rawResponse);
      }

      if (response.status === 403) {
        throw new Error('No tienes permisos para generar las URLs firmadas de activacion.');
      }

      throw new Error(data?.respuesta || data?.message || 'No se pudieron generar las URLs firmadas de activacion.');
    }

    return data;
  }, [getClientPresignActivationResponse]);

  const requestClientQrActivationS3 = useCallback(async ({
    id_usuario,
    folio,
    anverso_key,
    reverso_key,
    firma_key,
  }) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de autenticacion');
    }

    const payload = {
      id_usuario: Number(id_usuario ?? 0),
      folio: String(folio ?? '').trim(),
      anverso_key: String(anverso_key ?? '').trim(),
      reverso_key: String(reverso_key ?? '').trim(),
      firma_key: String(firma_key ?? '').trim(),
    };

    console.log('Solicitar activacion QR S3 URL:', `${PHP_BASE_URL}/api/cliente/solicitar-activacion-qr-s3`);
    console.log('Solicitar activacion QR S3 payload:', payload);
    const { response, data } = await getClientRequestActivationS3Response(payload, token);
    console.log('Solicitar activacion QR S3 status:', response.status);
    console.log('Solicitar activacion QR S3 respuesta:', data?.respuesta ?? data?.message ?? data);

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || 'No se pudo enviar la solicitud de activacion por S3.');
    }

    return data;
  }, [getClientRequestActivationS3Response]);

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

  const getClientQrData = useCallback(async (clientId = user?.id_usuario, options = {}) => {
    try {
      const normalizedClientId = Number(clientId ?? 0);
      if (normalizedClientId <= 0) {
        return null;
      }

      const includeInactive = Boolean(options?.includeInactive);

      const qrRows = await getTable({
        tabla: 'qr_cliente',
        where: {
          id_usuario: normalizedClientId,
          visible: 1,
        },
        order: 'id_qr_cliente DESC',
      });

      const latestVisibleQr = qrRows?.[0] ?? null;
      const validQr = qrRows.find((row) => isQrCurrentlyValid(row)) ?? null;
      const resolvedQr = includeInactive ? (latestVisibleQr ?? validQr) : (validQr ?? latestVisibleQr);

      if (!resolvedQr) {
        return null;
      }

      return {
        ...resolvedQr,
        ...normalizeQrStatus(resolvedQr),
      };
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
      saveDepositoCredito,
      setActiveEstablecimiento,
      getSalesByProvider,
      getSalesByClient,
      getConsumptionPayments,
      getClientAvailableBalance,
      getClientQrData,
      getClientQrActivationStatus,
      getCashierDeliverySummary,
      presignClientQrActivation,
      presignCashierDeliveryExpediente,
      requestClientQrActivation,
      requestClientQrActivationS3,
      saveCashierDeliveryExpediente,
      saveCashierDeliveryExpedienteS3,
    }),
    [
      activeEstablecimientoId,
      error,
      getClientAvailableBalance,
      getClientQrActivationStatus,
      getCashierDeliverySummary,
      getConsumptionPayments,
      getSalesByClient,
      getSalesByProvider,
      getTable,
      getClientQrData,
      presignClientQrActivation,
      presignCashierDeliveryExpediente,
      requestClientQrActivation,
      requestClientQrActivationS3,
      saveCashierDeliveryExpediente,
      saveCashierDeliveryExpedienteS3,
      saveDepositoCredito,
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

