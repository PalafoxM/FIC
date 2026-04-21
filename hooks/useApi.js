import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl.replace(/\/+$/, '');

const normalizeTransactionRecord = (payload, fallback = {}) => {
  const transaction =
    payload?.transaction ??
    (Array.isArray(payload?.data) ? payload.data[0] : payload?.data) ??
    payload ??
    {};

  return {
    ...transaction,
    id:
      transaction?.id ??
      transaction?.transactionId ??
      transaction?.transaction_id ??
      fallback.id ??
      null,
    transaction_id:
      transaction?.transaction_id ??
      transaction?.transactionId ??
      transaction?.id ??
      fallback.transaction_id ??
      'PENDING',
    amount: Number(transaction?.amount ?? fallback.amount ?? 0),
    tip: Number(transaction?.tip ?? fallback.tip ?? 0),
    total: Number(transaction?.total ?? fallback.total ?? 0),
    status: transaction?.status ?? fallback.status ?? 'pending',
    supportsStatusPolling:
      typeof transaction?.supportsStatusPolling === 'boolean'
        ? transaction.supportsStatusPolling
        : Boolean(fallback.supportsStatusPolling),
  };
};

const normalizeReportRecord = (payload, fallback = {}) => {
  const report =
    payload?.report ??
    (Array.isArray(payload?.data) ? payload.data[0] : payload?.data) ??
    payload ??
    {};

  return {
    ...report,
    id_reporte:
      report?.id_reporte ??
      report?.reportId ??
      report?.id ??
      fallback.id_reporte ??
      null,
    id_pagos:
      report?.id_pagos ??
      report?.paymentId ??
      report?.id_pago ??
      fallback.id_pagos ??
      null,
    id_usuario:
      report?.id_usuario ??
      report?.clientId ??
      fallback.id_usuario ??
      null,
    id_establecimiento:
      report?.id_establecimiento ??
      report?.establishmentId ??
      fallback.id_establecimiento ??
      null,
    tipo_reporte:
      report?.tipo_reporte ??
      report?.reportType ??
      fallback.tipo_reporte ??
      'Sin tipo',
    estatus:
      report?.estatus ??
      report?.status ??
      fallback.estatus ??
      'pendiente',
    monto: Number(report?.monto ?? fallback.monto ?? 0),
    propina: Number(report?.propina ?? fallback.propina ?? 0),
    total: Number(report?.total ?? fallback.total ?? 0),
    fecha_movimiento:
      report?.fecha_movimiento ??
      report?.movementDate ??
      fallback.fecha_movimiento ??
      null,
  };
};

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

    if (typeof atob === 'function') {
      return JSON.parse(atob(paddedBase64));
    }

    return null;
  } catch (_error) {
    return null;
  }
};

const getTokenDebugSummary = (token) => {
  const claims = decodeJwtPayload(token);

  if (!claims) {
    return {
      tokenType: token ? 'opaque-or-unreadable' : 'missing',
      hasToken: Boolean(token),
    };
  }

  return {
    tokenType: 'jwt',
    id_usuario: claims?.id_usuario ?? claims?.id ?? claims?.userId ?? claims?.sub ?? null,
    id_perfil: claims?.id_perfil ?? claims?.perfil ?? claims?.roleId ?? null,
    exp: claims?.exp ?? null,
  };
};

