/**
 * Heatmap Calculation and Rendering Module
 * Converts activity data into a visual 24-hour heatmap
 * Uses 1-minute resolution for smooth, continuous visualization
 */

const Heatmap = (function() {
  'use strict';

  // Constants
  const MINUTES_PER_DAY = 1440;

  // Activity colors
  const ACTIVITY_COLORS = {
    sleep: '#66BB6A',
    nursing: '#F48FB1',
    pumping: '#CE93D8',
    bottle: '#64B5F6',
    diaper: '#FFB74D'
  };

  // Activity display names
  const ACTIVITY_NAMES = {
    sleep: 'Sleep',
    nursing: 'Nursing',
    pumping: 'Pumping',
    bottle: 'Bottle',
    diaper: 'Diaper'
  };

  /**
   * Convert a Date to minutes since midnight
   * @param {Date} date - The date object
   * @returns {number} - Minutes since midnight (0-1439)
   */
  function timeToMinutes(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  /**
   * Get the date string (YYYY-MM-DD) for a Date object
   * @param {Date} date - The date object
   * @returns {string} - Date string
   */
  function getDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /**
   * Mark a range of minutes for a specific day
   * Handles overnight wraparound correctly
   * @param {Array} minuteDays - Array of Sets, one per minute, tracking unique days
   * @param {number} startMinute - Start time in minutes since midnight
   * @param {number} durationMinutes - Duration in minutes
   * @param {string} dateStr - The date string for this activity
   */
  function markMinuteRange(minuteDays, startMinute, durationMinutes, dateStr) {
    const endMinute = startMinute + durationMinutes;

    if (endMinute <= MINUTES_PER_DAY) {
      // Activity doesn't cross midnight
      for (let m = startMinute; m < endMinute; m++) {
        minuteDays[m].add(dateStr);
      }
    } else {
      // Activity crosses midnight - mark both segments
      // First segment: startMinute to end of day
      for (let m = startMinute; m < MINUTES_PER_DAY; m++) {
        minuteDays[m].add(dateStr);
      }
      // Second segment: start of day to wrapped end
      const wrappedEnd = endMinute % MINUTES_PER_DAY;
      for (let m = 0; m < wrappedEnd; m++) {
        minuteDays[m].add(dateStr);
      }
    }
  }

  /**
   * Calculate heatmap data for duration-based activities (sleep, nursing, pumping)
   * @param {Array} activities - Array of activity objects with start and durationMinutes
   * @returns {Object} - { minuteDays: Array of Sets, uniqueDays: Set, totalCount: number }
   */
  function calculateDurationHeatmap(activities) {
    // Track which days had activity at each minute
    const minuteDays = Array(MINUTES_PER_DAY).fill(null).map(() => new Set());
    const uniqueDays = new Set();

    for (const activity of activities) {
      const startMinute = timeToMinutes(activity.start);
      const dateStr = getDateString(activity.start);
      uniqueDays.add(dateStr);

      markMinuteRange(minuteDays, startMinute, activity.durationMinutes, dateStr);
    }

    return {
      minuteDays,
      uniqueDays,
      totalCount: activities.length
    };
  }

  /**
   * Calculate heatmap data for instant events (bottle, diaper)
   * Marks a small range around the event time for visibility
   * @param {Array} activities - Array of activity objects with time property
   * @returns {Object} - { minuteDays: Array of Sets, uniqueDays: Set, totalCount: number }
   */
  function calculateInstantHeatmap(activities) {
    const minuteDays = Array(MINUTES_PER_DAY).fill(null).map(() => new Set());
    const uniqueDays = new Set();

    // Mark a 15-minute window centered on each event for visibility
    const HALF_WINDOW = 7;

    for (const activity of activities) {
      const time = activity.time;
      const minute = timeToMinutes(time);
      const dateStr = getDateString(time);

      uniqueDays.add(dateStr);

      // Mark minutes in the window
      for (let m = minute - HALF_WINDOW; m <= minute + HALF_WINDOW; m++) {
        const normalizedMinute = ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        minuteDays[normalizedMinute].add(dateStr);
      }
    }

    return {
      minuteDays,
      uniqueDays,
      totalCount: activities.length
    };
  }

  /**
   * Calculate complete heatmap data for all activities
   * @param {Object} allActivities - Object with arrays for each activity type
   * @returns {Object} - Heatmap data with intensities and metadata
   */
  function calculateAllHeatmaps(allActivities) {
    const heatmaps = {};
    const allUniqueDays = new Set();

    // Duration-based activities
    const durationTypes = ['sleep', 'nursing', 'pumping'];
    for (const type of durationTypes) {
      if (allActivities[type] && allActivities[type].length > 0) {
        const result = calculateDurationHeatmap(allActivities[type]);
        heatmaps[type] = result;
        result.uniqueDays.forEach(d => allUniqueDays.add(d));
      }
    }

    // Instant events
    const instantTypes = ['bottle', 'diaper'];
    for (const type of instantTypes) {
      if (allActivities[type] && allActivities[type].length > 0) {
        const result = calculateInstantHeatmap(allActivities[type]);
        heatmaps[type] = result;
        result.uniqueDays.forEach(d => allUniqueDays.add(d));
      }
    }

    // Calculate intensities (0-1 scale) based on total unique days
    const totalDays = allUniqueDays.size;

    for (const type in heatmaps) {
      const data = heatmaps[type];
      // Convert minuteDays (array of Sets) to intensities (array of numbers)
      data.intensities = data.minuteDays.map(days =>
        totalDays > 0 ? Math.min(1, days.size / totalDays) : 0
      );
      data.color = ACTIVITY_COLORS[type];
      data.name = ACTIVITY_NAMES[type];
    }

    return {
      heatmaps,
      totalDays,
      allUniqueDays,
      dateRange: getDateRange(allUniqueDays)
    };
  }

  /**
   * Get the date range from a set of date strings
   * @param {Set} dateStrings - Set of YYYY-MM-DD strings
   * @returns {Object} - { start: Date, end: Date } or null if empty
   */
  function getDateRange(dateStrings) {
    if (dateStrings.size === 0) return null;

    const dates = Array.from(dateStrings).map(d => new Date(d)).sort((a, b) => a - b);
    return {
      start: dates[0],
      end: dates[dates.length - 1]
    };
  }

  /**
   * Convert minutes since midnight to time string
   * @param {number} minutes - Minutes since midnight (0-1439)
   * @returns {string} - Time string like "14:30"
   */
  function minutesToTimeString(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * Get the current time as minutes since midnight
   * @returns {number} - Minutes since midnight
   */
  function getCurrentMinutes() {
    const now = new Date();
    return timeToMinutes(now);
  }

  /**
   * Find runs of consecutive minutes with similar intensity
   * Groups minutes into segments for efficient rendering
   * @param {Array} intensities - Array of 1440 intensity values
   * @param {number} threshold - Minimum intensity change to start new run (default 0.05)
   * @returns {Array} - Array of { startMinute, endMinute, intensity }
   */
  function findIntensityRuns(intensities, threshold = 0.02) {
    const runs = [];
    if (intensities.length === 0) return runs;

    let runStart = 0;
    let runIntensity = intensities[0];

    for (let m = 1; m < intensities.length; m++) {
      const currentIntensity = intensities[m];
      // Start a new run if intensity changed significantly
      if (Math.abs(currentIntensity - runIntensity) > threshold) {
        if (runIntensity > 0) {
          runs.push({
            startMinute: runStart,
            endMinute: m,
            intensity: runIntensity
          });
        }
        runStart = m;
        runIntensity = currentIntensity;
      }
    }

    // Don't forget the last run
    if (runIntensity > 0) {
      runs.push({
        startMinute: runStart,
        endMinute: MINUTES_PER_DAY,
        intensity: runIntensity
      });
    }

    return runs;
  }

  /**
   * Render the heatmap as an SVG
   * @param {Object} heatmapData - Result from calculateAllHeatmaps
   * @param {Object} visibility - Object mapping activity types to boolean visibility
   * @param {HTMLElement} container - Container element for the SVG
   */
  function render(heatmapData, visibility, container) {
    const { heatmaps, totalDays } = heatmapData;

    // SVG dimensions
    const margin = { top: 20, right: 40, bottom: 20, left: 50 };
    const width = 700;
    const rowHeight = 24;
    const height = 24 * rowHeight + margin.top + margin.bottom;
    const chartWidth = width - margin.left - margin.right;

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', '#FFFFFF');
    svg.appendChild(bg);

    // Create group for chart content
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(chartGroup);

    // Pixels per minute
    const pixelsPerMinute = chartWidth / 60; // Each row is 60 minutes wide

    // Draw hour rows and grid
    for (let hour = 0; hour < 24; hour++) {
      const y = hour * rowHeight;

      // Hour label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', -10);
      label.setAttribute('y', y + rowHeight / 2 + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'hour-label');
      label.textContent = `${String(hour).padStart(2, '0')}:00`;
      chartGroup.appendChild(label);

      // Grid line
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('x1', 0);
      gridLine.setAttribute('y1', y);
      gridLine.setAttribute('x2', chartWidth);
      gridLine.setAttribute('y2', y);
      gridLine.setAttribute('class', 'hour-grid-line');
      chartGroup.appendChild(gridLine);
    }

    // Bottom grid line
    const bottomLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    bottomLine.setAttribute('x1', 0);
    bottomLine.setAttribute('y1', 24 * rowHeight);
    bottomLine.setAttribute('x2', chartWidth);
    bottomLine.setAttribute('y2', 24 * rowHeight);
    bottomLine.setAttribute('class', 'hour-grid-line');
    chartGroup.appendChild(bottomLine);

    // Draw activity bars for each visible type
    const visibleTypes = Object.keys(heatmaps).filter(type => visibility[type]);

    for (const type of visibleTypes) {
      const data = heatmaps[type];
      const runs = findIntensityRuns(data.intensities);

      for (const run of runs) {
        // Calculate position based on minutes
        const startHour = Math.floor(run.startMinute / 60);
        const startMinuteInHour = run.startMinute % 60;
        const endHour = Math.floor((run.endMinute - 1) / 60);
        const endMinuteInHour = (run.endMinute - 1) % 60 + 1;

        if (startHour === endHour) {
          // Run is within a single hour
          const y = startHour * rowHeight + 2;
          const x = startMinuteInHour * pixelsPerMinute;
          const rectWidth = (endMinuteInHour - startMinuteInHour) * pixelsPerMinute;

          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', x);
          rect.setAttribute('y', y);
          rect.setAttribute('width', Math.max(1, rectWidth));
          rect.setAttribute('height', rowHeight - 4);
          rect.setAttribute('fill', data.color);
          rect.setAttribute('opacity', run.intensity * 0.85);
          rect.setAttribute('class', 'activity-bar');
          chartGroup.appendChild(rect);
        } else {
          // Run spans multiple hours - draw segment for each hour
          for (let hour = startHour; hour <= endHour; hour++) {
            const y = hour * rowHeight + 2;
            let segmentStart, segmentEnd;

            if (hour === startHour) {
              segmentStart = startMinuteInHour;
              segmentEnd = 60;
            } else if (hour === endHour) {
              segmentStart = 0;
              segmentEnd = endMinuteInHour;
            } else {
              segmentStart = 0;
              segmentEnd = 60;
            }

            const x = segmentStart * pixelsPerMinute;
            const rectWidth = (segmentEnd - segmentStart) * pixelsPerMinute;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', Math.max(1, rectWidth));
            rect.setAttribute('height', rowHeight - 4);
            rect.setAttribute('fill', data.color);
            rect.setAttribute('opacity', run.intensity * 0.85);
            rect.setAttribute('class', 'activity-bar');
            chartGroup.appendChild(rect);
          }
        }
      }
    }

    // Create invisible hover targets for each minute (grouped by hour for efficiency)
    for (let hour = 0; hour < 24; hour++) {
      const y = hour * rowHeight;

      // Create hover target for the entire hour row
      const hoverTarget = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hoverTarget.setAttribute('x', 0);
      hoverTarget.setAttribute('y', y);
      hoverTarget.setAttribute('width', chartWidth);
      hoverTarget.setAttribute('height', rowHeight);
      hoverTarget.setAttribute('fill', 'transparent');
      hoverTarget.setAttribute('class', 'hover-target');
      hoverTarget.setAttribute('data-hour', hour);
      chartGroup.appendChild(hoverTarget);
    }

    // Current time indicator
    const currentMinutes = getCurrentMinutes();
    const currentHour = Math.floor(currentMinutes / 60);
    const currentMinuteInHour = currentMinutes % 60;
    const currentY = currentHour * rowHeight + (currentMinuteInHour / 60) * rowHeight;

    const timeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    timeLine.setAttribute('x1', -5);
    timeLine.setAttribute('y1', currentY);
    timeLine.setAttribute('x2', chartWidth + 5);
    timeLine.setAttribute('y2', currentY);
    timeLine.setAttribute('class', 'current-time-line');
    chartGroup.appendChild(timeLine);

    // Current time dots
    const leftDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    leftDot.setAttribute('cx', -5);
    leftDot.setAttribute('cy', currentY);
    leftDot.setAttribute('r', 4);
    leftDot.setAttribute('fill', '#E53935');
    chartGroup.appendChild(leftDot);

    const rightDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rightDot.setAttribute('cx', chartWidth + 5);
    rightDot.setAttribute('cy', currentY);
    rightDot.setAttribute('r', 4);
    rightDot.setAttribute('fill', '#E53935');
    chartGroup.appendChild(rightDot);

    // Current time label
    const timeStr = minutesToTimeString(currentMinutes);
    const timeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    timeLabel.setAttribute('x', chartWidth + 12);
    timeLabel.setAttribute('y', currentY + 4);
    timeLabel.setAttribute('class', 'current-time-label');
    timeLabel.textContent = timeStr;
    chartGroup.appendChild(timeLabel);

    // Clear container and add SVG
    container.innerHTML = '';
    container.appendChild(svg);

    // Store reference to chart dimensions for tooltip calculation
    svg._chartInfo = {
      margin,
      chartWidth,
      rowHeight,
      pixelsPerMinute
    };

    return svg;
  }

  /**
   * Get minute from mouse position on SVG
   * @param {SVGElement} svg - The SVG element
   * @param {MouseEvent} event - The mouse event
   * @returns {number|null} - Minute since midnight or null if outside chart
   */
  function getMinuteFromEvent(svg, event) {
    const chartInfo = svg._chartInfo;
    if (!chartInfo) return null;

    const rect = svg.getBoundingClientRect();
    const svgWidth = rect.width;
    const svgHeight = rect.height;

    // Get viewBox dimensions
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / svgWidth;
    const scaleY = viewBox.height / svgHeight;

    // Convert mouse position to SVG coordinates
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;

    // Adjust for chart margins
    const chartX = mouseX - chartInfo.margin.left;
    const chartY = mouseY - chartInfo.margin.top;

    // Check bounds
    if (chartX < 0 || chartX > chartInfo.chartWidth) return null;
    if (chartY < 0 || chartY > 24 * chartInfo.rowHeight) return null;

    // Calculate hour and minute
    const hour = Math.floor(chartY / chartInfo.rowHeight);
    const minuteInHour = Math.floor(chartX / chartInfo.pixelsPerMinute);

    return Math.min(hour * 60 + minuteInHour, MINUTES_PER_DAY - 1);
  }

  /**
   * Format intensity as a percentage string
   * @param {number} intensity - Value between 0 and 1
   * @returns {string} - Percentage string like "85%"
   */
  function formatPercentage(intensity) {
    return `${Math.round(intensity * 100)}%`;
  }

  // Public API
  return {
    MINUTES_PER_DAY,
    ACTIVITY_COLORS,
    ACTIVITY_NAMES,
    calculateAllHeatmaps,
    minutesToTimeString,
    getCurrentMinutes,
    render,
    getMinuteFromEvent,
    formatPercentage
  };
})();
