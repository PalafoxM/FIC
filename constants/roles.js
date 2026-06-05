export const ROLE_IDS = {
  ADMIN: 1,
  PROVIDER: 2,
  CLIENT: 3,
  MANAGER: 4,
  BUSINESS_MANAGER: 5,
  CASHIER: 6,
  RECEPTION: 7,
  SECUL: 8,
  FIC: 9,
  UG: 10,
};

export const CONSUMER_PROFILE_IDS = [
  ROLE_IDS.CLIENT,
  ROLE_IDS.SECUL,
  ROLE_IDS.FIC,
  ROLE_IDS.UG,
];

export const QR_WALLET_PROFILE_IDS = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.CLIENT,
  ROLE_IDS.MANAGER,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SECUL,
  ROLE_IDS.FIC,
  ROLE_IDS.UG,
];

export const INSTITUTIONAL_PORTAL_PROFILE_IDS = [
  ROLE_IDS.SECUL,
  ROLE_IDS.FIC,
  ROLE_IDS.UG,
];

export const INSTITUTIONAL_PROFILE_ESTABLISHMENTS = {
  [ROLE_IDS.SECUL]: {
    id_establecimiento: 89,
    id_tipo: 5,
    id_partida: 1,
    dsc_establecimiento: 'SECUL',
  },
  [ROLE_IDS.FIC]: {
    id_establecimiento: 90,
    id_tipo: 6,
    id_partida: null,
    dsc_establecimiento: 'FIC',
  },
  [ROLE_IDS.UG]: {
    id_establecimiento: 91,
    id_tipo: 7,
    id_partida: null,
    dsc_establecimiento: 'UG',
  },
};

const ROLE_CONFIG = {
  [ROLE_IDS.ADMIN]: {
    label: 'Administrador del sistema (TI)',
    homeTitle: 'Centro de administración',
    homeSubtitle: 'Acceso completo a configuración, supervisión y consulta del sistema.',
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
  [ROLE_IDS.SECUL]: {
    label: 'SECUL',
    homeTitle: 'Centro de consumo',
    homeSubtitle: 'Consulta tu QR de pago, saldo, vigencia y beneficios institucionales.',
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
      cashierProcess: true,
    },
  },
  [ROLE_IDS.FIC]: {
    label: 'FIC',
    homeTitle: 'Centro de consumo',
    homeSubtitle: 'Consulta tu QR de pago, saldo, vigencia y beneficios institucionales.',
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
      cashierProcess: true,
    },
  },
  [ROLE_IDS.UG]: {
    label: 'UG',
    homeTitle: 'Centro de consumo',
    homeSubtitle: 'Consulta tu QR de pago, saldo, vigencia y beneficios institucionales.',
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
      cashierProcess: true,
    },
  },
  [ROLE_IDS.MANAGER]: {
    label: 'Personal administrativo SECTURI (gestor)',
    homeTitle: 'Centro de gestion',
    homeSubtitle: 'Consulta información operativa y supervisa la ejecución administrativa.',
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
      cashierProcess: false,
    },
  },
  [ROLE_IDS.CASHIER]: {
    label: 'Cajero',
    homeTitle: 'Centro de entrega',
    homeSubtitle: 'Captura identificaciones, valida folios y prepara la entrega del QR al interesado.',
    permissions: {
      dashboard: false,
      manageUsers: false,
      manageEstablishments: false,
      reports: false,
      notifications: true,
      scanner: false,
      salesHistory: false,
      clientQr: false,
      payHistory: true,
      cashierProcess: true,
    },
  },
  [ROLE_IDS.RECEPTION]: {
    label: 'Recepcion',
    homeTitle: 'Operación hotelera',
    homeSubtitle: 'Escanea QR de huéspedes, consulta órdenes de hospedaje y registra check in.',
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
      cashierProcess: false,
      hotelReception: true,
    },
  },
};

const DEFAULT_ROLE = {
  label: 'Perfil sin clasificar',
  homeTitle: 'Centro de acceso',
  homeSubtitle: 'Tu perfil aún no tiene una configuración de permisos definida.',
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
    cashierProcess: false,
    hotelReception: false,
  },
};

export const getRoleConfig = (idPerfil) => ROLE_CONFIG[idPerfil] ?? DEFAULT_ROLE;

export const getRoleLabel = (idPerfil) => getRoleConfig(idPerfil).label;

export const hasPermission = (idPerfil, permission) =>
  Boolean(getRoleConfig(idPerfil).permissions?.[permission]);

export const isConsumerProfile = (idPerfil) =>
  CONSUMER_PROFILE_IDS.includes(Number(idPerfil ?? 0));

export const hasQrWalletProfile = (idPerfil) =>
  QR_WALLET_PROFILE_IDS.includes(Number(idPerfil ?? 0));

export const isInstitutionalPortalProfile = (idPerfil) =>
  INSTITUTIONAL_PORTAL_PROFILE_IDS.includes(Number(idPerfil ?? 0));

export const getInstitutionalEstablishment = (idPerfil) =>
  INSTITUTIONAL_PROFILE_ESTABLISHMENTS[Number(idPerfil ?? 0)] ?? null;

const normalizeBenefitText = (user) =>
  String(
    user?.tipo_beneficio_label ??
    user?.tipo_beneficio ??
    user?.beneficio_qr ??
    ''
  )
    .trim()
    .toLowerCase();

export const resolveInstitutionalPartida = (user) => {
  const numericPerfil = Number(user?.id_perfil ?? 0);
  const normalizedBenefit = normalizeBenefitText(user);
  const hasFoodBenefit =
    Number(user?.tiene_alimentos ?? 0) === 1 ||
    user?.tiene_alimentos === true ||
    normalizedBenefit.includes('alimento');
  const hasLodgingBenefit =
    Number(user?.tiene_hospedaje ?? 0) === 1 ||
    user?.tiene_hospedaje === true ||
    normalizedBenefit.includes('hospedaje');

  if (numericPerfil === ROLE_IDS.SECUL) {
    return {
      id_partida: 1,
      clave_partida: '2210',
      nombre_partida: 'Partida 2210',
    };
  }

  if (numericPerfil === ROLE_IDS.FIC || numericPerfil === ROLE_IDS.UG) {
    if (hasFoodBenefit) {
      return {
        id_partida: user?.id_partida ?? null,
        clave_partida: '3390B',
        nombre_partida: 'Partida 3390B',
      };
    }

    if (hasLodgingBenefit) {
      return {
        id_partida: user?.id_partida ?? null,
        clave_partida: '3390A',
        nombre_partida: 'Partida 3390A',
      };
    }
  }

  const fallbackKey = String(
    user?.clave_partida ??
    user?.partida_label ??
    user?.partida ??
    ''
  ).trim();

  return {
    id_partida: user?.id_partida ?? null,
    clave_partida: fallbackKey || null,
    nombre_partida:
      String(user?.nombre_partida ?? user?.dsc_partida ?? '').trim() ||
      (fallbackKey ? `Partida ${fallbackKey}` : null),
  };
};

