export const ROLE_IDS = {
  ADMIN: 1,
  PROVIDER: 2,
  CLIENT: 3,
  MANAGER: 4,
  BUSINESS_MANAGER: 5,
};

const ROLE_CONFIG = {
  [ROLE_IDS.ADMIN]: {
    label: 'Administrador del sistema (TI)',
    homeTitle: 'Centro de administracion',
    homeSubtitle: 'Acceso completo a configuracion, supervision y consulta del sistema.',
    permissions: {
      dashboard: true,
      manageUsers: true,
      manageEstablishments: true,
      reports: true,
      notifications: true,
      scanner: false,
      salesHistory: false,
      clientQr: false,
      payHistory: false,
    },
  },
  [ROLE_IDS.PROVIDER]: {
    label: 'Proveedor (comerciante)',
    homeTitle: 'Centro de cobro',
    homeSubtitle: 'Gestiona cobros, consulta ventas y atiende solicitudes operativas.',
    permissions: {
      dashboard: false,
      manageUsers: false,
      manageEstablishments: false,
      reports: false,
      notifications: true,
      scanner: true,
      salesHistory: true,
      clientQr: false,
      payHistory: false,
    },
  },
  [ROLE_IDS.BUSINESS_MANAGER]: {
    label: 'Gerente de negocio',
    homeTitle: 'Centro de cobro',
    homeSubtitle: 'Gestiona cobros, consulta ventas y atiende solicitudes operativas.',
    permissions: {
      dashboard: false,
      manageUsers: false,
      manageEstablishments: false,
      reports: false,
      notifications: true,
      scanner: true,
      salesHistory: true,
      clientQr: false,
      payHistory: false,
    },
  },
  [ROLE_IDS.CLIENT]: {
    label: 'Cliente (consumidor)',
    homeTitle: 'Centro de consumo',
    homeSubtitle: 'Consulta tu QR de pago, tus consumos y las solicitudes pendientes.',
    permissions: {
      dashboard: false,
      manageUsers: false,
      manageEstablishments: false,
      reports: false,
      notifications: true,
      scanner: false,
      salesHistory: false,
      clientQr: true,
      payHistory: true,
    },
  },
  [ROLE_IDS.MANAGER]: {
    label: 'Personal administrativo SECTURI (gestor)',
    homeTitle: 'Centro de gestion',
    homeSubtitle: 'Consulta informacion operativa y supervisa la ejecucion administrativa.',
    permissions: {
      dashboard: true,
      manageUsers: true,
      manageEstablishments: true,
      reports: true,
      notifications: true,
      scanner: false,
      salesHistory: false,
      clientQr: false,
      payHistory: false,
    },
  },
};

const DEFAULT_ROLE = {
  label: 'Perfil sin clasificar',
  homeTitle: 'Centro de acceso',
  homeSubtitle: 'Tu perfil aun no tiene una configuracion de permisos definida.',
  permissions: {
    dashboard: false,
    manageUsers: false,
    manageEstablishments: false,
    reports: false,
    notifications: false,
    scanner: false,
    salesHistory: false,
    clientQr: false,
    payHistory: false,
  },
};

export const getRoleConfig = (idPerfil) => ROLE_CONFIG[idPerfil] ?? DEFAULT_ROLE;

export const getRoleLabel = (idPerfil) => getRoleConfig(idPerfil).label;

export const hasPermission = (idPerfil, permission) =>
  Boolean(getRoleConfig(idPerfil).permissions?.[permission]);

