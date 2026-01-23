/**
 * Test PostgreSQL connection locally
 * Usage: node scripts/test-postgres.js
 * 
 * Make sure you have:
 * 1. PostgreSQL running locally
 * 2. Database 'copiaprod' created
 * 3. Environment variable USE_DEV_CREDENTIALS=true (or NODE_ENV=development)
 */

// Set development mode for local testing
process.env.NODE_ENV = 'development';
process.env.USE_DEV_CREDENTIALS = 'true';
process.env.AWS_REGION = 'us-east-1';

// Mock the secrets manager for local testing
// Since we're using DEV_CREDENTIALS, we don't need real AWS credentials
// But we need to mock the getWhatsAppCredentials call

const mockSecrets = {
    TOKEN_WHATSAPP: 'mock_token',
    ID_PHONE_WHATSAPP: 'mock_phone_id',
    VERIFY_TOKEN_WHATSAPP: 'mock_verify_token',
    WHATSAPP_PRIVATE_KEY: '',
    WHATSAPP_PRIVATE_KEY_PASSPHRASE: ''
};

// Override the secrets module to avoid AWS call in local testing
const originalRequire = require;
require = function(module) {
    if (module === '../utils/secrets' || module === './src/utils/secrets') {
        return {
            getPostgresConfig: async () => ({
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'xxxxxxxx',
                database: 'copiaprod'
            }),
            getWhatsAppCredentials: async () => mockSecrets,
            getAllCredentials: async () => ({
                ...mockSecrets,
                DB_HOST: 'localhost',
                DB_PORT: 5432,
                DB_USER: 'postgres',
                DB_PASSWORD: '213557lol',
                DB_NAME: 'xxxxxxxx',
                FRACTTAL_KEY: 'OKRXgjm4z1WO9aew3f',
                FRACTTAL_SECRET: 'gASgcVFirbc4uN5wANdkjAsgVkaQ5Kly',
                FRACTTAL_USER_CODE: 'FD1'
            })
        };
    }
    return originalRequire(module);
};

// Now we can require the postgres service with mocked secrets
const { Pool } = require('pg');

async function testConnection() {
    console.log('🔌 Testing PostgreSQL connection...\n');
    
    const config = {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: '213557lol',
        database: 'copiaprod'
    };
    
    console.log('📋 Connection config:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);
    console.log('');

    const pool = new Pool(config);

    try {
        // Test basic connection
        console.log('1️⃣  Testing basic connection...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as time, current_database() as db');
        console.log(`   ✅ Connected to: ${result.rows[0].db}`);
        console.log(`   ✅ Server time: ${result.rows[0].time}`);
        client.release();
        console.log('');

        // Test locatarios table existence
        console.log('2️⃣  Testing locatario table...');
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'locatario'
            ) as exists
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('   ✅ Table "locatario" exists');
            
            // Count records
            const countResult = await pool.query('SELECT COUNT(*) as count FROM locatario');
            console.log(`   ✅ Total locatarios: ${countResult.rows[0].count}`);
        } else {
            console.log('   ❌ Table "locatario" does not exist');
        }
        console.log('');

        // Test the search query
        console.log('3️⃣  Testing locatarios search query...');
        const searchQuery = `
            SELECT 
                l."nombreComercial" as nombre,
                ul."fracttalCode" as fractal_code,
                l.id as locatario_id,
                ul."codigoLocal" as codigo_local,
                CASE
                    WHEN c."centroComercial" = 'OFICINAS' THEN 'Oficina'
                    ELSE 'Local'
                END AS tipo
            FROM locatario l
            INNER JOIN contrato c ON l.id = c."locatarioId"
            INNER JOIN unidad_locativa ul ON ul."codigoLocal" = c."unidadLocativaCodigoLocal"
            WHERE c.status = 1
                AND ul."fracttalCode" IS NOT NULL
                AND c."centroComercial" IN ('RETAIL', 'OFICINAS', 'RETAILNOVENTAS')
            LIMIT 5
        `;

        try {
            const searchResult = await pool.query(searchQuery);
            console.log(`   ✅ Query executed successfully`);
            console.log(`   ✅ Sample results: ${searchResult.rows.length}`);
            
            if (searchResult.rows.length > 0) {
                console.log('');
                console.log('   📦 Sample locatarios:');
                searchResult.rows.forEach((row, i) => {
                    console.log(`      ${i + 1}. ${row.nombre} (ID: ${row.locatario_id}, Fracttal: ${row.fractal_code})`);
                });
            }
        } catch (queryError) {
            console.log(`   ❌ Query error: ${queryError.message}`);
            console.log('   💡 This might mean missing tables or columns');
        }
        console.log('');

        // Test search with term
        console.log('4️⃣  Testing search with term "star"...');
        const searchWithTerm = `
            SELECT 
                l."nombreComercial" as nombre,
                ul."fracttalCode" as fractal_code,
                l.id as locatario_id
            FROM locatario l
            INNER JOIN contrato c ON l.id = c."locatarioId"
            INNER JOIN unidad_locativa ul ON ul."codigoLocal" = c."unidadLocativaCodigoLocal"
            WHERE l."nombreComercial" ILIKE $1
                AND c.status = 1
                AND ul."fracttalCode" IS NOT NULL
                AND c."centroComercial" IN ('RETAIL', 'OFICINAS', 'RETAILNOVENTAS')
            LIMIT 10
        `;

        try {
            const searchResult = await pool.query(searchWithTerm, ['%star%']);
            console.log(`   ✅ Found ${searchResult.rows.length} results for "star"`);
            
            if (searchResult.rows.length > 0) {
                searchResult.rows.forEach((row, i) => {
                    console.log(`      ${i + 1}. ${row.nombre}`);
                });
            } else {
                console.log('   💡 No results for "star", try another search term');
            }
        } catch (queryError) {
            console.log(`   ❌ Search error: ${queryError.message}`);
        }

        console.log('\n✅ All tests completed!');
        console.log('\n📝 Next steps:');
        console.log('   1. If connection works, deploy with: cdk deploy ChatLambdaNodeStack');
        console.log('   2. Test the /db-health endpoint');
        console.log('   3. Test the /locatarios?q=searchTerm endpoint');

    } catch (error) {
        console.error('\n❌ Connection failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('   1. Is PostgreSQL running? Check with: pg_isready');
        console.log('   2. Does database "copiaprod" exist?');
        console.log('   3. Are credentials correct? (postgres / 213557lol)');
        console.log('   4. Check PostgreSQL logs for more details');
    } finally {
        await pool.end();
    }
}

testConnection();
