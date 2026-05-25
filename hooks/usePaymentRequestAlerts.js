import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert, AppState, DeviceEventEmitter } from "react-native";
import { ENV } from "../constants/env";
import { useApi } from "./useApi";
import { useAuth } from "./useAuth";

// =========================== UTILIDADES ===========================

const parseNotificationData = (notification) => {
  if (!notification) return {};
  if (typeof notification.data === "string") {
    try {
      return JSON.parse(notification.data);
    } catch {
      return {};
    }
  }
  return notification.data || {};
};

const isPaymentApprovedLike = (
  notification,
  notificationData = parseNotificationData(notification),
) => {
  const normalizedType = String(
    notificationData?.type ?? notification?.type ?? "",
  )
    .trim()
    .toUpperCase();
  const normalizedStatus = String(
    notificationData?.status ??
      notificationData?.paymentStatus ??
      notificationData?.resolvedStatus ??
      "",
  )
    .trim()
    .toUpperCase();
  const title = String(notification?.title ?? "")
    .trim()
    .toLowerCase();
  const body = String(
    notification?.body ??
      notificationData?.body ??
      notificationData?.message ??
      "",
  )
    .trim()
    .toLowerCase();

  if (normalizedType === "PAYMENT_APPROVED") return true;
  if (
    [
      "PAYMENT_SUCCESS",
      "PAYMENT_COMPLETED",
      "NIP_PAYMENT_APPROVED",
      "PAYMENT_CAPTURED",
      "PAYMENT_APPLIED",
    ].includes(normalizedType)
  )
    return true;
  if (normalizedStatus === "APPROVED") return true;
  return (
    (title.includes("pago") ||
      title.includes("cobro") ||
      body.includes("pago") ||
      body.includes("cobro")) &&
    (title.includes("aprob") ||
      title.includes("complet") ||
      title.includes("aplicad") ||
      body.includes("aprob") ||
      body.includes("complet") ||
      body.includes("aplicad"))
  );
};

const buildNotificationIdentity = (notification, currentUserId = null) => {
  const notificationData = parseNotificationData(notification);
  const normalizedType = String(
    notificationData?.type ?? notification?.type ?? "",
  )
    .trim()
    .toUpperCase();
  const normalizedUserId = String(
    currentUserId ??
      notificationData?.id_usuario ??
      notification?.user_id ??
      "",
  ).trim();

  if (normalizedType === "QR_READY") {
    const folio = String(
      notificationData?.folio ?? notificationData?.folio_entrega ?? "",
    ).trim();
    return `passive:${normalizedType}:${normalizedUserId}:${folio || "self"}`;
  }
  if (normalizedType === "QR_ACTIVATION_REJECTED") {
    const folio = String(
      notificationData?.folio ?? notificationData?.folio_entrega ?? "",
    ).trim();
    const motivo = String(
      notificationData?.motivo_rechazo ??
        notificationData?.motivo ??
        notification?.body ??
        "",
    ).trim();
    return `passive:${normalizedType}:${normalizedUserId}:${folio || "self"}:${motivo || "no-reason"}`;
  }
  if (isPaymentApprovedLike(notification, notificationData)) {
    const transactionId = String(
      notificationData?.transactionId ?? notificationData?.transaction_id ?? "",
    ).trim();
    const amount = String(
      notificationData?.total ?? notificationData?.amount ?? "",
    ).trim();
    return `passive:${normalizedType}:${normalizedUserId}:${transactionId || "no-transaction"}:${amount || "no-amount"}`;
  }

  const explicitId =
    notification?.id ??
    notification?.id_notificacion ??
    notification?.notification_id ??
    notificationData?.notificationId ??
    notificationData?.id ??
    null;
  if (
    explicitId !== null &&
    explicitId !== undefined &&
    String(explicitId).trim() !== ""
  ) {
    return `id:${String(explicitId).trim()}`;
  }

  const fingerprint = [
    notificationData?.type ?? notification?.type ?? "notification",
    notificationData?.transactionId ?? "",
    notificationData?.id_usuario ?? notification?.user_id ?? "",
    notification?.title ?? "",
    notification?.body ?? "",
    notification?.created_at ?? notificationData?.created_at ?? "",
  ]
    .map((v) => String(v ?? "").trim())
    .join("|");
  return `fp:${fingerprint}`;
};

// =========================== HOOK PRINCIPAL ===========================