export const useApi = () => {
  const getAuthHeaders = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      return {
        'Content-Type': 'application/json',
        ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
        ...(token && { Authorization: `Bearer ${token}` }),
      };
    } catch (error) {
      console.error('Error obteniendo token:', error);
      return {
        'Content-Type': 'application/json',
        ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
      };
    }
  };

  const parseJsonResponse = async (response, actionLabel) => {
    const rawResponse = await response.text();
    let data = null;
    const contentType = response.headers.get('content-type') || 'unknown';

    console.log(`${actionLabel} status:`, response.status);
    console.log(`${actionLabel} content-type:`, contentType);

    try {
      data = rawResponse ? JSON.parse(rawResponse) : null;
    } catch (_parseError) {
      console.error(`${actionLabel} raw response:`, rawResponse);
      throw new Error(`${actionLabel} devolvio una respuesta no valida`);
    }

    if (!response.ok || data?.error) {
      const error = new Error(data?.respuesta || data?.message || actionLabel);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  };

  const getApiJsonResponse = async ({
    path,
    method = 'GET',
    body,
    fallbackMessage: actionLabel,
  }) => {
    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}${path}`;

    console.log(`${actionLabel} URL:`, url);

    const response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    return await parseJsonResponse(response, actionLabel);
  };

  const postJson = async (path, body, fallbackMessage) =>
    await getApiJsonResponse({
      path,
      method: 'POST',
      body,
      fallbackMessage,
    });

  const getJson = async (path, fallbackMessage) => {
    return await getApiJsonResponse({
      path,
      method: 'GET',
      fallbackMessage,
    });
  };

  const getTransactionsResponse = async (path, method = 'GET', body, fallbackMessage) =>
    await getApiJsonResponse({
      path: `/transactions${path}`,
      method,
      body,
      fallbackMessage,
    });

  const getReportsResponse = async (path, method = 'GET', body, fallbackMessage) =>
    await getApiJsonResponse({
      path: `/reportes${path}`,
      method,
      body,
      fallbackMessage,
    });

  const buildRequestPayload = (transactionData = {}) => ({
    codigo_qr:
      transactionData.qrCode ??
      transactionData.codigo_qr ??
      transactionData.clientQrCode ??
      null,
    clientId: transactionData.clientUserId ?? transactionData.clientId ?? null,
    clientUserId: transactionData.clientUserId ?? transactionData.clientId ?? null,
    vendorId: transactionData.vendorUserId ?? transactionData.vendorId ?? null,
    vendorUserId: transactionData.vendorUserId ?? transactionData.vendorId ?? null,
    idEstablecimiento: transactionData.idEstablecimiento,
    amount: Number(transactionData.amount || 0),
    tip: Number(transactionData.tip || 0),
    description: transactionData.description || 'Pago por servicios',
    paymentMethod: transactionData.paymentMethod || 'app',
    metodo_autorizacion: transactionData.paymentMethod || 'app',
    ...(transactionData.nip ? { nip: String(transactionData.nip).trim() } : {}),
  });

  const getTransactionStatus = async (transactionId) => {
    try {
      const data = await getTransactionsResponse(
        `/${transactionId}/status`,
        'GET',
        undefined,
        'Consultando transaccion'
      );
      const transaction = normalizeTransactionRecord(data?.data, {
        id: transactionId,
        status: data?.data?.status ?? 'pending',
      });

      return {
        success: true,
        data: {
          status: transaction.status,
          transaction,
        },
      };
    } catch (error) {
      console.error('Error getting transaction status:', error);
      throw error;
    }
  };

  const createPaymentRequest = async (transactionData) => {
    try {
      const payload = buildRequestPayload({
        ...transactionData,
        paymentMethod: 'app',
      });
      const data = await getTransactionsResponse(
        '/create',
        'POST',
        payload,
        'Creando solicitud de pago'
      );

      const transaction = normalizeTransactionRecord(data, {
        amount: payload.amount,
        tip: payload.tip,
        total: payload.amount + payload.tip,
        status: 'pending',
        supportsStatusPolling: true,
      });

      return {
        success: true,
        message: data?.message || data?.respuesta || 'Solicitud enviada correctamente',
        data: transaction,
      };
    } catch (error) {
      console.error('API Error - createPaymentRequest:', error);
      throw error;
    }
  };

  const createTransaction = async (transactionData) => {
    try {
      const payload = buildRequestPayload({
        ...transactionData,
        paymentMethod: 'nip',
      });
      const data = await getTransactionsResponse(
        '/create',
        'POST',
        payload,
        'Creando cobro con NIP'
      );

      const transaction = normalizeTransactionRecord(data, {
        amount: payload.amount,
        tip: payload.tip,
        total: payload.amount + payload.tip,
        status: payload.nip ? 'approved' : 'pending',
        supportsStatusPolling: false,
      });

      return {
        success: true,
        message: data?.message || data?.respuesta || 'Pago registrado correctamente',
        data: transaction,
      };
    } catch (error) {
      console.error('API Error - createTransaction:', error);
      throw error;
    }
  };

  const approvePaymentRequest = async (transactionId) => {
    return await getTransactionsResponse(
      '/approve',
      'POST',
      { transactionId },
      'Aprobando pago'
    );
  };

  const rejectPaymentRequest = async (transactionId) => {
    return await getTransactionsResponse(
      '/reject',
      'POST',
      { transactionId },
      'Rechazando pago'
    );
  };

  const authorizePaymentWithNip = async (transactionId, nip) => {
    return await getTransactionsResponse(
      '/authorize-nip',
      'POST',
      {
        transactionId,
        nip: String(nip ?? '').trim(),
      },
      'Autorizando pago con NIP'
    );
  };

  const getUserTransactions = async (scope = 'client') => {
    try {
      const data = await getTransactionsResponse(
        `?scope=${encodeURIComponent(scope)}`,
        'GET',
        undefined,
        'Consultando transacciones'
      );

      const rows = Array.isArray(data?.data) ? data.data : [];

      return {
        success: true,
        data: rows.map((row, index) =>
          normalizeTransactionRecord(row, {
            id: row?.id ?? index,
            transaction_id: row?.transaction_id ?? row?.id ?? `TX-${index}`,
          })
        ),
      };
    } catch (error) {
      console.error('Error getting user transactions:', error);
      throw error;
    }
  };

  const approveTransaction = async (transactionId) => {
    return await approvePaymentRequest(transactionId);
  };

  const rejectTransaction = async (transactionId) => {
    return await rejectPaymentRequest(transactionId);
  };

  const createPaymentReport = async (reportData) => {
    let payload = null;
    let authDebug = null;
    try {
      const token = await AsyncStorage.getItem('token');
      authDebug = getTokenDebugSummary(token);
      payload = {
        id_pagos: Number(reportData?.id_pagos ?? 0),
        id_usuario: Number(reportData?.id_usuario ?? 0),
        id_establecimiento:
          reportData?.id_establecimiento !== undefined && reportData?.id_establecimiento !== null
            ? Number(reportData.id_establecimiento)
            : null,
        tipo_reporte: String(reportData?.tipo_reporte ?? '').trim(),
        descripcion: String(reportData?.descripcion ?? '').trim(),
        monto: Number(reportData?.monto ?? 0),
        propina: Number(reportData?.propina ?? 0),
        total: Number(reportData?.total ?? 0),
        fecha_movimiento: reportData?.fecha_movimiento ?? null,
      };

      console.log('Creando reporte de pago payload normalizado:', payload);
      console.log('Creando reporte de pago auth debug:', authDebug);

      const data = await getReportsResponse(
        '/create',
        'POST',
        payload,
        'Creando reporte de pago'
      );

      return {
        success: true,
        message: data?.message || data?.respuesta || 'Reporte creado correctamente',
        data: normalizeReportRecord(data, payload),
      };
    } catch (error) {
      console.error('API Error - createPaymentReport:', {
        message: error?.message,
        status: error?.status,
        data: error?.data,
        payload,
        authDebug,
      });
      if (String(error?.message || '').includes('Creando reporte de pago devolvio una respuesta no valida')) {
        throw new Error(
          'El backend de reportes no respondio con JSON valido. Revisa la ruta POST /api/reportes/create.'
        );
      }
      throw error;
    }
  };

  const getPaymentReports = async (filters = {}) => {
    try {
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          params.set(key, String(value));
        }
      });

      const data = await getReportsResponse(
        params.size > 0 ? `?${params.toString()}` : '',
        'GET',
        undefined,
        'Consultando reportes'
      );

      const rows = Array.isArray(data?.data) ? data.data : [];

      return {
        success: true,
        data: rows.map((row, index) =>
          normalizeReportRecord(row, {
            id_reporte: row?.id_reporte ?? index,
          })
        ),
      };
    } catch (error) {
      console.error('API Error - getPaymentReports:', error);
      if (String(error?.message || '').includes('Consultando reportes devolvio una respuesta no valida')) {
        throw new Error(
          'El backend de reportes no respondio con JSON valido. Revisa la ruta GET /api/reportes.'
        );
      }
      throw error;
    }
  };

  const updatePaymentReportStatus = async (idReporte, estatus) => {
    try {
      const data = await getReportsResponse(
        '/update-status',
        'POST',
        {
          id_reporte: Number(idReporte ?? 0),
          estatus: String(estatus ?? '').trim(),
        },
        'Actualizando estatus de reporte'
      );

      return {
        success: true,
        message: data?.message || data?.respuesta || 'Reporte actualizado correctamente',
        data: normalizeReportRecord(data?.data ?? data, {
          id_reporte: Number(idReporte ?? 0),
          estatus,
        }),
      };
    } catch (error) {
      console.error('API Error - updatePaymentReportStatus:', error);
      if (String(error?.message || '').includes('Actualizando estatus de reporte devolvio una respuesta no valida')) {
        throw new Error(
          'El backend de reportes no respondio con JSON valido. Revisa la ruta POST /api/reportes/update-status.'
        );
      }
      throw error;
    }
  };

  return {
    createPaymentRequest,
    createTransaction,
    createPaymentReport,
    getTransactionStatus,
    getPaymentReports,
    getUserTransactions,
    approveTransaction,
    rejectTransaction,
    approvePaymentRequest,
    rejectPaymentRequest,
    authorizePaymentWithNip,
    updatePaymentReportStatus,
  };
};
