#!/usr/bin/env node

/**
 * Script para convertir archivos CommonJS a ES Modules
 * Uso: node convert-to-esm.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const lambdaDir = path.join(__dirname, 'lambda');

// Archivos a convertir
const filesToConvert = [
    'index.js',
    'getAgente.js',
    'send.message.js',
    'llm-vector.js',
    'conversationService.js',
    'acumulacion.js',
    'vectorial.service.js',
    'vectorial.service.cache.js',
    'bedrock/bedrock.js',
    'bedrock/claude.service.js',
    'plantillas/prompts.js'
];

/**
 * Convierte require() a import
 */
function convertRequireToImport(content) {
    // Patrón para: const { x, y } = require('module');
    content = content.replace(
        /const\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
        (match, imports, module) => `import { ${imports.trim()} } from '${module}';`
    );
    
    // Patrón para: const x = require('module');
    content = content.replace(
        /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
        (match, varName, module) => `import ${varName} from '${module}';`
    );
    
    // Patrón para: const x = require('module').promises;
    content = content.replace(
        /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)\.promises;?/g,
        (match, varName, module) => `import { promises as ${varName} } from '${module}';`
    );
    
    return content;
}

/**
 * Convierte module.exports y exports a export
 */
function convertExportsToExport(content) {
    // module.exports = { ... }
    content = content.replace(
        /module\.exports\s*=\s*\{([^}]+)\};?/g,
        (match, exports) => `export {${exports}};`
    );
    
    // exports.handler = async ...
    content = content.replace(
        /exports\.(\w+)\s*=/g,
        'export const $1 ='
    );
    
    // module.exports.x = ...
    content = content.replace(
        /module\.exports\.(\w+)\s*=/g,
        'export const $1 ='
    );
    
    return content;
}

/**
 * Agrega extensión .js a imports relativos
 */
function addJsExtension(content) {
    // import ... from './file' -> import ... from './file.js'
    content = content.replace(
        /from\s+['"](\.[^'"]+)(?<!\.js)['"]/g,
        (match, path) => `from '${path}.js'`
    );
    
    return content;
}

/**
 * Convierte un archivo
 */
async function convertFile(relativePath) {
    const filePath = path.join(lambdaDir, relativePath);
    
    try {
        console.log(`Convirtiendo: ${relativePath}`);
        
        let content = await fs.readFile(filePath, 'utf-8');
        
        // Aplicar conversiones
        content = convertRequireToImport(content);
        content = convertExportsToExport(content);
        content = addJsExtension(content);
        
        // Guardar archivo convertido
        await fs.writeFile(filePath, content, 'utf-8');
        
        console.log(`✅ Convertido: ${relativePath}`);
    } catch (error) {
        console.error(`❌ Error convirtiendo ${relativePath}:`, error.message);
    }
}

/**
 * Convierte todos los archivos
 */
async function convertAll() {
    console.log('🔄 Iniciando conversión a ES Modules...\n');
    
    for (const file of filesToConvert) {
        await convertFile(file);
    }
    
    console.log('\n✅ Conversión completada');
}

convertAll();
