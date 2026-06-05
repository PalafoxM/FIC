const normalizeBaseUrl = (value) => (value ? value.replace(/\/+$/, '') : '');

const buildPhpBaseUrl = (value, fallbackApiBaseUrl) => {
  const normalizedPhpBaseUrl = normalizeBaseUrl(value);
  if (normalizedPhpBaseUrl) {
    return normalizedPhpBaseUrl.endsWith('/index.php')
      ? normalizedPhpBaseUrl
      : `${normalizedPhpBaseUrl}/index.php`;
  }

  const normalizedApiBaseUrl = normalizeBaseUrl(fallbackApiBaseUrl);
  if (!normalizedApiBaseUrl) {
    return '';
  }

  return normalizedApiBaseUrl.endsWith('/api')
    ? `${normalizedApiBaseUrl.slice(0, -4)}/index.php`
    : `${normalizedApiBaseUrl}/index.php`;
};

const rawApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_NODE_API_BASE_URL ??
  '';

const rawPhpBaseUrl =
  process.env.EXPO_PUBLIC_PHP_BASE_URL ??
  process.env.EXPO_PUBLIC_API_PHP_BASE_URL ??
  '';

const rawApiCurpUrl =
  process.env.EXPO_PUBLIC_API_CURP ??
  process.env.EXPO_PUBLIC_NODE_API_CURP ??
  '';

export const ENV = {
  apiBaseUrl: normalizeBaseUrl(rawApiBaseUrl),
  phpBaseUrl: buildPhpBaseUrl(rawPhpBaseUrl, rawApiBaseUrl),
  apiCurpUrl: normalizeBaseUrl(rawApiCurpUrl),
  tokenApi: process.env.EXPO_PUBLIC_TOKEN_API ?? '',
  authPasswordMode: process.env.EXPO_PUBLIC_AUTH_PASSWORD_MODE ?? 'plain',
};

