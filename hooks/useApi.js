import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl;

export const useApi = () => {
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

  const getTransactionStatus = async (transactionId) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
        method: 'GET',
        headers,
      });

      return await response.json();
    } catch (error) {
      console.error('Error getting transaction status:', error);
      throw error;
    }
  };

  // Crear transacción
  const createTransaction = async (transactionData) => {
    try {
      const headers = await getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/transactions/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify(transactionData),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Error creando transacción');
      }

      return data;
    } catch (error) {
      console.error('❌ API Error - createTransaction:', error);
      throw error;
    }
  };

  return {
    createTransaction,
    getTransactionStatus,
  };
};
