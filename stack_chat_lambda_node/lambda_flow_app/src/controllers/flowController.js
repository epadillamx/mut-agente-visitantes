const localService = require('../services/localService');
const dynamoService = require('../services/dynamoService');
const postgresService = require('../services/postgresService');
const bedrockService = require('../services/bedrockService');
const { getFracttalService } = require('../services/fracttalService');
const { isValidEmail } = require('../utils/crypto');
const { getFracttalCredentials } = require('../utils/secrets');

// Flag para usar PostgreSQL (true) o JSON local (false)
const USE_POSTGRES = true;

class FlowController {
  /**
   * Handle WhatsApp Flow requests
   * @param {object} decryptedData - Decrypted flow data
   * @returns {object} Response data
   */
  async handleFlow(decryptedData) {
    console.log('[FLOW_CONTROLLER] ========== INICIO handleFlow ==========');
    console.log('[FLOW_CONTROLLER] decryptedData:', JSON.stringify(decryptedData, null, 2));

    const { action, screen, data, flow_token, version } = decryptedData;
    console.log('[FLOW_CONTROLLER] action:', action, '| screen:', screen, '| flow_token:', flow_token);

    try {
      // Health check
      if (action === 'ping') {
        return { version: version || '3.0', data: { status: 'active' } };
      }

      // Función auxiliar para extraer datos de usuario del flow_token
      const extractUserDataFromToken = (token) => {
        if (!token || !token.startsWith('returning_')) {
          return null;
        }
        try {
          // Formato: returning_timestamp_base64data
          const parts = token.split('_');
          if (parts.length >= 3) {
            const base64Data = parts.slice(2).join('_'); // Por si el base64 tiene underscores
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
            const userData = JSON.parse(jsonStr);
            console.log('[FLOW] Datos de usuario extraídos del token:', JSON.stringify(userData));
            return userData;
          }
        } catch (e) {
          console.error('[FLOW] Error extrayendo datos del token:', e.message);
        }
        return null;
      };

      // Inicialización del flow
      if (action === 'INIT') {
        console.log('[FLOW_CONTROLLER] ========== INIT DETECTADO ==========');
        // Verificar si hay datos pre-cargados en el flow_token
        const userData = extractUserDataFromToken(flow_token);
        console.log('[FLOW_CONTROLLER] userData extraido del token:', JSON.stringify(userData));
        
        // ========== FLOW: CAMBIAR CORREO ==========
        // Si is_email_change es true, mostrar pantalla de cambio de correo
        if (userData && userData.is_email_change) {
          console.log('[FLOW_CONTROLLER] ========== CAMBIAR CORREO DETECTADO (INIT) ==========');
          const responseEmailChange = {
            version: version || '3.0',
            screen: 'EMAIL_FORM',
            data: {
              current_email: userData.current_email || 'Sin correo registrado',
              email_helper: "Ingresa tu nuevo correo electrónico"
            }
          };
          console.log('[FLOW_CONTROLLER] Response INIT cambiar correo:', JSON.stringify(responseEmailChange));
          return responseEmailChange;
        }
        
        // ========== FLOW: CAMBIAR LOCAL ==========
        // Si is_local_change es true, mostrar pantalla de búsqueda de local únicamente
        // IMPORTANTE: Usamos INCIDENT_FORM porque es la pantalla que tiene el Flow 839718892221678
        if (userData && userData.is_local_change) {
          console.log('[FLOW_CONTROLLER] ========== CAMBIAR LOCAL DETECTADO (INIT) ==========');
          const responseLocalChange = {
            version: version || '3.0',
            screen: 'INCIDENT_FORM',
            data: {
              locales: [{ id: "0", title: "Buscar local o contrato..." }],
              is_local_enabled: false,
              search_helper: "Ingrese el nombre del local o contrato (mínimo 4 caracteres)",
              from_fresh_form: false
            }
          };
          console.log('[FLOW_CONTROLLER] Response INIT cambiar local:', JSON.stringify(responseLocalChange));
          return responseLocalChange;
        }
        
        if (userData && userData.is_returning_user && userData.nombre && userData.local) {
          console.log('[FLOW_CONTROLLER] USUARIO EXISTENTE - Enviando a INCIDENT_DETAILS');
          
          // Formatear texto de información del usuario
          const userInfoText = `Local: ${userData.local_nombre || 'Local no especificado'} | Usuario: ${userData.nombre} | Email: ${userData.email || 'Sin email'}`;
          
          const responseExisting = {
            version: version || '3.0',
            screen: 'INCIDENT_DETAILS',
            data: {
              nombre: userData.nombre,
              email: userData.email || '',
              local: userData.local,
              local_nombre: userData.local_nombre || '',
              is_returning_user: true,
              show_edit_link: true,
              user_info_text: userInfoText
            }
          };
          console.log('[FLOW_CONTROLLER] Response INIT existente:', JSON.stringify(responseExisting));
          return responseExisting;
        }
        
        // Usuario nuevo: mostrar formulario completo
        console.log('[FLOW_CONTROLLER] USUARIO NUEVO - Enviando a INCIDENT_FORM');
        const responseNew = {
          version: version || '3.0',
          screen: 'INCIDENT_FORM',
          data: {
            locales: [{ id: "0", title: "Buscar local o contrato..." }],
            is_local_enabled: false,
            search_helper: "Ingrese el nombre del local o contrato (minimo 4 caracteres)",
            from_fresh_form: false
          }
        };
        console.log('[FLOW_CONTROLLER] Response INIT nuevo:', JSON.stringify(responseNew));
        return responseNew;
      }

      // Data exchange
      if (action === 'data_exchange') {
        const userData = extractUserDataFromToken(flow_token);
        
        // ========== CAMBIO DE CORREO: Validación de email ==========
        // Si es cambio de correo (is_email_change=true), manejar validación y confirmación
        if (userData && userData.is_email_change) {
          console.log('[FLOW_CONTROLLER] ========== CAMBIO DE CORREO - data_exchange ==========');
          console.log('[FLOW_CONTROLLER] trigger:', data?.trigger, '| screen:', screen, '| nuevo_email:', data?.nuevo_email);
          
          // Trigger validate_email: Validar formato del correo y pasar a confirmación
          if (data?.trigger === 'validate_email' && data?.nuevo_email) {
            const nuevoEmail = data.nuevo_email.trim().toLowerCase();
            console.log('[FLOW_CONTROLLER] Validando nuevo email:', nuevoEmail);
            
            // Validar formato del email
            if (!isValidEmail(nuevoEmail)) {
              console.log('[FLOW_CONTROLLER] Email inválido:', nuevoEmail);
              return {
                version: version || '3.0',
                screen: 'EMAIL_FORM',
                data: {
                  current_email: userData.current_email || 'Sin correo registrado',
                  email_helper: "⚠️ El formato del correo no es válido. Por favor verifica e intenta de nuevo."
                }
              };
            }
            
            // Email válido, pasar a pantalla de confirmación
            console.log('[FLOW_CONTROLLER] Email válido, enviando a CONFIRMATION');
            return {
              version: version || '3.0',
              screen: 'CONFIRMATION',
              data: {
                nuevo_email: nuevoEmail,
                mensaje_confirmacion: `¿Confirmas que deseas cambiar tu correo a:\n\n📧 ${nuevoEmail}?`
              }
            };
          }
          
          // Para cualquier otra acción en cambio de correo, mantener en EMAIL_FORM
          console.log('[FLOW_CONTROLLER] Cambio de correo - mantener en EMAIL_FORM');
          return {
            version: version || '3.0',
            screen: 'EMAIL_FORM',
            data: {
              current_email: userData.current_email || 'Sin correo registrado',
              email_helper: "Ingresa tu nuevo correo electrónico"
            }
          };
        }
        
        // ========== CAMBIO DE LOCAL: Búsqueda de locales ==========
        // Si es cambio de local (is_local_change=true), NO redirigir a INCIDENT_DETAILS
        // Permitir que search_local funcione normalmente
        if (userData && userData.is_local_change) {
          console.log('[FLOW_CONTROLLER] ========== CAMBIO DE LOCAL - data_exchange ==========');
          console.log('[FLOW_CONTROLLER] trigger:', data?.trigger, '| screen:', screen, '| local:', data?.local);
          
          // Búsqueda de local en modo cambio de local
          if (data?.trigger === 'search_local') {
            const searchTerm = data.busqueda_local || '';
            
            console.log(`[FLOW_SEARCH] ========== BÚSQUEDA DE LOCAL (CAMBIO) ==========`);
            console.log(`[FLOW_SEARCH] searchTerm: "${searchTerm}"`);
            
            if (searchTerm.length < 4) {
              console.log(`[FLOW_SEARCH] Término muy corto (${searchTerm.length} chars)`);
              return {
                version: version || '3.0',
                screen: 'INCIDENT_FORM',
                data: {
                  locales: [{ id: "0", title: "Ingrese más caracteres..." }],
                  is_local_enabled: false,
                  search_helper: "Por favor ingrese al menos 4 caracteres para iniciar la búsqueda",
                  from_fresh_form: false
                }
              };
            }

            // Buscar locatarios
            let resultados;
            try {
              console.log(`[FLOW_SEARCH] Buscando en PostgreSQL: "${searchTerm}"`);
              if (USE_POSTGRES) {
                resultados = await postgresService.searchLocatarios(searchTerm, 10);
              } else {
                resultados = localService.searchLocales(searchTerm, 10);
              }
              console.log(`[FLOW_SEARCH] Resultados encontrados: ${resultados?.length || 0}`);
            } catch (searchError) {
              console.error(`[FLOW_SEARCH] ERROR en búsqueda:`, searchError);
              resultados = [];
            }

            console.log('[FLOW_SEARCH] Search results:', JSON.stringify(resultados, null, 2));

            return {
              version: version || '3.0',
              screen: 'INCIDENT_FORM',
              data: {
                locales: resultados.length > 0 
                  ? resultados 
                  : [{ id: "0", title: "Sin resultados para esta búsqueda" }],
                is_local_enabled: resultados.length > 0,
                search_helper: resultados.length > 0 
                  ? `${resultados.length} resultado(s) encontrado(s). Seleccione una opción.`
                  : "No se encontraron coincidencias. Intente con otro término.",
                from_fresh_form: false
              }
            };
          }
          
          // Trigger go_to_confirmation: Usuario seleccionó un local y quiere confirmar
          // Navegar de INCIDENT_FORM a CONFIRMATION
          if (data?.trigger === 'go_to_confirmation' && data?.local) {
            console.log('[FLOW_CONTROLLER] ========== GO TO CONFIRMATION (CAMBIO LOCAL) ==========');
            console.log('[FLOW_CONTROLLER] Local seleccionado:', data.local);
            
            // Parsear el local para obtener el nombre
            const localData = postgresService.parseLocalId(data.local);
            let localNombre = 'Local seleccionado';
            
            if (localData) {
              // Intentar obtener el nombre del contrato
              if (localData.numeroContrato) {
                try {
                  const contratoInfo = await postgresService.getContratoByNumero(localData.numeroContrato);
                  if (contratoInfo && contratoInfo.nombre_contrato) {
                    localNombre = `${contratoInfo.nombre_contrato} - ${localData.tipo}`;
                  } else {
                    localNombre = `Local ${localData.codigoLocal} - ${localData.tipo}`;
                  }
                } catch (err) {
                  console.error('[FLOW_CONTROLLER] Error obteniendo nombre del local:', err);
                  localNombre = `Local ${localData.codigoLocal} - ${localData.tipo}`;
                }
              } else {
                localNombre = `Local ${localData.codigoLocal} - ${localData.tipo}`;
              }
            }
            
            console.log('[FLOW_CONTROLLER] Nombre del local para confirmación:', localNombre);
            
            // El Flow en Meta espera estos campos en la pantalla CONFIRMATION:
            // - local: el ID compuesto del local seleccionado
            // - local_nombre: el nombre legible del local (NUEVO - actualizar Flow en Meta)
            // - mensaje_confirmacion: mensaje completo con el nombre (NUEVO - actualizar Flow en Meta)
            return {
              version: version || '3.0',
              screen: 'CONFIRMATION',
              data: {
                local: data.local,
                local_nombre: localNombre,
                mensaje_confirmacion: `¿Confirmas que deseas cambiar tu local a:\n\n📍 *${localNombre}*?`
              }
            };
          }
          
          // Para cambio de local, cualquier otra acción, mantener en INCIDENT_FORM
          console.log('[FLOW_CONTROLLER] Cambio de local - mantener en INCIDENT_FORM');
          return {
            version: version || '3.0',
            screen: 'INCIDENT_FORM',
            data: {
              locales: [{ id: "0", title: "Buscar local o contrato..." }],
              is_local_enabled: false,
              search_helper: "Ingrese el nombre del local o contrato (mínimo 4 caracteres)",
              from_fresh_form: false
            }
          };
        }
        
        // Si es usuario existente y está en INCIDENT_FORM (pero NO es cambio de local), redirigir a INCIDENT_DETAILS
        if (userData && userData.is_returning_user && !userData.is_local_change && screen === 'INCIDENT_FORM') {
          console.log('[FLOW] Usuario existente detectado en INCIDENT_FORM, redirigiendo a INCIDENT_DETAILS');
          const userInfoText = `📍 ${userData.local_nombre || 'Local no especificado'}\n👤 ${userData.nombre}\n📧 ${userData.email || 'Sin email'}`;
          
          return {
            version: version || '3.0',
            screen: 'INCIDENT_DETAILS',
            data: {
              nombre: userData.nombre,
              email: userData.email || '',
              local: userData.local,
              local_nombre: userData.local_nombre || '',
              is_returning_user: true,
              show_edit_link: false,
              user_info_text: userInfoText
            }
          };
        }
        
        // Búsqueda de local
        if (data?.trigger === 'search_local') {
          const searchTerm = data.busqueda_local || '';
          const fromFreshForm = data.from_fresh_form || false;
          // Detectar de qué pantalla viene la búsqueda (LOCAL_SEARCH para cambio de local, INCIDENT_FORM para nuevo usuario)
          const screenSource = data.screen_source || screen || 'INCIDENT_FORM';
          const targetScreen = screenSource === 'LOCAL_SEARCH' ? 'LOCAL_SEARCH' : 'INCIDENT_FORM';
          
          console.log(`[FLOW_SEARCH] ========== BÚSQUEDA DE LOCAL ==========`);
          console.log(`[FLOW_SEARCH] searchTerm: "${searchTerm}", screenSource: ${screenSource}, targetScreen: ${targetScreen}`);
          
          if (searchTerm.length < 4) {
            console.log(`[FLOW_SEARCH] Término muy corto (${searchTerm.length} chars), retornando a ${targetScreen}`);
            const shortTermResponse = {
              version: version || '3.0',
              screen: targetScreen,
              data: {
                locales: [{ id: "0", title: "Ingrese más caracteres..." }],
                is_local_enabled: false,
                search_helper: "Por favor ingrese al menos 4 caracteres para iniciar la búsqueda",
                ...(targetScreen === 'INCIDENT_FORM' && { from_fresh_form: fromFreshForm })
              }
            };
            console.log(`[FLOW_SEARCH] Response:`, JSON.stringify(shortTermResponse));
            return shortTermResponse;
          }

          // Buscar locatarios - PostgreSQL o JSON local
          // Los resultados ya vienen en formato {id, title} para WhatsApp Flow
          // El ID contiene: locatarioId|fractalCode|codigoLocal|tipo|numeroContrato
          let resultados;
          try {
            console.log(`[FLOW_SEARCH] Buscando en PostgreSQL: "${searchTerm}"`);
            if (USE_POSTGRES) {
              resultados = await postgresService.searchLocatarios(searchTerm, 10);
            } else {
              resultados = localService.searchLocales(searchTerm, 10);
            }
            console.log(`[FLOW_SEARCH] Resultados encontrados: ${resultados?.length || 0}`);
          } catch (searchError) {
            console.error(`[FLOW_SEARCH] ERROR en búsqueda:`, searchError);
            resultados = [];
          }

          console.log('[FLOW_SEARCH] Search results:', JSON.stringify(resultados, null, 2));

          const response = {
            version: version || '3.0',
            screen: targetScreen,
            data: {
              locales: resultados.length > 0 
                ? resultados 
                : [{ id: "0", title: "Sin resultados para esta búsqueda" }],
              is_local_enabled: resultados.length > 0,
              search_helper: resultados.length > 0 
                ? `${resultados.length} resultado(s) encontrado(s). Seleccione una opción.`
                : "No se encontraron coincidencias. Intente con otro término.",
              ...(targetScreen === 'INCIDENT_FORM' && { from_fresh_form: fromFreshForm })
            }
          };

          console.log('[FLOW_SEARCH] Sending response:', JSON.stringify(response, null, 2));
          return response;
        }

        // Ir a detalles de incidencia
        if (data?.trigger === 'go_to_details') {
          return {
            version: version || '3.0',
            screen: 'INCIDENT_DETAILS',
            data: {
              nombre: data.nombre,
              email: data.email,
              local: data.local,
              local_nombre: '',
              is_returning_user: false,
              show_edit_link: false,
              user_info_text: ''
            }
          };
        }

        // Ir a confirmación
        if (data?.trigger === 'go_to_confirmation') {
          // Parsear el ID compuesto del local
          // Formato: locatarioId|fractalCode|codigoLocal|tipo|numeroContrato
          const localData = postgresService.parseLocalId(data.local);
          
          let localNombre = data.local; // fallback
          let fractalCode = null;
          let locatarioId = null;
          let codigoLocal = null;
          let tipoLocal = null;
          
          if (localData) {
            locatarioId = localData.locatarioId;
            fractalCode = localData.fractalCode;
            codigoLocal = localData.codigoLocal;
            tipoLocal = localData.tipo;
            
            // Buscar el nombre del contrato en PostgreSQL
            if (USE_POSTGRES && localData.numeroContrato) {
              try {
                const contratoInfo = await postgresService.getContratoByNumero(localData.numeroContrato);
                if (contratoInfo) {
                  localNombre = `${contratoInfo.nombre_contrato} - ${tipoLocal}`;
                } else {
                  // Fallback: usar código local y tipo
                  localNombre = `Local ${codigoLocal} - ${tipoLocal}`;
                }
              } catch (err) {
                console.error('[FLOW] Error getting contrato info:', err);
                localNombre = `Local ${codigoLocal} - ${tipoLocal}`;
              }
            } else {
              localNombre = `Local ${codigoLocal} - ${tipoLocal}`;
            }
          }

          return {
            version: version || '3.0',
            screen: 'CONFIRMATION',
            data: {
              nombre: data.nombre,
              email: data.email,
              local: data.local,
              local_nombre: localNombre,
              fractal_code: fractalCode,
              locatario_id: locatarioId,
              incidencia: data.incidencia,
              resumen_datos: `Nombre: ${data.nombre}\nCorreo electrónico: ${data.email}`,
              resumen_incidencia: `Local: ${localNombre}\n\nDescripción de la incidencia:\n${data.incidencia}`
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
  async handleSearchLocal(searchQuery) {
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

    // Search locales - PostgreSQL o JSON local
    let results;
    if (USE_POSTGRES) {
      results = await postgresService.searchLocatarios(searchQuery, 10);
    } else {
      results = localService.searchLocales(searchQuery, 10);
    }

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
  async handleIncidentDetailsSubmit(data) {
    console.log('Processing incident details:', data);

    // Validate required fields
    const errors = await this.validateIncidentData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // Get local details - PostgreSQL o JSON local
    let local;
    let fractalCode = null;
    let locatarioId = null;
    
    if (USE_POSTGRES) {
      // El ID viene en formato "locatarioId_fractalCode"
      const [localIdPart, fractalCodePart] = (data.local || '').split('_');
      locatarioId = localIdPart;
      fractalCode = fractalCodePart;
      local = await postgresService.getLocatarioById(locatarioId);
    } else {
      local = localService.getLocalById(data.local);
    }
    
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
        locatario_id: locatarioId || local.id,
        fractal_code: fractalCode || local.fractal_code,
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
    console.log('[FLOW] Completing incident report:', JSON.stringify(data, null, 2));

    // Validate data one more time
    const errors = await this.validateIncidentData(data);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // Parsear el ID compuesto del local
    // Formato: locatarioId|fractalCode|codigoLocal|tipo|numeroContrato
    const localData = postgresService.parseLocalId(data.local);
    
    let fractalCode = data.fractal_code || null;
    let locatarioId = data.locatario_id || null;
    let localNombre = data.local_nombre || 'Local';
    
    if (localData) {
      locatarioId = localData.locatarioId;
      fractalCode = localData.fractalCode;
      
      // Obtener nombre del contrato
      if (localData.numeroContrato) {
        try {
          const contratoInfo = await postgresService.getContratoByNumero(localData.numeroContrato);
          if (contratoInfo) {
            localNombre = `${contratoInfo.nombre_contrato} - ${localData.tipo}`;
          }
        } catch (err) {
          console.error('[FLOW] Error getting contrato info:', err);
        }
      }
    }

    if (!fractalCode) {
      throw new Error('No se pudo obtener el código Fracttal del local.');
    }

    console.log(`[FLOW] Local: ${localNombre}, FractalCode: ${fractalCode}, LocatarioId: ${locatarioId}`);

    // ============================================================
    // PASO 1: Clasificar la incidencia con Bedrock
    // ============================================================
    let clasificacion = {
      nombre_nivel_1: 'Otros',
      nombre_nivel_2: 'Otros',
      nombre_nivel_3: 'Otros'
    };

    try {
      console.log('[FLOW] Obteniendo categorías de Fracttal...');
      const categoriasJson = await postgresService.getClasificacionFracttal();
      
      console.log('[FLOW] Clasificando incidencia con Bedrock...');
      clasificacion = await bedrockService.clasificarIncidencia(data.incidencia, categoriasJson);
      
      console.log('[FLOW] Clasificación obtenida:', clasificacion);
    } catch (error) {
      console.error('[FLOW] Error en clasificación, usando "Otros":', error);
      // Continuar con clasificación por defecto "Otros"
    }

    // ============================================================
    // PASO 2: Crear ticket en Fracttal
    // ============================================================
    let fracttalId = null;
    
    try {
      console.log('[FLOW] Creando ticket en Fracttal...');
      
      const fracttalCreds = await getFracttalCredentials();
      const fracttalService = getFracttalService({
        fracttalKey: fracttalCreds.key,
        fracttalSecret: fracttalCreds.secret,
        fracttalUserCode: fracttalCreds.userCode
      });

      const fracttalResult = await fracttalService.createWorkRequest({
        fractalCode: fractalCode,
        descripcion: data.incidencia,
        nombre: data.nombre,
        email: data.email,
        nivel1: clasificacion.nombre_nivel_1,  // types_description
        nivel2: clasificacion.nombre_nivel_2,  // types_1_description
        nivel3: clasificacion.nombre_nivel_3,  // types_2_description
        locatarioId: locatarioId,
        urgente: false
      });

      if (fracttalResult.success && fracttalResult.fracttalId) {
        fracttalId = fracttalResult.fracttalId;
        console.log(`[FLOW] Ticket creado en Fracttal. ID: ${fracttalId}`);
      }
    } catch (error) {
      console.error('[FLOW] Error creando ticket en Fracttal:', error);
      // Continuar - guardaremos en BD con estado pendiente
    }

    // ============================================================
    // PASO 3: Guardar en PostgreSQL (whatsapp_tickets)
    // ============================================================
    let ticketDbId = null;
    
    try {
      console.log('[FLOW] Guardando ticket en PostgreSQL...');
      
      ticketDbId = await postgresService.createTicket({
        userName: data.nombre,
        userEmail: data.email,
        localId: locatarioId,
        localName: localNombre,
        fractalCode: fractalCode,
        descripcion: data.incidencia,
        categoria: clasificacion.nombre_nivel_3,
        idFracttal: fracttalId,
        estado: fracttalId ? 'Abierto' : 'pendiente',
        isNewUser: true,  // Por ahora siempre crear usuario nuevo
        userPhone: data.phone || null
      });
      
      console.log(`[FLOW] Ticket guardado en PostgreSQL. ID: ${ticketDbId}`);
    } catch (error) {
      console.error('[FLOW] Error guardando en PostgreSQL:', error);
    }

    // ============================================================
    // PASO 4: Guardar en DynamoDB (historial/log)
    // ============================================================
    const incidentData = {
      nombre: data.nombre,
      email: data.email,
      local_id: locatarioId,
      local_nombre: localNombre,
      fractal_code: fractalCode,
      incidencia: data.incidencia,
      // Clasificación
      clasificacion_nivel1: clasificacion.nombre_nivel_1,
      clasificacion_nivel2: clasificacion.nombre_nivel_2,
      clasificacion_nivel3: clasificacion.nombre_nivel_3,
      // IDs externos
      fracttal_id: fracttalId,
      ticket_db_id: ticketDbId,
      estado: fracttalId ? 'creado_fracttal' : 'pendiente'
    };

    const savedIncident = await dynamoService.saveIncident(incidentData);
    console.log(`[FLOW] Incidencia guardada en DynamoDB. ID: ${savedIncident.id}`);

    // ============================================================
    // RESPUESTA FINAL
    // ============================================================
    const mensaje = fracttalId 
      ? `Su incidencia ha sido registrada exitosamente con el número de ticket: ${fracttalId}. Pronto nos pondremos en contacto con usted.`
      : 'Su incidencia ha sido registrada exitosamente. Pronto nos pondremos en contacto con usted.';

    return {
      version: '3.0',
      data: {
        success: true,
        incident_id: savedIncident.id,
        fracttal_id: fracttalId,
        message: mensaje
      }
    };
  }

  /**
   * Validate incident data
   * @param {object} data - Data to validate
   * @returns {Array} Array of error messages
   */
  async validateIncidentData(data) {
    const errors = [];

    // Validate nombre
    if (!data.nombre || data.nombre.trim().length === 0) {
      errors.push('Por favor ingrese su nombre');
    }

    // Validate email
    if (!data.email || !isValidEmail(data.email)) {
      errors.push('Por favor ingrese un correo electrónico válido');
    }

    // Validate local
    if (!data.local && !data.local_id && !data.locatario_id) {
      errors.push('Por favor seleccione un local o contrato');
    }

    // Validar que el local exista
    const localId = data.locatario_id || data.local_id || data.local;
    if (localId && localId !== '0') {
      if (USE_POSTGRES) {
        // Extraer ID si viene en formato "locatarioId_fractalCode"
        const [locatarioIdPart] = (localId || '').split('_');
        const locatario = await postgresService.getLocatarioById(locatarioIdPart);
        if (!locatario) {
          errors.push('El local seleccionado no es válido');
        }
      } else {
        if (!localService.isValidLocal(localId)) {
          errors.push('El local seleccionado no es válido');
        }
      }
    }

    // Validate incidencia
    if (!data.incidencia || data.incidencia.trim().length < 10) {
      errors.push('La descripción de la incidencia debe tener al menos 10 caracteres');
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
