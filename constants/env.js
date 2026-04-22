const normalizeBaseUrl = (value) => (value ? value.replace(/\/+$/, '') : '');

const rawApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_NODE_API_BASE_URL ??
  '';

const rawApiCurpUrl =
  process.env.EXPO_PUBLIC_API_CURP ??
  process.env.EXPO_PUBLIC_NODE_API_CURP ??
  '';

export const ENV = {
  apiBaseUrl: normalizeBaseUrl(rawApiBaseUrl),
  apiCurpUrl: normalizeBaseUrl(rawApiCurpUrl),
  tokenApi: process.env.EXPO_PUBLIC_TOKEN_API ?? '',
  authPasswordMode: process.env.EXPO_PUBLIC_AUTH_PASSWORD_MODE ?? 'plain',
};

