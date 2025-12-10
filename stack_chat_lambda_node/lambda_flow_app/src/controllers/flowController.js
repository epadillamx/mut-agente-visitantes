const localService = require('../services/localService');
const dynamoService = require('../services/dynamoService');
const { isValidEmail } = require('../utils/crypto');

class FlowController {
  /**
   * Handle WhatsApp Flow requests
   * @param {object} decryptedData - Decrypted flow data
   * @returns {object} Response data
   */
  async handleFlow(decryptedData) {
    console.log('Handling flow:', JSON.stringify(decryptedData, null, 2));

    const { action, screen, data, flow_token, version } = decryptedData;

    try {
      // Health check
      if (action === 'ping') {
        return { version: version || '3.0', data: { status: 'active' } };
      }

      // Inicialización del flow
      if (action === 'INIT') {
        return {
          version: version || '3.0',
          screen: 'INCIDENT_FORM',
          data: {
            locales: [{ id: "0", title: "Escribe arriba para buscar..." }],
            is_local_enabled: false,
            search_helper: "Escribe mínimo 4 caracteres y presiona Buscar"
          }
        };
      }

      // Data exchange
      if (action === 'data_exchange') {
        // Búsqueda de local
        if (data?.trigger === 'search_local') {
          const searchTerm = data.busqueda_local || '';
          
          if (searchTerm.length < 4) {
            return {
              version: version || '3.0',
              screen: 'INCIDENT_FORM',
              data: {
                locales: [{ id: "0", title: "Mínimo 4 caracteres" }],
                is_local_enabled: false,
                search_helper: "⚠️ Escribe mínimo 4 caracteres"
              }
            };
          }

          // Buscar en tu lista de locales
          const resultados = localService.searchLocales(searchTerm, 10);

          return {
            version: version || '3.0',
            screen: 'INCIDENT_FORM',
            data: {
              locales: resultados.length > 0 
                ? resultados 
                : [{ id: "0", title: "Sin resultados" }],
              is_local_enabled: resultados.length > 0,
              search_helper: resultados.length > 0 
                ? `✅ ${resultados.length} locales encontrados`
                : "❌ Sin resultados"
            }
          };
        }

        // Ir a detalles de incidencia
        if (data?.trigger === 'go_to_details') {
          return {
            version: version || '3.0',
            screen: 'INCIDENT_DETAILS',
            data: {
              nombre: data.nombre,
              email: data.email,
              local: data.local
            }
          };
        }

        // Ir a confirmación
        if (data?.trigger === 'go_to_confirmation') {
          const localInfo = localService.getLocalById(data.local);
          const localNombre = localInfo?.title || data.local;

          return {
            version: version || '3.0',
            screen: 'CONFIRMATION',
            data: {
              nombre: data.nombre,
              email: data.email,
              local: data.local,
              incidencia: data.incidencia,
              resumen_datos: `Nombre: ${data.nombre}\nEmail: ${data.email}`,
              resumen_incidencia: `Local: ${localNombre}\nDescripción: ${data.incidencia}`
            }
          };
        }
      }

      // Handle complete action
      if (action === 'complete') {
        return await this.handleComplete(data);
      }

      // Respuesta por defecto
      return { version: version || '3.0', screen, data: {} };
    } catch (error) {
      console.error('Error handling flow:', error);
      return this.createErrorResponse(error.message);
    }
  }

  /**
   * Handle init action
   * @returns {object} Init response
   */
  handleInit() {
    return {
      version: '3.0',
      screen: 'INCIDENT_FORM',
      data: {
        locales: [],
        is_local_enabled: false,
        search_helper: '🔍 Ingrese al menos 4 caracteres para buscar'
      }
    };
  }

  /**
   * Handle ping action
   * @returns {object} Ping response
   */
  handlePing() {
    return {
      version: '3.0',
      data: {
        status: 'active'
      }
    };
  }

  /**
   * Handle data_exchange action
   * @param {string} screen - Current screen
   * @param {object} data - Data from the screen
   * @param {string} flowToken - Flow token
   * @returns {object} Response data
   */
  async handleDataExchange(screen, data, flowToken) {
    // Handle search_local trigger from INCIDENT_FORM
    if (data.trigger === 'search_local') {
      return this.handleSearchLocal(data.busqueda_local);
    }

    // Handle navigation from INCIDENT_DETAILS to CONFIRMATION
    if (screen === 'INCIDENT_DETAILS') {
      return this.handleIncidentDetailsSubmit(data);
    }

    throw new Error(`Unhandled data_exchange for screen: ${screen}`);
  }

