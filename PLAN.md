# Baby Tracker Heatmap - Implementation Plan

## Overview

A static single-page web application that visualizes Baby Tracker CSV data as a predictive heatmap, showing the probability of activities occurring at any given time throughout the day.

---

## 1. CSV Data Formats (Actual Baby Tracker Export)

### Sleep (`sleep.csv`)

```csv
Baby,Time,Duration(minutes),Note
Baby,"1/13/26, 19:54",660
Baby,"1/13/26, 12:09",101
```

- **Time**: Start time of sleep (M/D/YY, HH:MM format)
- **Duration**: Length in minutes
- **Key insight**: Night sleep ~600-700 min (10-11 hrs), naps ~60-150 min

### Nursing (`nursing.csv`)

```csv
Baby,Time,Start Side,Left duration (min),Right duration (min),Total Duration (min),Note
Baby,"5/14/25, 10:53",Right,,59,59
Baby,"4/29/25, 09:29",Left,36,8,44
```

- **Time**: Start time of nursing session
- **Total Duration (min)**: Use this for duration-based heatmap

### Pumping (`pump.csv`)

```csv
Time,Start Side,Left duration (min),Right duration (min),Total Duration (min),Left amount (oz.),Right amount (oz.),Total amount (oz.),Note
"7/1/25, 15:55",,21,22,43,,,
```

- **Time**: Start time
- **Total Duration (min)**: Duration for heatmap

### Expressed/Bottle (`expressed.csv`)

```csv
Baby,Time,Amount (oz.),Note
Baby,"2/3/25, 08:38",0.6
```

- **Time**: Feeding time (instant event, not duration-based)
- Could use a fixed duration (e.g., 15-20 min) or treat as point event

### Diaper (`diaper.csv`)

```csv
Baby,Time,Status,Note
Baby,"1/13/26, 15:58",Mixed
```

- **Time**: Change time (instant event)
- **Status**: Wet, Dirty, or Mixed

---

## 2. Heatmap Calculation Logic

### Continuous Time Resolution (1-minute granularity)

- Use **1-minute resolution** internally (1440 minutes per day)
- This allows for smooth, continuous visualization where overlapping activities blend naturally
- Example: Two sleep records (1-3pm and 2-4pm) render as:
  - 1:00-2:00pm: 50% opacity (1 of 2 days)
  - 2:00-3:00pm: 100% opacity (2 of 2 days overlap)
  - 3:00-4:00pm: 50% opacity (1 of 2 days)

### For Duration-Based Activities (Sleep, Nursing, Pumping)

```javascript
// For each activity record:
1. Parse start time → extract hour:minute as minutes since midnight
2. Calculate end minute = start + duration
3. Mark ALL minutes between start and end
4. Handle overnight: if end > 1440, wrap around (mark start→1439 AND 0→(end % 1440))

// Intensity calculation (per minute):
intensity[minute] = count_of_days_with_activity_at_minute / total_unique_days
```

### For Instant Events (Diaper, Bottle)

```javascript
// For each event:
1. Parse time → determine which minute it falls into
2. Mark that minute (and optionally a small range, e.g., ±7 minutes for visibility)

// Intensity calculation:
intensity[minute] = count_of_events_at_minute / total_unique_days
// Clamped to max 1.0
```

### Data Aggregation

```javascript
const heatmapData = {
  sleep: {
    minutes: Array(1440).fill(0),  // Count of days with sleep at each minute
    totalDays: 0,                   // Unique days with sleep data
    color: '#66BB6A'
  },
  nursing: { ... },
  pumping: { ... },
  bottle: { ... },
  diaper: { ... }
}
```

### SVG Rendering Strategy

Instead of drawing 96 discrete rectangles, we:

1. Scan through all 1440 minutes
2. Group consecutive minutes with the same intensity into "runs"
3. Draw one rectangle per run, with width proportional to duration
4. This creates smooth, continuous bars that accurately reflect activity times

---

## 3. UI Design (Matching Baby Tracker Style)

### Visual Reference from Screenshot

- Y-axis: Hours 00:00 → 23:00 (24 rows)
- Green bars indicate sleep periods
- Pink background indicates other activities
- Current time shown as red horizontal line
- Clean, minimal white background

### Color Palette

