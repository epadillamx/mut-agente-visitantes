const fs = require('fs');
const path = require('path');

class LocalService {
  constructor() {
    this.locales = [];
    this.loadLocales();
  }

  /**
   * Load locales from JSON file
   */
  loadLocales() {
    try {
      const localesPath = path.join(__dirname, '../data/locales.json');
      const data = fs.readFileSync(localesPath, 'utf8');
      this.locales = JSON.parse(data);
      console.log(`Loaded ${this.locales.length} locales`);
    } catch (error) {
      console.error('Error loading locales:', error);
      this.locales = [];
    }
  }

  /**
   * Search locales by query string (case insensitive LIKE)
   * @param {string} query - Search query
   * @param {number} limit - Maximum results to return (default: 10)
   * @returns {Array} Array of matching locales
   */
  searchLocales(query, limit = 10) {
    if (!query || query.length < 3) {
      return [];
    }

    const searchTerm = query.toLowerCase().trim();

    const matches = this.locales.filter(local =>
      local.title.toLowerCase().includes(searchTerm)
    );

    return matches.slice(0, limit);
  }

  /**
   * Get local by ID
   * @param {string} localId - Local ID
   * @returns {object|null} Local object or null if not found
   */
  getLocalById(localId) {
    return this.locales.find(local => local.id === localId) || null;
  }

  /**
   * Get all locales
   * @returns {Array} Array of all locales
   */
  getAllLocales() {
    return this.locales;
  }

  /**
   * Validate if local exists
   * @param {string} localId - Local ID
   * @returns {boolean} True if local exists
   */
  isValidLocal(localId) {
    return this.locales.some(local => local.id === localId);
  }
}

module.exports = new LocalService();
