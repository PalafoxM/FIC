import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl.replace(/\/+$/, '');

const getHeaders = async () => {
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

  try {
    const data = rawResponse ? JSON.parse(rawResponse) : null;

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || fallbackMessage);
    }

    return data;
  } catch (_error) {
    console.error(`${fallbackMessage} raw response:`, rawResponse);
    throw new Error(fallbackMessage);
  }
};

export const useNotifications = () => {
  const sendLocalNotification = async (title, body, data = {}) => {
    console.log('Notificacion local:', { title, body, data });
    return true;
  };

  const sendPaymentRequest = async (_vendorName, _amount, transactionData) => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/transactions/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        codigo_qr:
          transactionData.qrCode ??
          transactionData.codigo_qr ??
          transactionData.clientQrCode ??
          null,
        clientId: transactionData.clientId ?? transactionData.clientUserId ?? null,
        clientUserId: transactionData.clientUserId ?? transactionData.clientId ?? null,
        idEstablecimiento: transactionData.idEstablecimiento,
        amount: Number(transactionData.amount || 0),
        tip: Number(transactionData.tip || 0),
        description: transactionData.description || 'Pago por servicios',
        paymentMethod: transactionData.paymentMethod || 'app',
        ...(transactionData.nip ? { nip: String(transactionData.nip).trim() } : {}),
      }),
    });

    return await parseJsonResponse(response, 'Error enviando solicitud de pago');
  };

  const sendPaymentNotification = async (title, body, paymentData) => {
    try {
      await sendLocalNotification(title, body, paymentData);
      return true;
    } catch (error) {
      console.error('Error enviando notificacion:', error);
      return false;
    }
  };

  return {
    sendPaymentRequest,
    sendPaymentNotification,
    sendLocalNotification,
  };
};

export const sendPaymentRequest = async (vendorName, amount, transactionData) => {
  const notifications = useNotifications();
  return await notifications.sendPaymentRequest(vendorName, amount, transactionData);
};

export const sendPaymentNotification = (title, body, paymentData) => {
  const notifications = useNotifications();
  return notifications.sendPaymentNotification(title, body, paymentData);
};
