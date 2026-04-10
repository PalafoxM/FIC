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

  const postJson = async (path, body, fallbackMessage) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return await parseJsonResponse(response, fallbackMessage);
  };

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
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
        method: 'GET',
        headers,
      });

      const data = await parseJsonResponse(response, 'Error consultando transaccion');
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
      const data = await postJson(
        '/transactions/create',
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
      const data = await postJson(
        '/transactions/create',
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
    return await postJson(
      '/transactions/approve',
      { transactionId },
      'Error aprobando pago'
    );
  };

  const rejectPaymentRequest = async (transactionId) => {
    return await postJson(
      '/transactions/reject',
      { transactionId },
      'Error rechazando pago'
    );
  };

  const authorizePaymentWithNip = async (transactionId, nip) => {
    return await postJson(
      '/transactions/authorize-nip',
      {
        transactionId,
        nip: String(nip ?? '').trim(),
      },
      'Error autorizando pago con NIP'
    );
  };

  return {
    createPaymentRequest,
    createTransaction,
    getTransactionStatus,
    approvePaymentRequest,
    rejectPaymentRequest,
    authorizePaymentWithNip,
  };
};
