import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://172.16.2.118:4000/api';

export const useApi = () => {
  // Obtener token de AsyncStorage en lugar de useAuth
  const getAuthHeaders = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      console.log('🔐 Token obtenido:', token ? 'Sí' : 'No');
      return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      };
    } catch (error) {
      console.error('Error obteniendo token:', error);
      return {
        'Content-Type': 'application/json',
      };
    }
  };

  // En hooks/useApi.js
const getTransactionStatus = async (transactionId) => {
  try {
    const token = await AsyncStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
      console.log('📤 Creando transacción con datos:', transactionData);
      
      const headers = await getAuthHeaders();
      console.log('📨 Headers enviados:', headers);

      const response = await fetch(`${API_BASE_URL}/transactions/create`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(transactionData),
      });

      const data = await response.json();
      console.log('📡 Respuesta del servidor:', data);
      
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