| Activity     | Color        | Hex       |
| ------------ | ------------ | --------- |
| Sleep        | Mint Green   | `#66BB6A` |
| Nursing      | Soft Pink    | `#F48FB1` |
| Pumping      | Light Purple | `#CE93D8` |
| Bottle       | Light Blue   | `#64B5F6` |
| Diaper       | Light Orange | `#FFB74D` |
| Background   | White        | `#FFFFFF` |
| Grid lines   | Light Gray   | `#E0E0E0` |
| Text         | Dark Gray    | `#424242` |
| Current time | Red          | `#E53935` |

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  🍼 Baby Activity Heatmap                                  │
├────────────────────────────────────────────────────────────┤
│  [Choose Files...] [Clear All]                             │
│  📊 Loaded: 180 days of data (Aug 2024 - Jan 2026)         │
├────────────────────────────────────────────────────────────┤
│  Layers:                                                   │
│  [✓] Sleep  [✓] Nursing  [✓] Pumping  [ ] Bottle  [ ] Diaper│
├────────────────────────────────────────────────────────────┤
│       ← Probability (0% ─────────────────────── 100%) →    │
│  00:00 ████████████████████░░░░░░░░░░░░░░░░░░░░             │
│  01:00 ████████████████████░░░░░░░░░░░░░░░░░░░░             │
│  02:00 ████████████████████░░░░░░░░░░░░░░░░░░░░             │
│  ...                                                       │
│  12:00 ░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░  ← nap      │
│  ...                                                       │
│  20:00 ████████████████████████████████████████  ← bedtime │
│  21:00 ████████████████████████████████████████             │
│  22:00 ████████████████████████████████████████             │
│  23:00 ████████████████████████████████████████             │
│  ─────────────────── 16:11 ────────────────────  ← now     │
├────────────────────────────────────────────────────────────┤
│  Hover: "Sleep: 92% likely at 21:30"                       │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Technical Architecture

### File Structure

```
baby-tracker-heatmap/
├── src/
│   ├── index.html      # Single-page app (all-in-one option)
│   ├── css/
│   │   └── styles.css  # Styling
│   └── js/
│       ├── app.js      # Main application & state management
│       ├── parser.js   # CSV parsing logic
│       └── heatmap.js  # Heatmap calculation & SVG rendering
├── example_export/     # Sample data (gitignored in production)
└── PLAN.md             # This file
```

### Technology Stack

- **HTML5**: Semantic markup, file input API
- **CSS3**: Flexbox/Grid layout, CSS custom properties for theming
- **Vanilla JavaScript**: ES6+ modules, no framework needed
- **Papa Parse** (CDN): Robust CSV parsing with automatic type detection
- **SVG**: Vector-based heatmap rendering (crisp at any size)

### State Management

```javascript
const appState = {
  files: [], // Loaded file metadata
  activities: {
    // Parsed activity data
    sleep: [],
    nursing: [],
    pumping: [],
    bottle: [],
    diaper: [],
  },
  heatmap: {
    // Calculated heatmap data
    sleep: { buckets: [], visible: true },
    // ...
  },
  dateRange: { start: null, end: null },
  totalDays: 0,
};
```

---

## 5. Implementation Phases

### Phase 1: Project Setup & Basic UI

- [ ] Create HTML structure with header, upload area, toggle controls, heatmap container
- [ ] Style with CSS matching Baby Tracker aesthetic
- [ ] Implement file upload handling (multiple files)
- [ ] Add Papa Parse via CDN

### Phase 2: CSV Parsing

- [ ] Detect file type from filename pattern (sleep, nursing, pump, etc.)
- [ ] Parse each CSV format with appropriate field mapping
- [ ] Normalize all timestamps to JavaScript Date objects
- [ ] Store parsed data in appState

### Phase 3: Heatmap Calculation

- [ ] Implement time bucketing (15-min intervals)
- [ ] Calculate intensity for duration-based activities
- [ ] Calculate intensity for instant events
- [ ] Handle overnight sleep sessions correctly
- [ ] Compute date range and total unique days

### Phase 4: SVG Visualization

- [ ] Create SVG container with proper viewBox
- [ ] Render 24 hour labels on Y-axis
- [ ] Draw horizontal bars for each hour
- [ ] Apply opacity based on intensity values
- [ ] Layer multiple activities with transparency

### Phase 5: Interactivity

- [ ] Implement activity toggle checkboxes
- [ ] Add current time indicator (red line)
- [ ] Implement hover tooltips showing percentages
- [ ] Add responsive behavior for mobile

### Phase 6: Polish & UX

- [ ] Add loading state during CSV processing
- [ ] Display data summary (date range, total days)
- [ ] Handle edge cases (empty files, invalid data)
- [ ] Add localStorage persistence (optional)
- [ ] Smooth animations for toggle show/hide

---

## 6. Detailed Component Specs

### CSV Parser Module (`parser.js`)