export const usePaymentRequestAlerts = () => {
  const { user } = useAuth();
  const { approvePaymentRequest, getTransactionStatus, rejectPaymentRequest } =
    useApi();
  const router = useRouter();
  const shownNotificationIdsRef = useRef(new Set());
  const alertOpenRef = useRef(false);
  const checkingPromiseRef = useRef(null);
  const hasRunInitialCheckRef = useRef(false);
  const prevUserIdRef = useRef(user?.id_usuario);

  // =========================== FUNCIONES INTERNAS ===========================

  const persistShownNotificationIds = async (persistedNotificationIdsKey) => {
    try {
      const ids = Array.from(shownNotificationIdsRef.current).slice(-100);
      await AsyncStorage.setItem(
        persistedNotificationIdsKey,
        JSON.stringify(ids),
      );
    } catch (error) {
      console.error("Error persisting shown notification ids:", error);
    }
  };

  const markNotificationAsShown = async (
    notificationIdentity,
    persistedNotificationIdsKey,
    persist = false,
  ) => {
    if (!notificationIdentity) return;
    shownNotificationIdsRef.current.add(notificationIdentity);
    if (persist) await persistShownNotificationIds(persistedNotificationIdsKey);
  };

  const showPaymentDecisionAlert = (notificationData, onApprove, onReject) => {
    const amount = Number(
      notificationData?.total ?? notificationData?.amount ?? 0,
    );
    const vendorName = notificationData?.vendorName || "Proveedor";
    alertOpenRef.current = true;
    Alert.alert(
      "Solicitud de pago",
      `Monto: $${amount.toFixed(2)}\nDe: ${vendorName}`,
      [
        {
          text: "Aprobar",
          onPress: () => {
            alertOpenRef.current = false;
            onApprove();
          },
        },
        {
          text: "Rechazar",
          style: "destructive",
          onPress: () => {
            alertOpenRef.current = false;
            onReject();
          },
        },
      ],
      {
        cancelable: false,
        onDismiss: () => {
          alertOpenRef.current = false;
        },
      },
    );
  };

  const showManagerNotificationAlert = (notification, notificationData) => {
    const title = notification?.title || "Notificacion";
    const body =
      notification?.body ||
      notificationData?.body ||
      notificationData?.message ||
      "Tienes una nueva notificacion operativa.";
    alertOpenRef.current = true;
    Alert.alert(
      title,
      body,
      [
        {
          text: "Despues",
          style: "cancel",
          onPress: () => {
            alertOpenRef.current = false;
          },
        },
        {
          text: "Ver notificaciones",
          onPress: () => {
            alertOpenRef.current = false;
            router.push("/alerts");
          },
        },
      ],
      {
        cancelable: false,
        onDismiss: () => {
          alertOpenRef.current = false;
        },
      },
    );
  };

  const showPaymentApprovedAlert = (
    notification,
    notificationData,
    navigateToBalance,
  ) => {
    const amount = Number(
      notificationData?.total ?? notificationData?.amount ?? 0,
    );
    const title = notification?.title || "Pago aplicado";
    const body =
      notification?.body ||
      notificationData?.body ||
      notificationData?.message ||
      (amount > 0
        ? `Se aplico un cobro por $${amount.toFixed(2)}. Tu saldo disponible ya fue actualizado.`
        : "Se aplico un cobro correctamente.");
    alertOpenRef.current = true;
    Alert.alert(
      title,
      body,
      [
        {
          text: "Despues",
          style: "cancel",
          onPress: () => {
            alertOpenRef.current = false;
          },
        },
        {
          text: "Ver saldo",
          onPress: () => {
            alertOpenRef.current = false;
            navigateToBalance();
          },
        },
      ],
      {
        cancelable: false,
        onDismiss: () => {
          alertOpenRef.current = false;
        },
      },
    );
  };

  // Función que revisa notificaciones y muestra alertas (si hay alguna pendiente)
  const checkPendingPaymentRequests = async () => {
    if (checkingPromiseRef.current) return checkingPromiseRef.current;
    if (alertOpenRef.current) return;

    checkingPromiseRef.current = (async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        if (!token) return;

        const url = `${ENV.apiBaseUrl}/notifications/my-notifications`;
        const response = await fetch(url, {
          headers: {
            ...(ENV.tokenApi && { "X-API-Token": ENV.tokenApi }),
            Authorization: `Bearer ${token}`,
          },
        });
        const raw = await response.text();
        const data = raw ? JSON.parse(raw) : null;
        if (!response.ok || !data?.success) return;

        const rows = Array.isArray(data?.data) ? data.data : [];
        const sorted = [...rows].sort(
          (a, b) => new Date(b?.created_at ?? 0) - new Date(a?.created_at ?? 0),
        );

        const usesPaymentDecisionAlert = true;
        const persistedKey = `seenPassiveNotificationIds:${user?.id_usuario ?? "anonymous"}`;

        for (const notif of sorted) {
          const identity = buildNotificationIdentity(notif, user?.id_usuario);
          if (identity && shownNotificationIdsRef.current.has(identity))
            continue;

          const notifData = parseNotificationData(notif);
          const transactionId = notifData?.transactionId;

          // Solicitud de pago pendiente
          if (notifData?.type === "PAYMENT_REQUEST" && transactionId) {
            try {
              const statusRes = await getTransactionStatus(transactionId);
              const resolvedStatus = statusRes?.data?.status ?? "pending";
              await markNotificationAsShown(identity, persistedKey, false);
              if (resolvedStatus !== "pending") continue;

              const approve = async () => {
                try {
                  const res = await approvePaymentRequest(transactionId);
                  if (res?.success) {
                    DeviceEventEmitter.emit("refreshClientBalanceNow");
                    Alert.alert(
                      "Operación exitosa",
                      usesPaymentDecisionAlert
                        ? "El pago fue aprobado. Te llevaremos al perfil para revisar tu monto disponible."
                        : "El pago fue aprobado. Volveras a Inicio para ver tu saldo actualizado.",
                    );
                    setTimeout(() => {
                      DeviceEventEmitter.emit("closeClientQrModal");
                      router.replace(
                        usesPaymentDecisionAlert ? "/profile" : "/(tabs)",
                      );
                    }, 1200);
                  } else {
                    Alert.alert(
                      "Atención",
                      res?.respuesta || "No se pudo aprobar el pago.",
                    );
                  }
                } catch (err) {
                  Alert.alert(
                    "Atención",
                    err.message || "No se pudo aprobar el pago.",
                  );
                }
              };
              const reject = async () => {
                try {
                  const res = await rejectPaymentRequest(transactionId);
                  if (res?.success)
                    Alert.alert("Atención", "La solicitud fue rechazada.");
                  else
                    Alert.alert(
                      "Atención",
                      res?.respuesta || "No se pudo rechazar el pago.",
                    );
                } catch (err) {
                  Alert.alert(
                    "Atención",
                    err.message || "No se pudo rechazar el pago.",
                  );
                }
              };
              showPaymentDecisionAlert(notifData, approve, reject);
              return; // Solo mostramos la primera alerta pendiente
            } catch {
              await markNotificationAsShown(identity, persistedKey, false);
            }
            continue;
          }

          // Pago aprobado
          if (
            usesPaymentDecisionAlert &&
            isPaymentApprovedLike(notif, notifData)
          ) {
            await markNotificationAsShown(identity, persistedKey, true);
            const navigateToBalance = () => {
              DeviceEventEmitter.emit("closeClientQrModal");
              DeviceEventEmitter.emit("refreshClientBalanceNow");
              router.replace(
                usesPaymentDecisionAlert && !isClient ? "/profile" : "/(tabs)",
              );
            };
            showPaymentApprovedAlert(notif, notifData, navigateToBalance);
            return;
          }

          // QR listo o rechazado
          if (
            usesPaymentDecisionAlert &&
            (notifData?.type === "QR_READY" ||
              notifData?.type === "QR_ACTIVATION_REJECTED")
          ) {
            await markNotificationAsShown(identity, persistedKey, true);
            showManagerNotificationAlert(notif, notifData);
            return;
          }
        }
      } catch (error) {
        console.error("Error checking payment requests:", error);
      } finally {
        checkingPromiseRef.current = null;
      }
    })();

    return checkingPromiseRef.current;
  };

  // =========================== EFECTOS ===========================

  useEffect(() => {
    hasRunInitialCheckRef.current = false;
    shownNotificationIdsRef.current.clear();

    if (user?.id_usuario) {
      checkPendingPaymentRequests();
    }
  }, [user?.id_usuario]);

  useEffect(() => {
    if (!user?.id_usuario) return;

    if (prevUserIdRef.current !== user?.id_usuario) {
      prevUserIdRef.current = user?.id_usuario;
      hasRunInitialCheckRef.current = false;
      shownNotificationIdsRef.current.clear();
    }

    let isMounted = true;
    const persistedKey = `seenPassiveNotificationIds:${user?.id_usuario}`;

    // Cargar IDs ya mostrados desde almacenamiento
    const loadPersistedIds = async () => {
      try {
        const raw = await AsyncStorage.getItem(persistedKey);
        const ids = raw ? JSON.parse(raw) : [];
        shownNotificationIdsRef.current = new Set(
          Array.isArray(ids) ? ids : [],
        );
      } catch {
        shownNotificationIdsRef.current = new Set();
      }
    };
    loadPersistedIds();

    // Listener para cuando la app vuelve a primer plano (recarga manual o reapertura)
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active" && isMounted) {
          checkPendingPaymentRequests();
        }
      },
    );

    // Ejecutar solo una vez al montar (al iniciar sesión o recargar la app)
    if (!hasRunInitialCheckRef.current) {
      hasRunInitialCheckRef.current = true;
      checkPendingPaymentRequests();
    }

    // Listener de notificaciones push entrantes (cuando llega una nueva notificación)
    const pushSubscription = Notifications.addNotificationReceivedListener(
      () => {
        if (isMounted) checkPendingPaymentRequests();
      },
    );

    return () => {
      isMounted = false;
      pushSubscription.remove();
      appStateSubscription.remove();
    };
  }, [
    approvePaymentRequest,
    getTransactionStatus,
    rejectPaymentRequest,
    router,
    user?.id_usuario,
  ]);
};