  /**
   * Handle search_local trigger
   * @param {string} searchQuery - Search query
   * @returns {object} Search results response
   */
  handleSearchLocal(searchQuery) {
    console.log('Searching locales with query:', searchQuery);

    // Validate minimum characters
    if (!searchQuery || searchQuery.length < 4) {
      return {
        version: '3.0',
        screen: 'INCIDENT_FORM',
        data: {
          locales: [],
          is_local_enabled: false,
          search_helper: '⚠️ Debe ingresar al menos 4 caracteres'
        }
      };
    }

    // Search locales
    const results = localService.searchLocales(searchQuery, 10);

    return {
      version: '3.0',
      screen: 'INCIDENT_FORM',
      data: {
        locales: results,
        is_local_enabled: results.length > 0,
        search_helper: results.length > 0
          ? `✅ ${results.length} local${results.length > 1 ? 'es' : ''} encontrado${results.length > 1 ? 's' : ''}`
          : '❌ No se encontraron locales'
      }
    };
  }

  /**
   * Handle submit from INCIDENT_DETAILS screen
   * @param {object} data - Form data
   * @returns {object} Confirmation screen response
   */
  handleIncidentDetailsSubmit(data) {
    console.log('Processing incident details:', data);

    // Validate required fields
    const errors = this.validateIncidentData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // Get local details
    const local = localService.getLocalById(data.local);
    if (!local) {
      throw new Error('Local no válido');
    }

    // Create summary
    const resumenDatos = `Nombre: ${data.nombre}\nEmail: ${data.email}`;
    const resumenIncidencia = `Local: ${local.title}\n\nDescripción:\n${data.incidencia}`;

    return {
      version: '3.0',
      screen: 'CONFIRMATION',
      data: {
        nombre: data.nombre,
        email: data.email,
        local: local.title,
        local_id: local.id,
        incidencia: data.incidencia,
        resumen_datos: resumenDatos,
        resumen_incidencia: resumenIncidencia
      }
    };
  }

  /**
   * Handle complete action (final submit)
   * @param {object} data - Complete form data
   * @returns {object} Success response
   */
  async handleComplete(data) {
    console.log('Completing incident report:', data);

    // Validate data one more time
    const errors = this.validateIncidentData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // Get local details
    const local = localService.getLocalById(data.local_id || data.local);
    if (!local) {
      throw new Error('Local no válido');
    }

    // Save to DynamoDB
    const incidentData = {
      nombre: data.nombre,
      email: data.email,
      local_id: local.id,
      local_nombre: local.title,
      incidencia: data.incidencia
    };

    const savedIncident = await dynamoService.saveIncident(incidentData);

    console.log('Incident saved successfully:', savedIncident.id);

    return {
      version: '3.0',
      data: {
        success: true,
        incident_id: savedIncident.id,
        message: 'Incidencia reportada exitosamente'
      }
    };
  }

  /**
   * Validate incident data
   * @param {object} data - Data to validate
   * @returns {Array} Array of error messages
   */
  validateIncidentData(data) {
    const errors = [];

    // Validate nombre
    if (!data.nombre || data.nombre.trim().length === 0) {
      errors.push('El nombre es requerido');
    }

    // Validate email
    if (!data.email || !isValidEmail(data.email)) {
      errors.push('Email inválido');
    }

    // Validate local
    if (!data.local && !data.local_id) {
      errors.push('Debe seleccionar un local');
    }

    const localId = data.local_id || data.local;
    if (localId && !localService.isValidLocal(localId)) {
      errors.push('Local no válido');
    }

    // Validate incidencia
    if (!data.incidencia || data.incidencia.trim().length < 10) {
      errors.push('La descripción debe tener al menos 10 caracteres');
    }

    return errors;
  }

  /**
   * Create error response
   * @param {string} message - Error message
   * @returns {object} Error response
   */
  createErrorResponse(message) {
    return {
      version: '3.0',
      data: {
        error: true,
        error_message: message
      }
    };
  }
}

module.exports = new FlowController();
