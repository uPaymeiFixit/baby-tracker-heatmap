# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static single-page web application that visualizes Baby Tracker CSV data as a predictive heatmap, showing the probability of activities (sleep, nursing, pumping, bottle feeding, diaper changes) occurring at any given time throughout the day.

## Development

No build tools required. Open `src/index.html` directly in a browser.

## Architecture

Three vanilla JavaScript modules using the IIFE module pattern (no bundler/transpilation):

- **Parser** (`src/js/parser.js`): Parses Baby Tracker CSV exports using Papa Parse. Detects file type from filename (sleep, nursing, pump, expressed, diaper). Handles Baby Tracker's date format: `M/D/YY, HH:MM`.

- **Heatmap** (`src/js/heatmap.js`): Converts activities to 1440-element arrays (1-minute resolution). Duration-based activities (sleep, nursing, pumping) mark minute ranges; instant events (bottle, diaper) mark 15-minute windows. Overnight activities wrap around midnight. Renders SVG with intensity-based opacity bars.

- **App** (`src/js/app.js`): State management, file upload handling, toggle visibility, tooltip interactions. Coordinates Parser and Heatmap modules.

## Data Flow

1. User uploads CSV files → Parser detects type from filename and parses with Papa Parse
2. Parsed activities stored in `App.state.activities`
3. `Heatmap.calculateAllHeatmaps()` converts activities to intensity arrays (0-1 scale per minute)
4. `Heatmap.render()` draws SVG with colored bars representing probability at each time

## Key Implementation Details

- Intensity = (days with activity at minute) / (total unique days)
- Overnight sleep correctly wraps: sleep starting at 20:00 for 660 minutes marks both evening and morning segments
- Activity colors: Sleep=#66BB6A, Nursing=#F48FB1, Pumping=#CE93D8, Bottle=#64B5F6, Diaper=#FFB74D

## Working in This Repo

Keep PLAN.md updated whenever you make changes.

Read PLAN.md when more context or summarization is needed about the project's architecture. This is the plan that was used to generate the project.
