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
    loadedFiles: []
  };

  // DOM elements
  let elements = {};

  /**
   * Initialize the application
   */
  function init() {
    // Cache DOM elements
    elements = {
      fileInput: document.getElementById('file-input'),
      clearBtn: document.getElementById('clear-btn'),
      dataSummary: document.getElementById('data-summary'),
      togglesSection: document.getElementById('toggles-section'),
      heatmapSection: document.getElementById('heatmap-section'),
      heatmapContainer: document.getElementById('heatmap-container'),
      tooltip: document.getElementById('tooltip'),
      loading: document.getElementById('loading')
    };

    // Bind event listeners
    elements.fileInput.addEventListener('change', handleFileUpload);
    elements.clearBtn.addEventListener('click', handleClear);

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
      const results = await Parser.parseFiles(files);

      // Merge results into state
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

      // Recalculate heatmap
      state.heatmapData = Heatmap.calculateAllHeatmaps(state.activities);

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
   * Update toggle item counts
   */
  function updateToggleCounts() {
    const toggleItems = document.querySelectorAll('.toggle-item');

    toggleItems.forEach(item => {
      const activityType = item.dataset.activity;
      const countSpan = item.querySelector('.toggle-count');
      const activities = state.activities[activityType];
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
      elements.togglesSection.classList.remove('hidden');
      elements.heatmapSection.classList.remove('hidden');
    } else {
      elements.togglesSection.classList.add('hidden');
      elements.heatmapSection.classList.add('hidden');
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
