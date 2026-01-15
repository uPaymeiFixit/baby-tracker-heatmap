/**
 * CSV Parser Module for Baby Tracker exports
 * Handles parsing of sleep, nursing, pumping, bottle, and diaper CSV files
 */

const Parser = (function() {
  'use strict';

  /**
   * Detect activity type from filename
   * @param {string} filename - The name of the CSV file
   * @returns {string|null} - Activity type or null if unknown
   */
  function detectActivityType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('sleep')) return 'sleep';
    if (lower.includes('nursing')) return 'nursing';
    if (lower.includes('pump') && !lower.includes('expressed')) return 'pumping';
    if (lower.includes('expressed')) return 'bottle';
    if (lower.includes('diaper')) return 'diaper';
    return null;
  }

  /**
   * Parse Baby Tracker date format: "M/D/YY, HH:MM" or "M/D/YYYY, HH:MM"
   * @param {string} dateStr - Date string from CSV
   * @returns {Date|null} - Parsed Date object or null if invalid
   */
  function parseDateTime(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    // Clean up the string
    const cleaned = dateStr.trim().replace(/^"|"$/g, '');

    // Match pattern: M/D/YY, HH:MM or M/D/YYYY, HH:MM
    const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    let [, month, day, year, hours, minutes] = match;

    // Convert to numbers
    month = parseInt(month, 10) - 1; // JavaScript months are 0-indexed
    day = parseInt(day, 10);
    year = parseInt(year, 10);
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    // Handle 2-digit year (assume 20XX for years 00-99)
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }

    // Validate ranges
    if (month < 0 || month > 11) return null;
    if (day < 1 || day > 31) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return new Date(year, month, day, hours, minutes);
  }

  /**
   * Parse sleep CSV data
   * Format: Baby,Time,Duration(minutes),Note
   * @param {Array} rows - Parsed CSV rows
   * @returns {Array} - Array of sleep activity objects
   */
  function parseSleep(rows) {
    const activities = [];

    for (const row of rows) {
      const time = parseDateTime(row['Time']);
      const duration = parseInt(row['Duration(minutes)'], 10);

      if (!time || isNaN(duration) || duration <= 0) continue;

      activities.push({
        type: 'sleep',
        start: time,
        durationMinutes: duration,
        note: row['Note'] || ''
      });
    }

    return activities;
  }

  /**
   * Parse nursing CSV data
   * Format: Baby,Time,Start Side,Left duration (min),Right duration (min),Total Duration (min),Note
   * @param {Array} rows - Parsed CSV rows
   * @returns {Array} - Array of nursing activity objects
   */
  function parseNursing(rows) {
    const activities = [];

    for (const row of rows) {
      const time = parseDateTime(row['Time']);
      const duration = parseInt(row['Total Duration (min)'], 10);

      if (!time || isNaN(duration) || duration <= 0) continue;

      activities.push({
        type: 'nursing',
        start: time,
        durationMinutes: duration,
        startSide: row['Start Side'] || '',
        note: row['Note'] || ''
      });
    }

    return activities;
  }

  /**
   * Parse pumping CSV data
   * Format: Time,Start Side,Left duration (min),Right duration (min),Total Duration (min),...
   * @param {Array} rows - Parsed CSV rows
   * @returns {Array} - Array of pumping activity objects
   */
  function parsePumping(rows) {
    const activities = [];

    for (const row of rows) {
      const time = parseDateTime(row['Time']);
      const duration = parseInt(row['Total Duration (min)'], 10);

      if (!time || isNaN(duration) || duration <= 0) continue;

      activities.push({
        type: 'pumping',
        start: time,
        durationMinutes: duration,
        totalAmount: parseFloat(row['Total amount (oz.)']) || 0,
        note: row['Note'] || ''
      });
    }

    return activities;
  }

  /**
   * Parse bottle/expressed milk CSV data
   * Format: Baby,Time,Amount (oz.),Note
   * @param {Array} rows - Parsed CSV rows
   * @returns {Array} - Array of bottle activity objects
   */
  function parseBottle(rows) {
    const activities = [];

    for (const row of rows) {
      const time = parseDateTime(row['Time']);

      if (!time) continue;

      activities.push({
        type: 'bottle',
        time: time,
        amount: parseFloat(row['Amount (oz.)']) || 0,
        note: row['Note'] || ''
      });
    }

    return activities;
  }

  /**
   * Parse diaper CSV data
   * Format: Baby,Time,Status,Note
   * @param {Array} rows - Parsed CSV rows
   * @returns {Array} - Array of diaper activity objects
   */
  function parseDiaper(rows) {
    const activities = [];

    for (const row of rows) {
      const time = parseDateTime(row['Time']);

      if (!time) continue;

      activities.push({
        type: 'diaper',
        time: time,
        status: row['Status'] || 'Unknown',
        note: row['Note'] || ''
      });
    }

    return activities;
  }

  /**
   * Parse a CSV file and return activity data
   * @param {File} file - The CSV file to parse
   * @returns {Promise} - Resolves with { type, activities } or rejects with error
   */
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const activityType = detectActivityType(file.name);

      if (!activityType) {
        reject(new Error(`Unknown file type: ${file.name}`));
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn(`Parse warnings for ${file.name}:`, results.errors);
          }

          let activities = [];

          switch (activityType) {
            case 'sleep':
              activities = parseSleep(results.data);
              break;
            case 'nursing':
              activities = parseNursing(results.data);
              break;
            case 'pumping':
              activities = parsePumping(results.data);
              break;
            case 'bottle':
              activities = parseBottle(results.data);
              break;
            case 'diaper':
              activities = parseDiaper(results.data);
              break;
          }

          resolve({
            type: activityType,
            activities: activities,
            filename: file.name,
            rowCount: results.data.length,
            parsedCount: activities.length
          });
        },
        error: (error) => {
          reject(new Error(`Failed to parse ${file.name}: ${error.message}`));
        }
      });
    });
  }

  /**
   * Parse multiple CSV files
   * @param {FileList} files - The files to parse
   * @returns {Promise} - Resolves with array of parse results
   */
  function parseFiles(files) {
    const promises = Array.from(files).map(file => parseFile(file));
    return Promise.all(promises);
  }

  // Public API
  return {
    detectActivityType,
    parseDateTime,
    parseFile,
    parseFiles
  };
})();
