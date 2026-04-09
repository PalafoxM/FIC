import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../constants/env';

const API_BASE_URL = ENV.apiBaseUrl;

const formatLegacyTimestamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
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
    } catch (parseError) {
      console.error(`${fallbackMessage} raw response:`, rawResponse);
      throw new Error(`${fallbackMessage} devolvio una respuesta no valida`);
    }

    if (!response.ok || data?.error) {
      throw new Error(data?.respuesta || data?.message || fallbackMessage);
    }

    return data;
  };

  const saveTable = async (payload, fallbackMessage) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/saveTabla`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return await parseJsonResponse(response, fallbackMessage);
  };

  const getTransactionStatus = async (transactionId) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
        method: 'GET',
        headers,
      });

      return await parseJsonResponse(response, 'Error consultando transaccion');
    } catch (error) {
      console.error('Error getting transaction status:', error);
      throw error;
    }
  };

  const createTransaction = async (transactionData) => {
    try {
      const baseAmount = Number(transactionData.amount || 0);
      const tipAmount = Number(transactionData.tip || 0);
      const totalAmount = baseAmount + tipAmount;
      const now = formatLegacyTimestamp();
      const vendorUserId = Number(transactionData.vendorUserId ?? transactionData.vendorId);
      const clientUserId = Number(transactionData.clientUserId ?? transactionData.clientId);
      const establecimientoId = Number(transactionData.idEstablecimiento);

      const pagoData = await saveTable(
        {
          data: {
            id_tipo_pago: 2,
            id_usuario: String(clientUserId),
            id_establecimiento: establecimientoId,
            usu_reg: vendorUserId,
            monto: String(baseAmount),
            propina: String(tipAmount),
            total: String(totalAmount),
            fec_reg: now,
          },
          config: {
            tabla: 'pagos',
            editar: false,
          },
          bitacora: {
            id_user: vendorUserId,
            script: 'FICApp/createPago',
          },
        },
        'Error creando pago'
      );

      const idPago =
        pagoData?.idRegistro ??
        pagoData?.data?.id_pagos ??
        pagoData?.data?.id ??
        pagoData?.id_pagos ??
        null;

      const buildDetallePayload = ({
        idUsuario,
        tipoMovimiento,
        creditos,
        descripcion,
        saldoAnterior,
        saldoNuevo,
        script,
      }) => ({
        data: {
          id_pagos: idPago,
          id_usuario: idUsuario,
          id_establecimiento: establecimientoId,
          tipo_movimiento: tipoMovimiento,
          tipo_origen: 'consumo_qr',
          creditos: creditos.toFixed(2),
          saldo_anterior: saldoAnterior ?? null,
          saldo_nuevo: saldoNuevo ?? null,
          descripcion,
          fec_reg: now,
          usu_reg: vendorUserId,
          visible: 1,
        },
        config: {
          tabla: 'detalle_movimiento',
          editar: false,
        },
        bitacora: {
          id_user: vendorUserId,
          script,
        },
      });

      const detalleRequests = [
        saveTable(
          buildDetallePayload({
            idUsuario: clientUserId,
            tipoMovimiento: 'cargo',
            creditos: baseAmount,
            descripcion: transactionData.description || 'Cargo por consumo QR',
            saldoAnterior: transactionData.clientPreviousBalance,
            saldoNuevo: transactionData.clientNewBalance,
            script: 'FICApp/createDetalleMovimientoCargoMonto',
          }),
          'Error creando movimiento de cargo'
        ),
        saveTable(
          buildDetallePayload({
            idUsuario: vendorUserId,
            tipoMovimiento: 'abono',
            creditos: baseAmount,
            descripcion: transactionData.description || 'Abono por cobro QR',
            saldoAnterior: transactionData.vendorPreviousBalance,
            saldoNuevo: transactionData.vendorNewBalance,
            script: 'FICApp/createDetalleMovimientoAbonoMonto',
          }),
          'Error creando movimiento de abono'
        ),
      ];

      if (tipAmount > 0) {
        detalleRequests.push(
          saveTable(
            buildDetallePayload({
              idUsuario: clientUserId,
              tipoMovimiento: 'cargo',
              creditos: tipAmount,
              descripcion: `Propina - ${transactionData.description || 'Consumo QR'}`,
              saldoAnterior: transactionData.clientPreviousBalance,
              saldoNuevo: transactionData.clientNewBalance,
              script: 'FICApp/createDetalleMovimientoCargoPropina',
            }),
            'Error creando movimiento de cargo por propina'
          ),
          saveTable(
            buildDetallePayload({
              idUsuario: vendorUserId,
              tipoMovimiento: 'abono',
              creditos: tipAmount,
              descripcion: `Propina - ${transactionData.description || 'Cobro QR'}`,
              saldoAnterior: transactionData.vendorPreviousBalance,
              saldoNuevo: transactionData.vendorNewBalance,
              script: 'FICApp/createDetalleMovimientoAbonoPropina',
            }),
            'Error creando movimiento de abono por propina'
          )
        );
      }

      const detalleResults = await Promise.all(detalleRequests);
      const [cargoData, abonoData] = detalleResults;

      return {
        success: true,
        message:
          abonoData?.respuesta ||
          cargoData?.respuesta ||
          pagoData?.respuesta ||
          'Pago registrado correctamente',
        data: {
          id: idPago,
          transaction_id: idPago ? `PAGO-${idPago}` : 'PAGO',
          amount: baseAmount,
          tip: tipAmount,
          total: totalAmount,
          description: transactionData.description || 'Pago por servicios',
          status: 'created',
          supportsStatusPolling: false,
          createdAt: now,
          idDetalleCargo:
            cargoData?.idRegistro ??
            cargoData?.data?.id_detalle_movimiento ??
            cargoData?.id_detalle_movimiento ??
            null,
          idDetalleAbono:
            abonoData?.idRegistro ??
            abonoData?.data?.id_detalle_movimiento ??
            abonoData?.id_detalle_movimiento ??
            null,
        },
      };
    } catch (error) {
      console.error('API Error - createTransaction:', error);
      throw error;
    }
  };

  return {
    createTransaction,
    getTransactionStatus,
  };
};
