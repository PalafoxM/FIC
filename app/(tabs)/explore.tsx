import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ROLE_IDS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

const getTipoLabel = (idTipo) => {
  const labels = {
    1: 'Restaurant',
    2: 'Hotel',
    3: 'General',
    4: 'Cliente FIC',
  };

  return labels[idTipo] || 'Sin tipo';
};

const getEmptyManagerForm = () => ({
  id_usuario: 0,
  id_establecimiento: '',
  usuario: '',
  nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  correo: '',
});

export default function ExploreScreen() {
  const { user, getTable, saveTable } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [savingManager, setSavingManager] = useState(false);
  const [managerForm, setManagerForm] = useState(getEmptyManagerForm());
  const [selectedEstablecimiento, setSelectedEstablecimiento] = useState(null);

  const isProvider = user?.id_perfil === ROLE_IDS.PROVIDER;
  const isBusinessManager = user?.id_perfil === ROLE_IDS.BUSINESS_MANAGER;

  const title = useMemo(
    () => (isProvider ? 'Mis establecimientos' : 'Establecimientos participantes'),
    [isProvider]
  );

  const subtitle = useMemo(() => {
    if (isProvider) {
      return 'Revisa tus establecimientos y administra a los gerentes de negocio asignados.';
    }

    return 'Consulta nombre, tipo y direccion de los establecimientos visibles dentro del programa.';
  }, [isProvider]);

  const filteredItems = useMemo(() => {
    if (isProvider) {
      return items;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [
        item?.title,
        item?.type,
        item?.address,
        item?.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [isProvider, items, searchQuery]);

  const closeManagerModal = () => {
    setModalVisible(false);
    setSavingManager(false);
    setSelectedEstablecimiento(null);
    setManagerForm(getEmptyManagerForm());
  };

  const openManagerModal = (establecimiento, gerente = null) => {
    setSelectedEstablecimiento(establecimiento);
    setManagerForm({
      id_usuario: gerente?.id_usuario ?? 0,
      id_establecimiento: String(establecimiento?.id ?? establecimiento?.id_establecimiento ?? ''),
      usuario: gerente?.usuario ?? '',
      nombre: gerente?.nombre ?? '',
      primer_apellido: gerente?.primer_apellido ?? '',
      segundo_apellido: gerente?.segundo_apellido ?? '',
      correo: gerente?.correo ?? '',
    });
    setModalVisible(true);
  };

  const loadData = useCallback(async () => {
    if (!user?.id_usuario) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isBusinessManager) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);

      if (!isProvider) {
        const establecimientos = await getTable({
          tabla: 'establecimiento',
          where: { visible: 1 },
          order: 'dsc_establecimiento ASC',
        });

        setItems(
          establecimientos.map((item) => ({
            id: item.id_establecimiento,
            title: item.dsc_establecimiento || 'Establecimiento',
            type: getTipoLabel(item.id_tipo),
            address: item.direccion || 'Direccion pendiente',
            phone: item.telefono || 'Telefono pendiente',
            locationUrl: item.ubicacion || '',
          }))
        );
        return;
      }

      const establecimientos = await getTable({
        tabla: 'establecimiento',
        where: {
          visible: 1,
          no_proveedor: user?.id_usuario,
        },
        order: 'dsc_establecimiento ASC',
      });

      const gerentes = await getTable({
        tabla: 'usuario',
        where: {
          visible: 1,
          id_perfil: 5,
        },
        order: 'nombre ASC',
      });

      const gerentesPorEstablecimiento = gerentes.reduce((acc, gerente) => {
        const key = String(gerente.id_establecimiento ?? '');
        if (!key) {
          return acc;
        }

        if (!acc[key]) {
          acc[key] = [];
        }

        acc[key].push(gerente);
        return acc;
      }, {});

      setItems(
        establecimientos.map((item) => ({
          id: item.id_establecimiento,
          title: item.dsc_establecimiento || 'Establecimiento',
          type: getTipoLabel(item.id_tipo),
          address: item.direccion || 'Direccion pendiente',
          phone: item.telefono || 'Telefono pendiente',
          locationUrl: item.ubicacion || '',
          managers: gerentesPorEstablecimiento[String(item.id_establecimiento)] || [],
        }))
      );
    } catch (error) {
      console.error('Error loading explore data:', error);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getTable, isBusinessManager, isProvider, user?.id_usuario]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChangeManagerField = (field, value) => {
    setManagerForm((current) => ({
      ...current,
      [field]:
        field === 'nombre' || field === 'primer_apellido' || field === 'segundo_apellido'
          ? value.toUpperCase()
          : field === 'usuario' || field === 'correo'
            ? value.toLowerCase()
            : value,
    }));
  };

  const handleSelectManagerEstablecimiento = (establecimiento) => {
    setSelectedEstablecimiento(establecimiento);
    setManagerForm((current) => ({
      ...current,
      id_establecimiento: String(establecimiento?.id ?? establecimiento?.id_establecimiento ?? ''),
    }));
  };

  const handleSaveManager = async () => {
    if (
      !managerForm.id_establecimiento ||
      !managerForm.usuario.trim() ||
      !managerForm.nombre.trim() ||
      !managerForm.primer_apellido.trim()
    ) {
      Alert.alert('Campos incompletos', 'Completa establecimiento, usuario, nombre y primer apellido.');
      return;
    }

    try {
      setSavingManager(true);

      const requestPayload = {
        id_establecimiento: Number(managerForm.id_establecimiento),
        id_perfil: 5,
        usuario: managerForm.usuario.trim(),
        nombre: managerForm.nombre.trim(),
        primer_apellido: managerForm.primer_apellido.trim(),
        segundo_apellido: managerForm.segundo_apellido.trim() || null,
        correo: managerForm.correo.trim() || null,
        id_proveedor: user?.id_usuario ?? 0,
        tipo_solicitud: Number(managerForm.id_usuario) > 0 ? 'actualizacion_gerente' : 'alta_gerente',
        estatus: 'pendiente',
      };

      console.log('Solicitud de gerente preparada:', requestPayload);

      closeManagerModal();
      Alert.alert(
        'Solicitud enviada',
        'Tu solicitud quedo preparada para revision de TI. En cuanto backend habilite la ruta de solicitudes, se registrara sin tocar directamente la tabla usuario.'
      );
    } catch (error) {
      console.error('Error preparing business manager request:', error);
      Alert.alert('Error', error.message || 'No se pudo preparar la solicitud de gerente.');
    } finally {
      setSavingManager(false);
    }
  };

  const handleDeleteManager = (manager) => {
    Alert.alert(
      'Eliminar gerente',
      'Se marcara como no visible. Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await saveTable({
                data: {
                  visible: 0,
                  usu_act: user?.id_usuario ?? 0,
                },
                config: {
                  tabla: 'usuario',
                  editar: true,
                  idEditar: { id_usuario: Number(manager.id_usuario) },
                },
                bitacora: { script: 'App.explore.deleteBusinessManager' },
              });
              await loadData();
              Alert.alert('Eliminado', 'El gerente de negocio fue desactivado.');
            } catch (error) {
              console.error('Error deleting business manager:', error);
              Alert.alert('Error', error.message || 'No se pudo eliminar el gerente.');
            }
          },
        },
      ]
    );
  };

  if (isBusinessManager) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Establecimientos</Text>
        <Text style={styles.emptyText}>
          Esta vista no aplica para gerente de negocio.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A0B17" />
        <Text style={styles.loadingText}>Cargando informacion...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {!isProvider && (
          <View style={styles.searchBlock}>
            <Text style={styles.inputLabel}>Buscar establecimiento</Text>
            <TextInput
              style={styles.input}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar por nombre, tipo, direccion o telefono"
              placeholderTextColor="#999"
            />
          </View>
        )}

        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sin registros</Text>
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? 'No encontramos establecimientos con ese criterio de busqueda.'
                : 'No hay informacion disponible para mostrar.'}
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={String(item.id)} style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>

              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Tipo</Text>
                <Text style={styles.metaValue}>{item.type}</Text>
              </View>

              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Direccion</Text>
                <Text style={styles.metaValue}>{item.address}</Text>
              </View>

              {!isProvider && (
                <>
                  <View style={styles.metaBlock}>
                    <Text style={styles.metaLabel}>Telefono</Text>
                    <Text style={styles.metaValue}>{item.phone}</Text>
                  </View>

                  <View style={styles.metaBlock}>
                    <Text style={styles.metaLabel}>Ubicacion</Text>
                    {item.locationUrl ? (
                      <TouchableOpacity
                        style={styles.linkButton}
                        onPress={async () => {
                          try {
                            const supported = await Linking.canOpenURL(item.locationUrl);
                            if (!supported) {
                              Alert.alert('Enlace no disponible', 'No se pudo abrir la ubicacion.');
                              return;
                            }

                            await Linking.openURL(item.locationUrl);
                          } catch {
                            Alert.alert('Error', 'No se pudo abrir la ubicacion.');
                          }
                        }}
                      >
                        <Text style={styles.linkButtonText}>Abrir en Google Maps</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.metaValue}>Ubicacion pendiente</Text>
                    )}
                  </View>
                </>
              )}

              {isProvider && (
                <View style={styles.metaBlock}>
                  <View style={styles.managerHeader}>
                    <Text style={styles.metaLabel}>Gerentes de negocio</Text>
                    <TouchableOpacity
                      style={styles.managerActionButton}
                      onPress={() => openManagerModal(item)}
                    >
                      <Text style={styles.managerActionButtonText}>Agregar gerente</Text>
                    </TouchableOpacity>
                  </View>

                  {item.managers?.length > 0 ? (
                    item.managers.map((manager) => (
                      <View key={String(manager.id_usuario)} style={styles.managerItem}>
                        <Text style={styles.managerName}>
                          {[manager.nombre, manager.primer_apellido, manager.segundo_apellido]
                            .filter(Boolean)
                            .join(' ') || manager.usuario}
                        </Text>
                        <Text style={styles.managerMeta}>Usuario: {manager.usuario || 'N/D'}</Text>
                        <Text style={styles.managerMeta}>Correo: {manager.correo || 'Sin correo'}</Text>

                        <View style={styles.managerActions}>
                          <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={() => openManagerModal(item, manager)}
                          >
                            <Text style={styles.secondaryButtonText}>Editar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.dangerButton}
                            onPress={() => handleDeleteManager(manager)}
                          >
                            <Text style={styles.dangerButtonText}>Eliminar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.metaValue}>Sin gerente asignado.</Text>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {Number(managerForm.id_usuario) > 0 ? 'Solicitar cambio de gerente' : 'Solicitar gerente'}
          </Text>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Perfil</Text>
            <TextInput style={styles.input} value="GERENTE DE NEGOCIO" editable={false} />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Establecimiento</Text>
            {items.length > 1 && Number(managerForm.id_usuario) === 0 ? (
              <View style={styles.selectOptions}>
                {items.map((establecimiento) => {
                  const isSelected =
                    String(managerForm.id_establecimiento) === String(establecimiento.id);

                  return (
                    <TouchableOpacity
                      key={String(establecimiento.id)}
                      style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                      onPress={() => handleSelectManagerEstablecimiento(establecimiento)}
                    >
                      <Text
                        style={[
                          styles.selectOptionText,
                          isSelected && styles.selectOptionTextActive,
                        ]}
                      >
                        {establecimiento.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={selectedEstablecimiento?.title || ''}
                editable={false}
              />
            )}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Tipo de establecimiento</Text>
            <TextInput
              style={styles.input}
              value={selectedEstablecimiento?.type || ''}
              editable={false}
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Usuario</Text>
            <TextInput
              style={styles.input}
              value={managerForm.usuario}
              onChangeText={(value) => handleChangeManagerField('usuario', value)}
              autoCapitalize="none"
              placeholder="escribe letra inicial y apellido completo"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={managerForm.nombre}
              onChangeText={(value) => handleChangeManagerField('nombre', value)}
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Primer apellido</Text>
            <TextInput
              style={styles.input}
              value={managerForm.primer_apellido}
              onChangeText={(value) => handleChangeManagerField('primer_apellido', value)}
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Segundo apellido</Text>
            <TextInput
              style={styles.input}
              value={managerForm.segundo_apellido}
              onChangeText={(value) => handleChangeManagerField('segundo_apellido', value)}
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>Correo</Text>
            <TextInput
              style={styles.input}
              value={managerForm.correo}
              onChangeText={(value) => handleChangeManagerField('correo', value)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={closeManagerModal}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, savingManager && styles.disabledButton]}
              onPress={handleSaveManager}
              disabled={savingManager}
            >
              <Text style={styles.primaryButtonText}>
                {savingManager ? 'Enviando...' : 'Enviar solicitud'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5f5f5f',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 12,
  },
  metaBlock: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 10,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E6C17',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F1FB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkButtonText: {
    color: '#1C5D99',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f5f5f5',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
    textAlign: 'center',
  },
  managerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  managerActionButton: {
    backgroundColor: '#4A0B17',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  managerActionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  managerItem: {
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  managerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 4,
  },
  managerMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  managerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#4A0B17',
    fontWeight: '700',
  },
  dangerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
  },
  dangerButtonText: {
    color: '#C62828',
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4A0B17',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 18,
  },
  searchBlock: {
    marginBottom: 14,
  },
  formBlock: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B4F0F',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
  },
  selectOptions: {
    gap: 8,
  },
  selectOption: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectOptionActive: {
    backgroundColor: '#4A0B17',
    borderColor: '#4A0B17',
  },
  selectOptionText: {
    color: '#222',
    fontSize: 15,
    fontWeight: '600',
  },
  selectOptionTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
});
