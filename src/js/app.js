/**
 * Main Application Module
 * Handles state management, UI interactions, and coordinating parser/heatmap modules
 */

const App = (function() {
  'use strict';

  // Application state
  const state = {
    activities: {
      sleep: [],
      nursing: [],
      pumping: [],
      bottle: [],
      diaper: []
    },
    heatmapData: null,
    visibility: {
      sleep: true,
      nursing: true,
      pumping: true,
      bottle: true,
      diaper: true
    },
    loadedFiles: [],
    dateFilter: {
      start: null,  // Date object or null for no filter
      end: null     // Date object or null for no filter
    }
  };

  // DOM elements
  let elements = {};

  // Example data file URLs
  const EXAMPLE_DATA_BASE_URL = 'https://raw.githubusercontent.com/uPaymeiFixit/baby-tracker-heatmap/refs/heads/main/example_export/';
  const EXAMPLE_FILES = ['diaper.csv', 'expressed.csv', 'nursing.csv', 'pump.csv', 'sleep.csv'];

  /**
   * Initialize the application
   */
  function init() {
    // Cache DOM elements
    elements = {
      fileInput: document.getElementById('file-input'),
      loadExampleBtn: document.getElementById('load-example-btn'),
      clearBtn: document.getElementById('clear-btn'),
      dataSummary: document.getElementById('data-summary'),
      gettingStarted: document.getElementById('getting-started'),
      dateFilterSection: document.getElementById('date-filter-section'),
      dateStart: document.getElementById('date-start'),
      dateEnd: document.getElementById('date-end'),
      resetDatesBtn: document.getElementById('reset-dates-btn'),
      togglesSection: document.getElementById('toggles-section'),
      heatmapSection: document.getElementById('heatmap-section'),
      heatmapContainer: document.getElementById('heatmap-container'),
      tooltip: document.getElementById('tooltip'),
      loading: document.getElementById('loading')
    };

    // Bind event listeners
    elements.fileInput.addEventListener('change', handleFileUpload);
    elements.loadExampleBtn.addEventListener('click', handleLoadExample);
    elements.clearBtn.addEventListener('click', handleClear);

    // Bind date filter listeners
    elements.dateStart.addEventListener('change', handleDateFilterChange);
    elements.dateEnd.addEventListener('change', handleDateFilterChange);
    elements.resetDatesBtn.addEventListener('click', handleResetDates);

    // Bind toggle listeners
    const toggleItems = document.querySelectorAll('.toggle-item input[type="checkbox"]');
    toggleItems.forEach(checkbox => {
      checkbox.addEventListener('change', handleToggleChange);
    });

    // Update current time indicator every minute
    setInterval(updateCurrentTimeIndicator, 60000);
  }

  /**
   * Handle file upload
   * @param {Event} event - Change event from file input
   */
  async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showLoading(true);

    try {
      // Separate zip files from CSV files
      const zipFiles = [];
      const csvFiles = [];

      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          zipFiles.push(file);
        } else {
          csvFiles.push(file);
        }
      }

      // Extract CSVs from zip files
      const extractedCsvs = await extractCsvsFromZips(zipFiles);

      // Parse regular CSV files
      if (csvFiles.length > 0) {
        const results = await Parser.parseFiles(csvFiles);
        for (const result of results) {
          if (result.activities.length > 0) {
            state.activities[result.type].push(...result.activities);
            state.loadedFiles.push({
              name: result.filename,
              type: result.type,
              count: result.parsedCount
            });
          }
        }
      }

      // Parse extracted CSV text from zip files
      for (const { filename, text } of extractedCsvs) {
        try {
          const result = Parser.parseCSVText(text, filename);
          if (result.activities.length > 0) {
            state.activities[result.type].push(...result.activities);
            state.loadedFiles.push({
              name: result.filename,
              type: result.type,
              count: result.parsedCount
            });
          }
        } catch (e) {
          console.warn(`Skipping ${filename}: ${e.message}`);
        }
      }

      // Initialize date filter with bounds and default to last 30 days
      initializeDateFilter();

      // Recalculate heatmap with filtered data
      const filteredActivities = getFilteredActivities();
      state.heatmapData = Heatmap.calculateAllHeatmaps(filteredActivities);

      // Update UI
      updateDataSummary();
      updateToggleCounts();
      renderHeatmap();
      showSections(true);

    } catch (error) {
      console.error('Error parsing files:', error);
      alert(`Error loading files: ${error.message}`);
    } finally {
      showLoading(false);
      // Reset file input so same file can be re-selected
      event.target.value = '';
    }
  }

  /**
   * Extract CSV files from zip archives
   * @param {Array} zipFiles - Array of zip File objects
   * @returns {Promise<Array>} - Array of { filename, text } objects
   */
  async function extractCsvsFromZips(zipFiles) {
    const extractedCsvs = [];

    for (const zipFile of zipFiles) {
      const arrayBuffer = await zipFile.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        // Skip directories and non-CSV files
        if (zipEntry.dir) continue;
        if (!relativePath.toLowerCase().endsWith('.csv')) continue;

        const text = await zipEntry.async('string');
        // Use just the filename, not the full path
        const filename = relativePath.split('/').pop();
        extractedCsvs.push({ filename, text });
      }
    }

    return extractedCsvs;
  }

  /**
   * Handle loading example data from GitHub
   */
  async function handleLoadExample() {
    showLoading(true);

    try {
      // Fetch all example CSV files
      const fetchPromises = EXAMPLE_FILES.map(async filename => {
        const url = EXAMPLE_DATA_BASE_URL + filename;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${filename}`);
        }
        const text = await response.text();
        return { filename, text };
      });

      const csvFiles = await Promise.all(fetchPromises);

      // Parse each CSV file
      for (const { filename, text } of csvFiles) {
        const result = Parser.parseCSVText(text, filename);
        if (result.activities.length > 0) {
          state.activities[result.type].push(...result.activities);
          state.loadedFiles.push({
            name: result.filename,
            type: result.type,
            count: result.parsedCount
          });
        }
      }

      // Initialize date filter with bounds and default to last 30 days
      initializeDateFilter();

      // Recalculate heatmap with filtered data
      const filteredActivities = getFilteredActivities();
      state.heatmapData = Heatmap.calculateAllHeatmaps(filteredActivities);

      // Update UI
      updateDataSummary();
      updateToggleCounts();
      renderHeatmap();
      showSections(true);

    } catch (error) {
      console.error('Error loading example data:', error);
      alert(`Error loading example data: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }

  /**
   * Handle clear button click
   */
  function handleClear() {
    // Reset state
    state.activities = {
      sleep: [],
      nursing: [],
      pumping: [],
      bottle: [],
      diaper: []
    };
    state.heatmapData = null;
    state.loadedFiles = [];

    // Reset visibility
    state.visibility = {
      sleep: true,
      nursing: true,
      pumping: true,
      bottle: true,
      diaper: true
    };

    // Reset date filter
    state.dateFilter = {
      start: null,
      end: null
    };
    elements.dateStart.value = '';
    elements.dateEnd.value = '';
    elements.dateStart.min = '';
    elements.dateStart.max = '';
    elements.dateEnd.min = '';
    elements.dateEnd.max = '';

    // Reset toggle checkboxes
    const toggleItems = document.querySelectorAll('.toggle-item input[type="checkbox"]');
    toggleItems.forEach(checkbox => {
      checkbox.checked = true;
    });

    // Update UI
    updateDataSummary();
    updateToggleCounts();
    showSections(false);
    elements.heatmapContainer.innerHTML = '';
  }

  /**
   * Handle activity toggle change
   * @param {Event} event - Change event from checkbox
   */
  function handleToggleChange(event) {
    const toggleItem = event.target.closest('.toggle-item');
    const activityType = toggleItem.dataset.activity;
    state.visibility[activityType] = event.target.checked;
    renderHeatmap();
  }

  /**
   * Handle date filter change
   */
  function handleDateFilterChange() {
    const startValue = elements.dateStart.value;
    const endValue = elements.dateEnd.value;

    // Parse dates (input value is YYYY-MM-DD format)
    state.dateFilter.start = startValue ? new Date(startValue + 'T00:00:00') : null;
    state.dateFilter.end = endValue ? new Date(endValue + 'T23:59:59') : null;

    // Recalculate heatmap with filtered data
    recalculateHeatmap();
  }

  /**
   * Handle reset dates button click
   */
  function handleResetDates() {
    // Reset to default (last 30 days)
    setDefaultDateFilter();
    recalculateHeatmap();
  }

  /**
   * Set the default date filter (last 30 days)
   */
  function setDefaultDateFilter() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Set state
    state.dateFilter.start = thirtyDaysAgo;
    state.dateFilter.end = today;

    // Update input values (YYYY-MM-DD format)
    elements.dateStart.value = formatDateForInput(thirtyDaysAgo);
    elements.dateEnd.value = formatDateForInput(today);
  }

  /**
   * Initialize date filter inputs with data range bounds
   */
  function initializeDateFilter() {
    // Get the full date range from all activities
    const allDates = getAllActivityDates();
    if (allDates.length === 0) return;

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    // Set min/max attributes on date inputs
    elements.dateStart.min = formatDateForInput(minDate);
    elements.dateStart.max = formatDateForInput(maxDate);
    elements.dateEnd.min = formatDateForInput(minDate);
    elements.dateEnd.max = formatDateForInput(maxDate);

    // Set default filter (last 30 days or data start if less than 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Use the later of: 30 days ago, or the earliest date in data
    const filterStart = thirtyDaysAgo > minDate ? thirtyDaysAgo : minDate;
    // Use the earlier of: today, or the latest date in data
    const filterEnd = today < maxDate ? today : maxDate;

    state.dateFilter.start = filterStart;
    state.dateFilter.end = filterEnd;

    elements.dateStart.value = formatDateForInput(filterStart);
    elements.dateEnd.value = formatDateForInput(filterEnd);
  }

  /**
   * Get all dates from all activities
   * @returns {Array} - Array of Date timestamps
   */
  function getAllActivityDates() {
    const dates = [];
    const durationTypes = ['sleep', 'nursing', 'pumping'];
    const instantTypes = ['bottle', 'diaper'];

    for (const type of durationTypes) {
      for (const activity of state.activities[type]) {
        dates.push(activity.start.getTime());
      }
    }

    for (const type of instantTypes) {
      for (const activity of state.activities[type]) {
        dates.push(activity.time.getTime());
      }
    }

    return dates;
  }

  /**
   * Format a Date object for date input (YYYY-MM-DD)
   * @param {Date} date - The date to format
   * @returns {string} - Formatted date string
   */
  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Filter activities by the current date range
   * @returns {Object} - Filtered activities object
   */
  function getFilteredActivities() {
    const { start, end } = state.dateFilter;

    // If no filter is set, return all activities
    if (!start && !end) {
      return state.activities;
    }

    const filtered = {
      sleep: [],
      nursing: [],
      pumping: [],
      bottle: [],
      diaper: []
    };

    const durationTypes = ['sleep', 'nursing', 'pumping'];
    const instantTypes = ['bottle', 'diaper'];

    // Filter duration-based activities
    for (const type of durationTypes) {
      filtered[type] = state.activities[type].filter(activity => {
        const activityDate = activity.start;
        if (start && activityDate < start) return false;
        if (end && activityDate > end) return false;
        return true;
      });
    }

    // Filter instant events
    for (const type of instantTypes) {
      filtered[type] = state.activities[type].filter(activity => {
        const activityDate = activity.time;
        if (start && activityDate < start) return false;
        if (end && activityDate > end) return false;
        return true;
      });
    }

    return filtered;
  }

  /**
   * Recalculate heatmap with current filters
   */
  function recalculateHeatmap() {
    const filteredActivities = getFilteredActivities();
    state.heatmapData = Heatmap.calculateAllHeatmaps(filteredActivities);
    updateDataSummary();
    updateToggleCounts();
    renderHeatmap();
  }

  /**
   * Update the data summary display
   */
  function updateDataSummary() {
    const hasData = state.heatmapData && state.heatmapData.totalDays > 0;

    if (hasData) {
      const { totalDays, dateRange } = state.heatmapData;
      const startStr = formatDate(dateRange.start);
      const endStr = formatDate(dateRange.end);

      elements.dataSummary.innerHTML = `
        <p><strong>${totalDays} days</strong> of data loaded (${startStr} - ${endStr})</p>
      `;
      elements.dataSummary.classList.add('has-data');
      elements.clearBtn.disabled = false;
    } else {
      elements.dataSummary.innerHTML = `
        <p>No data loaded. Upload Baby Tracker CSV exports to get started.</p>
      `;
      elements.dataSummary.classList.remove('has-data');
      elements.clearBtn.disabled = true;
    }
  }

  /**
   * Update toggle item counts (shows filtered count)
   */
  function updateToggleCounts() {
    const toggleItems = document.querySelectorAll('.toggle-item');
    const filteredActivities = getFilteredActivities();

    toggleItems.forEach(item => {
      const activityType = item.dataset.activity;
      const countSpan = item.querySelector('.toggle-count');
      const activities = filteredActivities[activityType];
      const count = activities ? activities.length : 0;

      if (count > 0) {
        countSpan.textContent = `(${count})`;
        item.style.opacity = '1';
      } else {
        countSpan.textContent = '';
        item.style.opacity = '0.5';
      }
    });
  }

  /**
   * Show/hide sections based on data availability
   * @param {boolean} show - Whether to show the sections
   */
  function showSections(show) {
    if (show) {
      elements.dateFilterSection.classList.remove('hidden');
      elements.togglesSection.classList.remove('hidden');
      elements.heatmapSection.classList.remove('hidden');
      if (elements.gettingStarted) {
        elements.gettingStarted.classList.add('hidden');
      }
      elements.loadExampleBtn.disabled = true;
    } else {
      elements.dateFilterSection.classList.add('hidden');
      elements.togglesSection.classList.add('hidden');
      elements.heatmapSection.classList.add('hidden');
      if (elements.gettingStarted) {
        elements.gettingStarted.classList.remove('hidden');
      }
      elements.loadExampleBtn.disabled = false;
    }
  }

  /**
   * Show/hide loading indicator
   * @param {boolean} show - Whether to show loading
   */
  function showLoading(show) {
    if (show) {
      elements.loading.classList.remove('hidden');
    } else {
      elements.loading.classList.add('hidden');
    }
  }

  /**
   * Render the heatmap
   */
  function renderHeatmap() {
    if (!state.heatmapData) return;

    const svg = Heatmap.render(
      state.heatmapData,
      state.visibility,
      elements.heatmapContainer
    );

    // Bind tooltip events
    bindTooltipEvents(svg);
  }

  /**
   * Bind tooltip events to heatmap
   * @param {SVGElement} svg - The SVG element
   */
  function bindTooltipEvents(svg) {
    // Store SVG reference for minute calculation
    state.currentSvg = svg;

    const hoverTargets = svg.querySelectorAll('.hover-target');

    hoverTargets.forEach(target => {
      target.addEventListener('mouseenter', handleTooltipShow);
      target.addEventListener('mousemove', handleTooltipMove);
      target.addEventListener('mouseleave', handleTooltipHide);
    });
  }

  /**
   * Handle tooltip show
   * @param {Event} event - Mouse event
   */
  function handleTooltipShow(event) {
    updateTooltipContent(event);
    elements.tooltip.classList.remove('hidden');
    positionTooltip(event);
  }

  /**
   * Handle tooltip move - update content based on exact minute position
   * @param {Event} event - Mouse event
   */
  function handleTooltipMove(event) {
    updateTooltipContent(event);
    positionTooltip(event);
  }

  /**
   * Update tooltip content based on mouse position
   * @param {Event} event - Mouse event
   */
  function updateTooltipContent(event) {
    if (!state.currentSvg) return;

    const minute = Heatmap.getMinuteFromEvent(state.currentSvg, event);
    if (minute === null) return;

    const timeStr = Heatmap.minutesToTimeString(minute);

    // Build tooltip content
    let activitiesHtml = '';
    const { heatmaps } = state.heatmapData;

    // Get visible activities with non-zero intensity for this minute
    const visibleActivities = Object.keys(heatmaps)
      .filter(type => state.visibility[type])
      .map(type => ({
        type,
        name: heatmaps[type].name,
        color: heatmaps[type].color,
        intensity: heatmaps[type].intensities[minute]
      }))
      .filter(a => a.intensity > 0)
      .sort((a, b) => b.intensity - a.intensity);

    if (visibleActivities.length > 0) {
      activitiesHtml = visibleActivities.map(a => `
        <div class="tooltip-activity">
          <span class="tooltip-dot" style="background-color: ${a.color};"></span>
          <span>${a.name}: ${Heatmap.formatPercentage(a.intensity)}</span>
        </div>
      `).join('');
    } else {
      activitiesHtml = '<div class="tooltip-activity">No activity data</div>';
    }

    elements.tooltip.innerHTML = `
      <div class="tooltip-time">${timeStr}</div>
      <div class="tooltip-activities">${activitiesHtml}</div>
    `;
  }

  /**
   * Handle tooltip hide
   */
  function handleTooltipHide() {
    elements.tooltip.classList.add('hidden');
  }

  /**
   * Position the tooltip near the cursor
   * @param {Event} event - Mouse event
   */
  function positionTooltip(event) {
    const tooltip = elements.tooltip;
    const padding = 10;

    let x = event.clientX + padding;
    let y = event.clientY + padding;

    // Get tooltip dimensions
    const tooltipRect = tooltip.getBoundingClientRect();

    // Adjust if tooltip would go off-screen
    if (x + tooltipRect.width > window.innerWidth) {
      x = event.clientX - tooltipRect.width - padding;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = event.clientY - tooltipRect.height - padding;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  /**
   * Update the current time indicator
   */
  function updateCurrentTimeIndicator() {
    if (state.heatmapData) {
      renderHeatmap();
    }
  }

  /**
   * Format a date as a readable string
   * @param {Date} date - The date to format
   * @returns {string} - Formatted date string
   */
  function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API (for debugging)
  return {
    getState: () => state
  };
})();