```javascript
// Detect activity type from filename
function detectActivityType(filename) {
  if (filename.includes("sleep")) return "sleep";
  if (filename.includes("nursing")) return "nursing";
  if (filename.includes("pump")) return "pumping";
  if (filename.includes("expressed")) return "bottle";
  if (filename.includes("diaper")) return "diaper";
  return null;
}

// Parse Baby Tracker date format: "M/D/YY, HH:MM"
function parseDateTime(dateStr) {
  // Handle: "1/13/26, 19:54" → Date object
}

// Parse each activity type
function parseSleep(rows) {
  /* ... */
}
function parseNursing(rows) {
  /* ... */
}
function parsePumping(rows) {
  /* ... */
}
function parseBottle(rows) {
  /* ... */
}
function parseDiaper(rows) {
  /* ... */
}
```

### Heatmap Calculator (`heatmap.js`)

```javascript
const MINUTES_PER_DAY = 1440;

function timeToMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function markMinuteRange(minuteCounts, startMinute, endMinute, dateStr, dayTracker) {
  // For duration-based activities:
  // Mark each minute from start to end
  // Handle overnight wraparound if endMinute > 1440
  // Track unique days per minute for accurate intensity
}

function calculateIntensities(minuteCounts, totalDays) {
  // Convert raw counts to 0-1 intensities
  // intensity[m] = minuteCounts[m] / totalDays
}

function findIntensityRuns(intensities) {
  // Group consecutive minutes with same intensity into runs
  // Returns array of { startMinute, endMinute, intensity }
  // Used for efficient SVG rendering
}
```

### SVG Renderer

```javascript
function renderHeatmap(heatmapData, container) {
  // Create SVG element
  // For each hour (0-23):
  //   - Draw hour label
  //   - For each visible activity:
  //     - Draw semi-transparent bar based on intensity
  // Add current time indicator
}
```

---

## 7. Edge Cases & Considerations

### Data Quality

- Handle missing duration values (default to 0 or skip)
- Handle malformed dates gracefully
- Skip rows with empty timestamps

### Overnight Sleep

- Sleep starting at 20:00 with 660-min duration ends at 07:00 next day
- Must mark buckets 80-95 (20:00-23:59) AND 0-27 (00:00-06:59)

### Multiple Events Per Bucket

- For instant events (diaper), could have 2+ per day in same bucket
- Intensity can exceed 1.0 → clamp or use different scale

### Date Range

- Only count days that have data, not calendar span
- Store unique dates per activity type

### File Re-upload

- Allow adding more files to existing data
- "Clear All" button to reset

---

## 8. Future Enhancements (Post-MVP)

1. **Day-of-Week Breakdown**: Show weekday vs weekend patterns
2. ~~**Date Range Filter**: Limit heatmap to specific date range~~ ✅ Implemented
3. **Export as Image**: Download heatmap as PNG
4. **Prediction Mode**: Highlight "what's likely happening now"
5. **Statistics Panel**: Show averages (avg sleep duration, feeds per day)
6. **Dark Mode**: Toggle dark theme
7. **Data Table**: Show raw parsed data for debugging

---

## 9. Questions Resolved

| Question         | Decision                                                |
| ---------------- | ------------------------------------------------------- |
| Time resolution  | 1-minute granularity (1440 per day)                     |
| Visualization    | SVG continuous bars (runs of same intensity)            |
| Overlap handling | Layer with transparency; overlaps show higher intensity |
| Date format      | M/D/YY, HH:MM (Baby Tracker default)                    |
| Overnight sleep  | Wrap around midnight, mark both segments                |

---

## 10. Next Steps

1. ✅ Analyze CSV formats from real Baby Tracker exports
2. → Start Phase 1: Create HTML/CSS foundation
3. → Implement file upload and Papa Parse integration
4. → Build parser for each activity type
5. → Continue through remaining phases

---

## Appendix: Sample Parsed Data

### Sleep Record

```javascript
{
  type: 'sleep',
  start: new Date('2026-01-13T19:54:00'),
  durationMinutes: 660,
  startMinute: 1194,  // 19:54 = 19*60 + 54
  endMinute: 414,     // wraps: (1194 + 660) % 1440 = 06:54
  crossesMidnight: true
}
```

### Nursing Record

```javascript
{
  type: 'nursing',
  start: new Date('2025-05-14T10:53:00'),
  durationMinutes: 59,
  startMinute: 653,   // 10:53
  endMinute: 712,     // 11:52
  crossesMidnight: false
}
```

### Diaper Record

```javascript
{
  type: 'diaper',
  time: new Date('2026-01-13T15:58:00'),
  minute: 958,        // 15:58 = 15*60 + 58
  status: 'Mixed'
}
```
