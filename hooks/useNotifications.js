import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl;

export const useNotifications = () => {
  const getAuthHeaders = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      return {
        'Content-Type': 'application/json',
        ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
        ...(token && { 'Authorization': `Bearer ${token}` }),
      };
    } catch (error) {
      console.error('Error obteniendo token:', error);
      return {
        'Content-Type': 'application/json',
        ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
      };
    }
  };

  // Enviar notificación local (simulada)
  const sendLocalNotification = async (title, body, data = {}) => {
    console.log('🔔 [NOTIFICACIÓN LOCAL]:', { title, body, data });
    return true;
  };

  // Enviar solicitud de pago al backend
  const sendPaymentRequest = async (vendorName, amount, transactionData) => {
    try {
      const headers = await getAuthHeaders();
      
      const response = await fetch(`${API_BASE_URL}/transactions/create`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          clientId: transactionData.clientId,
          amount: transactionData.amount,
          tip: transactionData.tip,
          description: transactionData.description,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Error enviando solicitud de pago');
      }

      return data;

    } catch (error) {
      console.error('❌ Error enviando solicitud de pago:', error);
      throw error;
    }
  };

  // Notificar aprobación de pago
  const sendPaymentNotification = async (title, body, paymentData) => {
    try {
      console.log('✅ Enviando notificación de pago:', { title, body });
      await sendLocalNotification(title, body, paymentData);
      return true;
    } catch (error) {
      console.error('Error enviando notificación:', error);
      return false;
    }
  };

  return {
    sendPaymentRequest,
    sendPaymentNotification,
    sendLocalNotification,
  };
};

// Exportaciones individuales para compatibilidad
export const sendPaymentRequest = async (vendorName, amount, transactionData) => {
  try {
    const token = await AsyncStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(ENV.tokenApi && { 'X-API-Token': ENV.tokenApi }),
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };

    const response = await fetch(`${API_BASE_URL}/transactions/create`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        clientId: transactionData.clientId,
        amount: transactionData.amount,
        tip: transactionData.tip,
        description: transactionData.description,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error en sendPaymentRequest legacy:', error);
    return { success: false, message: error.message };
  }
};

export const sendPaymentNotification = (title, body, paymentData) => {
  console.log('🔔 [LEGACY] sendPaymentNotification llamado:', { title, body });
  return Promise.resolve(true);
};
