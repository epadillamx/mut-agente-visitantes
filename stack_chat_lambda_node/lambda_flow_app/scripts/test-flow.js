/**
 * Test script for WhatsApp Flow endpoints
 * Usage: node scripts/test-flow.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('WhatsApp Flow - Test Suite');
  console.log('='.repeat(60));
  console.log('');

  // Test 1: Health Check
  console.log('[TEST 1] Health Check...');
  try {
    const health = await makeRequest('GET', '/webhook/health');
    console.log('✅ Status:', health.status);
    console.log('   Response:', JSON.stringify(health.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 2: Locales Count
  console.log('[TEST 2] Locales Count...');
  try {
    const count = await makeRequest('GET', '/webhook/locales/count');
    console.log('✅ Status:', count.status);
    console.log('   Response:', JSON.stringify(count.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 3: Search Local - Valid Query
  console.log('[TEST 3] Search Local - Valid Query (bogota)...');
  try {
    const search = await makeRequest('POST', '/webhook/flow', {
      action: 'data_exchange',
      screen: 'INCIDENT_FORM',
      data: {
        trigger: 'search_local',
        busqueda_local: 'bogota'
      }
    });
    console.log('✅ Status:', search.status);
    console.log('   Locales found:', search.data.data?.locales?.length || 0);
    console.log('   Helper:', search.data.data?.search_helper);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 4: Search Local - Short Query
  console.log('[TEST 4] Search Local - Short Query (bog)...');
  try {
    const search = await makeRequest('POST', '/webhook/flow', {
      action: 'data_exchange',
      screen: 'INCIDENT_FORM',
      data: {
        trigger: 'search_local',
        busqueda_local: 'bog'
      }
    });
    console.log('✅ Status:', search.status);
    console.log('   Locales found:', search.data.data?.locales?.length || 0);
    console.log('   Helper:', search.data.data?.search_helper);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 5: Search Local - No Results
  console.log('[TEST 5] Search Local - No Results (xyz123)...');
  try {
    const search = await makeRequest('POST', '/webhook/flow', {
      action: 'data_exchange',
      screen: 'INCIDENT_FORM',
      data: {
        trigger: 'search_local',
        busqueda_local: 'xyz123'
      }
    });
    console.log('✅ Status:', search.status);
    console.log('   Locales found:', search.data.data?.locales?.length || 0);
    console.log('   Helper:', search.data.data?.search_helper);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 6: Submit Incident Details
  console.log('[TEST 6] Submit Incident Details...');
  try {
    const submit = await makeRequest('POST', '/webhook/flow', {
      action: 'data_exchange',
      screen: 'INCIDENT_DETAILS',
      data: {
        nombre: 'Juan Pérez',
        email: 'juan.perez@example.com',
        local: 'local_001',
        incidencia: 'La puerta del baño está rota y no cierra correctamente. Necesita reparación urgente.'
      }
    });
    console.log('✅ Status:', submit.status);
    console.log('   Screen:', submit.data.screen);
    console.log('   Resumen Datos:', submit.data.data?.resumen_datos);
    console.log('   Resumen Incidencia:', submit.data.data?.resumen_incidencia?.substring(0, 50) + '...');
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 7: Complete Incident - Valid Data
  console.log('[TEST 7] Complete Incident - Valid Data...');
  try {
    const complete = await makeRequest('POST', '/webhook/flow', {
      action: 'complete',
      data: {
        nombre: 'María García',
        email: 'maria.garcia@example.com',
        local_id: 'local_002',
        incidencia: 'El aire acondicionado no funciona en la zona de comidas. Hace mucho calor.'
      }
    });
    console.log('✅ Status:', complete.status);
    console.log('   Success:', complete.data.data?.success);
    console.log('   Incident ID:', complete.data.data?.incident_id);
    console.log('   Message:', complete.data.data?.message);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 8: Complete Incident - Invalid Email
  console.log('[TEST 8] Complete Incident - Invalid Email...');
  try {
    const complete = await makeRequest('POST', '/webhook/flow', {
      action: 'complete',
      data: {
        nombre: 'Pedro López',
        email: 'invalid-email',
        local_id: 'local_003',
        incidencia: 'Problema con el ascensor'
      }
    });
    console.log('✅ Status:', complete.status);
    console.log('   Error:', complete.data.data?.error_message);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Test 9: Complete Incident - Short Description
  console.log('[TEST 9] Complete Incident - Short Description...');
  try {
    const complete = await makeRequest('POST', '/webhook/flow', {
      action: 'complete',
      data: {
        nombre: 'Ana Torres',
        email: 'ana@example.com',
        local_id: 'local_004',
        incidencia: 'Corto'
      }
    });
    console.log('✅ Status:', complete.status);
    console.log('   Error:', complete.data.data?.error_message);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('Test Suite Completed');
  console.log('='.repeat(60));
}

// Run tests
console.log('Starting tests...');
console.log('Make sure the server is running on http://localhost:3000');
console.log('');

setTimeout(() => {
  runTests().catch(console.error);
}, 1000);
