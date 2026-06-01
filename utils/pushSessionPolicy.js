export const LOGGED_OUT_PAYMENT_NOTIFICATION_TYPES = new Set([
  "PAYMENT_APPROVED",
  "PAYMENT_SUCCESS",
  "PAYMENT_COMPLETED",
  "PAYMENT_CAPTURED",
  "PAYMENT_APPLIED",
  "NIP_PAYMENT_APPROVED",
]);

export const LOGGED_OUT_BLOCKED_OPERATIONAL_NOTIFICATION_TYPES = new Set([
  "QR_READY",
  "QR_ACTIVATION_REJECTED",
]);

export const PENDING_LOGGED_OUT_NOTIFICATION_KEY =
  "pendingLoggedOutNotification";

export const normalizeNotificationType = (data = {}) =>
  String(data?.type ?? "")
    .trim()
    .toUpperCase();

export const isLoggedOutPaymentNotification = (data = {}) => {
  const normalizedType = normalizeNotificationType(data);
  const normalizedStatus = String(data?.status ?? data?.paymentStatus ?? "")
    .trim()
    .toUpperCase();

  return (
    LOGGED_OUT_PAYMENT_NOTIFICATION_TYPES.has(normalizedType) ||
    normalizedStatus === "APPROVED"
  );
};

export const isLoggedOutBlockedOperationalNotification = (data = {}) =>
  LOGGED_OUT_BLOCKED_OPERATIONAL_NOTIFICATION_TYPES.has(
    normalizeNotificationType(data),
  );

export const isQrOperationalNotification = isLoggedOutBlockedOperationalNotification;
