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

  const parseJsonResponse = async (response, fallbackMessage) => {
    const rawResponse = await response.text();
    let data = null;
    const contentType = response.headers.get('content-type') || 'unknown';

    console.log(`${fallbackMessage} status:`, response.status);
    console.log(`${fallbackMessage} content-type:`, contentType);

    try {
      data = rawResponse ? JSON.parse(rawResponse) : null;
    } catch (_parseError) {
      console.error(`${fallbackMessage} raw response:`, rawResponse);
      throw new Error(`${fallbackMessage} devolvio una respuesta no valida`);
    }

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || fallbackMessage);
    }

    return data;
  };

  const getApiJsonResponse = async ({
    path,
    method = 'GET',
    body,
    fallbackMessage,
  }) => {
    const headers = await getAuthHeaders();
    const url = `${API_BASE_URL}${path}`;

    console.log(`${fallbackMessage} URL:`, url);

    const response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    return await parseJsonResponse(response, fallbackMessage);
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
        'Error consultando transaccion'
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
        'Error creando solicitud de pago'
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
        'Error creando cobro con NIP'
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
      'Error aprobando pago'
    );
  };

  const rejectPaymentRequest = async (transactionId) => {
    return await getTransactionsResponse(
      '/reject',
      'POST',
      { transactionId },
      'Error rechazando pago'
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
      'Error autorizando pago con NIP'
    );
  };

  const getUserTransactions = async (scope = 'client') => {
    try {
      const data = await getTransactionsResponse(
        `?scope=${encodeURIComponent(scope)}`,
        'GET',
        undefined,
        'Error consultando transacciones'
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

  return {
    createPaymentRequest,
    createTransaction,
    getTransactionStatus,
    getUserTransactions,
    approveTransaction,
    rejectTransaction,
    approvePaymentRequest,
    rejectPaymentRequest,
    authorizePaymentWithNip,
  };
};
