import AsyncStorage from '@react-native-async-storage/async-storage';

// Usuarios de prueba
const mockUsers = [
  {
    id: '1',
    email: 'proveedor@test.com',
    password: '123456',
    name: 'Juan Vendedor',
    type: 'vendor',
    saldo: '3000'
  },
  {
    id: '2',
    email: 'cliente@test.com',
    password: '123456',
    name: 'Agustin Palafox',
    type: 'customer',
    saldo: '3000'
  }
];

export const loginUser = async (email, password) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const user = mockUsers.find(u => u.email === email && u.password === password);
      if (user) {
        AsyncStorage.setItem('user', JSON.stringify(user));
        resolve(user);
      } else {
        reject(new Error('Credenciales incorrectas'));
      }
    }, 1000);
  });
};

export const getCurrentUser = async () => {
  try {
    const userJson = await AsyncStorage.getItem('user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

export const logoutUser = async () => {
  try {
    await AsyncStorage.removeItem('user');
  } catch (error) {
    console.error('Error logging out:', error);
  }
};