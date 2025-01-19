// ==UserScript==
// @name         MediaMagnet
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  A powerful media link finder and playlist generator
// @author       Your Name
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_download
// ==/UserScript==

/* global GM_setValue, GM_getValue, GM_addStyle, GM_download */

/**
 * @typedef {Object} Video
 * @property {string} url - URL of the video
 * @property {string} filename - Filename of the video
 * @property {string} path - Path of the video
 * @property {number|null} size - Size of the video in bytes
 * @property {string} quality - Quality of the video (e.g., '1080p', '720p')
 * @property {string} type - Type of video (e.g., 'movie', 'tv')
 * @property {string} year - Release year
 * @property {string} [title] - Optional title of the video
 * @property {number|null} [season] - Optional season number
 * @property {number|null} [episode] - Optional episode number
 */

/**
 * @typedef {Object} KeyboardShortcut
 * @property {string} key - Key combination (e.g., 'Ctrl+M')
 * @property {string} description - Description of what the shortcut does
 * @property {() => void} action - Function to execute when shortcut is triggered
 */

/**
 * @typedef {Object} UIElements
 * @property {HTMLElement|null} container - Main container element
 * @property {HTMLButtonElement|null} scanBtn - Scan button
 * @property {HTMLButtonElement|null} generateBtn - Generate playlist button
 * @property {HTMLButtonElement|null} clearBtn - Clear results button
 * @property {HTMLButtonElement|null} exportBtn - Export settings button
 * @property {HTMLButtonElement|null} importBtn - Import settings button
 * @property {HTMLInputElement|null} recursiveCheckbox - Recursive scan checkbox
 * @property {HTMLInputElement|null} skipExternalCheckbox - Skip external links checkbox
 * @property {HTMLInputElement|null} maxDepthInput - Maximum scan depth input
 * @property {HTMLElement|null} console - Console element
 * @property {HTMLElement|null} results - Results container
 */

/**
 * @typedef {Object} UIState
 * @property {UIElements} elements - UI elements
 * @property {number} [containerHeight] - Container height
 * @property {number} [scrollPosition] - Current scroll position
 * @property {ResizeObserver} [resizeObserver] - Resize observer instance
 */

/**
 * @typedef {Object} SearchOptions
 * @property {boolean} recursive - Whether to search recursively
 * @property {number} maxDepth - Maximum search depth
 * @property {boolean} skipExternal - Whether to skip external links
 */

/**
 * @typedef {Object} Store
 * @property {Video[]} videos - List of found videos
 * @property {boolean} scanning - Whether a scan is in progress
 * @property {number} retryCount - Number of retry attempts
 * @property {number} maxRetries - Maximum number of retries
 * @property {number} timeoutMs - Timeout in milliseconds
 * @property {Object} loading - Loading states
 * @property {boolean} loading.scan - Whether scan is loading
 * @property {boolean} loading.import - Whether import is loading
 * @property {boolean} loading.export - Whether export is loading
 * @property {boolean} dragOver - Whether dragging over container
 * @property {Object} filters - Filter states
 * @property {string} filters.quality - Quality filter
 * @property {string} filters.type - Type filter
 * @property {number} filters.minSize - Minimum size filter
 * @property {number} filters.maxSize - Maximum size filter
 * @property {string} filters.searchTerm - Search term filter
 * @property {string} filters.year - Year filter
 * @property {string} filters.hasEpisode - Episode filter
 * @property {SearchOptions} searchOptions - Search options
 * @property {UIState} ui - UI state
 * @property {string} [sortBy] - Sort field
 * @property {string} [sortOrder] - Sort order
 * @property {string[]} [errors] - Error messages
 */

/** @type {Store} */
const initialState = {
    videos: [],
    scanning: false,
    retryCount: 0,
    maxRetries: 3,
    timeoutMs: 5000,
    loading: {
        scan: false,
        import: false,
        export: false
    },
    dragOver: false,
    filters: {
        quality: 'all',
        type: 'all',
        minSize: 0,
        maxSize: Infinity,
        searchTerm: '',
        year: 'all',
        hasEpisode: 'all'
    },
    searchOptions: {
        recursive: true,
        maxDepth: 10,
        skipExternal: true
    },
    ui: {
        elements: /** @type {UIElements} */ ({
            container: null,
            scanBtn: null,
            generateBtn: null,
            clearBtn: null,
            exportBtn: null,
            importBtn: null,
            recursiveCheckbox: null,
            skipExternalCheckbox: null,
            maxDepthInput: null,
            console: null,
            results: null
        })
    },
    sortBy: 'name',
    sortOrder: 'asc',
    errors: []
};

/**
 * Creates a store for state management
 * @param {Store} initialState - Initial state
 * @returns {Store} Store instance
 */
const createStore = (initialState) => {
    /** @type {Set<(state: Store) => void>} */
    const listeners = new Set();
    /** @type {Store} */
    let state = initialState;

    return {
        /**
         * Get current state
         * @returns {Store} Current state
         */
        getState: () => state,

        /**
         * Update state
         * @param {Partial<Store>} newState - New state to merge
         */
        setState: (newState) => {
            state = { ...state, ...newState };
            listeners.forEach(listener => listener(state));
        },

        /**
         * Subscribe to state changes
         * @param {(state: Store) => void} listener - State change listener
         * @returns {() => void} Unsubscribe function
         */
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

// Create store with initial state
const store = createStore(initialState);

// Subscribe to state changes for UI updates
store.subscribe((state) => {
    updateResults();
    updateButtons();
    updateStats();
    updateLoadingUI();
    savePreferences();
});

(function() {
    'use strict';

    // Constants
    const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'm4v', 'mov', 'wmv', 'flv', 'webm', 'mpeg', 'mpg'];
    const QUALITY_PATTERNS = {
        '4K': /\b(4k|2160p|uhd)\b/i,
        '1080p': /\b(1080p|1080i|fhd)\b/i,
        '720p': /\b(720p|720i|hd)\b/i,
        '480p': /\b(480p|480i|sd)\b/i
    };
    const SIZE_UNITS = {
        B: 1,
        KB: 1024,
        MB: 1024 * 1024,
        GB: 1024 * 1024 * 1024,
        TB: 1024 * 1024 * 1024 * 1024
    };

    // Smart filename parsing
    function parseFilename(filename) {
        // Remove extension
        const name = filename.replace(/\.[^/.]+$/, '');
        
        // Detect quality
        let quality = 'Unknown';
        for (const [q, pattern] of Object.entries(QUALITY_PATTERNS)) {
            if (pattern.test(name)) {
                quality = q;
                break;
            }
        }

        // Extract year if present
        const yearMatch = name.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;

        // Extract season/episode if present
        const episodeMatch = name.match(/S(\d{1,2})E(\d{1,2})/i);
        const season = episodeMatch ? parseInt(episodeMatch[1]) : null;
        const episode = episodeMatch ? parseInt(episodeMatch[2]) : null;

        // Clean title
        let title = name
            .replace(/\b(19|20)\d{2}\b/, '') // Remove year
            .replace(/S\d{1,2}E\d{1,2}/i, '') // Remove episode info
            .replace(/\b(4k|2160p|1080p|720p|480p|uhd|fhd|hd|sd)\b/i, '') // Remove quality
            .replace(/\b(x264|x265|hevc|aac|ac3)\b/i, '') // Remove codec info
            .replace(/[._-]/g, ' ') // Replace separators with spaces
            .replace(/\s+/g, ' ') // Remove multiple spaces
            .trim();

        return {
            title,
            year,
            season,
            episode,
            quality
        };
    }

    // Utility Functions
    function log(message, type = 'info') {
        const console = store.getState().ui.elements.console;
        if (!console) return;

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
        
        console.appendChild(entry);
        console.scrollTop = console.scrollHeight;

        // Keep only last 1000 log entries to prevent memory issues
        while (console.children.length > 1000) {
            console.removeChild(console.firstChild);
        }
    }

    // Cache frequently accessed DOM elements
    function cacheElements() {
        const elements = /** @type {UIElements} */ ({
            container: document.getElementById('mm-container'),
            console: document.getElementById('mm-console'),
            results: document.getElementById('mm-results'),
            totalCount: document.getElementById('mm-total-count'),
            filteredCount: document.getElementById('mm-filtered-count'),
            totalSize: document.getElementById('mm-total-size'),
            searchInput: document.getElementById('mm-search'),
            qualityFilter: document.getElementById('mm-quality-filter'),
            typeFilter: document.getElementById('mm-type-filter'),
            yearFilter: document.getElementById('mm-year-filter'),
            sortBy: document.getElementById('mm-sort-by'),
            sortOrder: document.getElementById('mm-sort-order'),
            scanBtn: document.getElementById('mm-scan-btn'),
            generateBtn: document.getElementById('mm-generate-btn'),
            clearBtn: document.getElementById('mm-clear-btn')
        });

        updateState({ ui: { elements } });
        return elements;
    }

    // Initialize ResizeObserver for dynamic UI updates
    function initializeResizeObserver() {
        if (store.getState().ui.resizeObserver) {
            store.getState().ui.resizeObserver.disconnect();
        }

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                updateUILayout(entry.contentRect);
            }
        });

        if (store.getState().ui.elements.container) {
            resizeObserver.observe(store.getState().ui.elements.container);
        }

        updateState({ ui: { resizeObserver } });
    }

    // Update UI layout based on container size
    function updateUILayout(contentRect) {
        updateState({
            ui: {
                containerHeight: contentRect.height,
                visibleItems: Math.ceil(contentRect.height / store.getState().ui.itemHeight) + 2 // Add buffer
            }
        });
        updateResults();
    }

    // Virtual scrolling implementation
    function virtualizeResults(filtered) {
        const { scrollPosition, itemHeight, visibleItems } = store.getState().ui;
        
        // Calculate visible range
        const startIndex = Math.max(0, Math.floor(scrollPosition / itemHeight) - 1);
        const endIndex = Math.min(filtered.length, startIndex + visibleItems);
        
        // Create placeholder for total scroll height
        const totalHeight = filtered.length * itemHeight;
        const visibleItemsHtml = filtered.slice(startIndex, endIndex).map((video, index) => `
            <div class="video-item" style="position: absolute; top: ${(startIndex + index) * itemHeight}px; left: 0; right: 0;">
                <div class="video-title">
                    ${video.title}
                    ${video.year ? `<span class="video-year">(${video.year})</span>` : ''}
                    ${video.season !== null ? `<span class="video-episode">S${video.season.toString().padStart(2, '0')}E${video.episode.toString().padStart(2, '0')}</span>` : ''}
                </div>
                <div class="video-meta">
                    <span class="video-quality">${video.quality}</span>
                    <span class="video-size">${formatFileSize(video.size)}</span>
                </div>
                <div class="video-url">${video.url}</div>
            </div>
        `).join('');
        
        // Generate HTML with proper offsets
        const html = `
            <div class="virtual-scroll-container" style="height: ${totalHeight}px; position: relative;">
                ${visibleItemsHtml}
            </div>
        `;
        
        return html;
    }

    // Throttle scroll handler
    const handleScroll = throttle((e) => {
        const container = e.target;
        updateState({ ui: { scrollPosition: container.scrollTop } });
        updateResults();
    }, 16); // ~60fps

    // Utility function for throttling
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // UI Creation
    function createInterface() {
        const container = document.createElement('div');
        container.id = 'mm-container';
        container.innerHTML = `
            <div id="mm-header">
                <h2>MediaMagnet</h2>
                <div id="mm-controls">
                    <button id="mm-minimize">_</button>
                    <button id="mm-close">×</button>
                </div>
            </div>
            <div id="mm-content">
                <div id="mm-tabs">
                    <button class="mm-tab active" data-tab="scanner">Scanner</button>
                    <button class="mm-tab" data-tab="results">Results</button>
                    <button class="mm-tab" data-tab="settings">Settings</button>
                </div>
                <div id="mm-tab-content">
                    <div id="mm-scanner-tab" class="mm-tab-pane active">
                        <div class="mm-search-box">
                            <input type="text" id="mm-search" placeholder="Search videos...">
                        </div>
                        <div class="mm-filters">
                            <div class="mm-filter-group">
                                <label>Quality:</label>
                                <select id="mm-quality-filter">
                                    <option value="all">All Qualities</option>
                                    <option value="4K">4K</option>
                                    <option value="1080p">1080p</option>
                                    <option value="720p">720p</option>
                                    <option value="480p">480p</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div class="mm-filter-group">
                                <label>Type:</label>
                                <select id="mm-type-filter">
                                    <option value="all">All Types</option>
                                    <option value="movie">Movies</option>
                                    <option value="tv">TV Shows</option>
                                </select>
                            </div>
                            <div class="mm-filter-group">
                                <label>Year:</label>
                                <select id="mm-year-filter">
                                    <option value="all">All Years</option>
                                </select>
                            </div>
                        </div>
                        <div class="mm-filters">
                            <div class="mm-filter-group">
                                <label>Min Size:</label>
                                <div class="mm-size-input">
                                    <input type="number" id="mm-min-size" min="0" step="0.1">
                                    <select id="mm-min-size-unit">
                                        <option value="MB">MB</option>
                                        <option value="GB">GB</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mm-filter-group">
                                <label>Max Size:</label>
                                <div class="mm-size-input">
                                    <input type="number" id="mm-max-size" min="0" step="0.1">
                                    <select id="mm-max-size-unit">
                                        <option value="MB">MB</option>
                                        <option value="GB">GB</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mm-filter-group">
                                <label>Sort By:</label>
                                <div class="mm-sort-controls">
                                    <select id="mm-sort-by">
                                        <option value="name">Name</option>
                                        <option value="quality">Quality</option>
                                        <option value="size">Size</option>
                                        <option value="year">Year</option>
                                    </select>
                                    <button id="mm-sort-order" title="Toggle sort order">↓</button>
                                </div>
                            </div>
                        </div>
                        <div class="mm-button-group">
                            <button id="mm-scan-btn">Scan Directory</button>
                            <button id="mm-generate-btn" disabled>Generate M3U</button>
                            <button id="mm-clear-btn">Clear Results</button>
                        </div>
                        <div class="mm-stats">
                            <div>Total Videos: <span id="mm-total-count">0</span></div>
                            <div>Filtered: <span id="mm-filtered-count">0</span></div>
                            <div>Total Size: <span id="mm-total-size">0 MB</span></div>
                        </div>
                    </div>
                    <div id="mm-results-tab" class="mm-tab-pane">
                        <div id="mm-results"></div>
                    </div>
                    <div id="mm-settings-tab" class="mm-tab-pane">
                        <div class="mm-settings-group">
                            <h3>Search Options</h3>
                            <label class="mm-checkbox">
                                <input type="checkbox" id="mm-recursive" checked>
                                Enable recursive search
                            </label>
                            <div class="mm-setting-item">
                                <label>Maximum search depth:</label>
                                <input type="number" id="mm-max-depth" value="10" min="1" max="100">
                            </div>
                            <label class="mm-checkbox">
                                <input type="checkbox" id="mm-skip-external" checked>
                                Skip external links
                            </label>
                        </div>
                        <div class="mm-settings-group">
                            <h3>Display Options</h3>
                            <label class="mm-checkbox">
                                <input type="checkbox" id="mm-show-path" checked>
                                Show full path
                            </label>
                            <label class="mm-checkbox">
                                <input type="checkbox" id="mm-group-episodes" checked>
                                Group TV episodes
                            </label>
                        </div>
                        <div class="mm-settings-group">
                            <h3>Settings Management</h3>
                            <div class="mm-button-group">
                                <button id="mm-export-btn">Export Settings</button>
                                <button id="mm-import-btn">Import Settings</button>
                            </div>
                            <div class="mm-shortcuts-list">
                                <h4>Keyboard Shortcuts</h4>
                                ${Object.entries(store.getState().ui.shortcuts).map(([name, shortcut]) => `
                                    <div class="mm-shortcut">
                                        <span class="mm-shortcut-combo">
                                            ${[
                                                shortcut.ctrlKey && 'Ctrl',
                                                shortcut.shiftKey && 'Shift',
                                                shortcut.key.toUpperCase()
                                            ].filter(Boolean).join('+')}
                                        </span>
                                        <span class="mm-shortcut-desc">${shortcut.description}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div id="mm-console-wrapper">
                    <div id="mm-console-header">
                        <span>Console</span>
                        <button id="mm-clear-console">Clear</button>
                    </div>
                    <div id="mm-console"></div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        makeDraggable(container);
        
        // Initialize optimizations
        cacheElements();
        initializeResizeObserver();
        initializeEventListeners();
        populateYearFilter();
    }

    // Modified updateResults function to use virtual scrolling
    function updateResults() {
        const { elements } = store.getState().ui;
        if (!elements.results) return;

        const filtered = getFilteredAndSortedVideos();
        elements.results.innerHTML = virtualizeResults(filtered);

        // Update stats
        if (elements.totalCount) elements.totalCount.textContent = store.getState().videos.length;
        if (elements.filteredCount) elements.filteredCount.textContent = filtered.length;
        if (elements.totalSize) {
            const bytes = store.getState().videos.reduce((sum, video) => sum + (video.size || 0), 0);
            elements.totalSize.textContent = formatFileSize(bytes);
        }
    }

    // Event Listeners
    function initializeEventListeners() {
        const { elements } = store.getState().ui;

        // Scroll handler for virtual scrolling
        if (elements.results) {
            elements.results.addEventListener('scroll', handleScroll);
        }

        // Window controls
        document.getElementById('mm-minimize')?.addEventListener('click', () => {
            elements.container?.style.display = 'none';
        });

        document.getElementById('mm-close')?.addEventListener('click', () => {
            elements.container?.remove();
            if (store.getState().ui.resizeObserver) {
                store.getState().ui.resizeObserver.disconnect();
            }
        });

        // Clear console
        document.getElementById('mm-clear-console')?.addEventListener('click', () => {
            elements.console?.innerHTML = '';
        });

        // Tabs
        document.querySelectorAll('.mm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.mm-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.mm-tab-pane').forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`mm-${tab.dataset.tab}-tab`)?.classList.add('active');
            });
        });

        // Search and filter handlers
        elements.searchInput?.addEventListener('input', debounce((/** @type {Event} */ e) => {
            updateState({ filters: { searchTerm: /** @type {HTMLInputElement} */ (e.target).value.toLowerCase() } });
            updateResults();
        }, 300));

        ['quality', 'type', 'year'].forEach(filter => {
            elements[`${filter}Filter`]?.addEventListener('change', (/** @type {Event} */ e) => {
                updateState({ filters: { [filter]: /** @type {HTMLSelectElement} */ (e.target).value } });
                updateResults();
            });
        });

        // Size filter handlers
        ['min', 'max'].forEach(type => {
            const sizeInput = elements[`${type}Size`];
            const unitSelect = elements[`${type}SizeUnit`];
            
            const updateSizeFilter = () => {
                const value = parseFloat(/** @type {HTMLInputElement} */ (sizeInput).value);
                const unit = /** @type {HTMLSelectElement} */ (unitSelect).value;
                if (!isNaN(value)) {
                    updateState({ filters: { [`${type}Size`]: value * SIZE_UNITS[unit] } });
                    updateResults();
                }
            };

            sizeInput?.addEventListener('input', updateSizeFilter);
            unitSelect?.addEventListener('change', updateSizeFilter);
        });

        // Sort controls
        elements.sortBy?.addEventListener('change', (/** @type {Event} */ e) => {
            updateState({ sortBy: /** @type {HTMLSelectElement} */ (e.target).value });
            updateResults();
        });

        elements.sortOrder?.addEventListener('click', (/** @type {Event} */ e) => {
            updateState({ sortOrder: store.getState().sortOrder === 'asc' ? 'desc' : 'asc' });
            /** @type {HTMLButtonElement} */ (e.target).textContent = store.getState().sortOrder === 'asc' ? '↓' : '↑';
            updateResults();
        });

        // Main buttons
        elements.scanBtn?.addEventListener('click', () => {
            scanDirectory().catch(error => log(error.message, 'error'));
        });

        elements.generateBtn?.addEventListener('click', () => {
            generateM3U().catch(error => log(error.message, 'error'));
        });

        // Settings handlers
        document.getElementById('mm-recursive')?.addEventListener('change', handleRecursiveChange);
        document.getElementById('mm-max-depth')?.addEventListener('change', handleMaxDepthChange);
        document.getElementById('mm-skip-external')?.addEventListener('change', handleSkipExternalChange);

        // Clear results
        elements.clearBtn?.addEventListener('click', () => {
            updateState({ videos: [] });
            updateResults();
            updateStats();
        });

        // Export settings
        document.getElementById('mm-export-btn')?.addEventListener('click', exportSettings);

        // Import settings
        document.getElementById('mm-import-btn')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (/** @type {Event} */ e) => {
                const files = /** @type {HTMLInputElement} */ (e.target).files;
                if (files?.length > 0) {
                    importSettings(files[0]);
                }
            };
            input.click();
        });
    }

    // Helper Functions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function populateYearFilter() {
        const yearSelect = /** @type {HTMLSelectElement} */ (document.getElementById('mm-year-filter'));
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 1900; year--) {
            const option = document.createElement('option');
            option.value = year.toString();
            option.textContent = year.toString();
            yearSelect.appendChild(option);
        }
    }

    async function scanDirectory(depth = 0) {
        if (store.getState().scanning) {
            log('Scan already in progress', 'warning');
            return;
        }

        try {
            updateState({ scanning: true });
            updateState({ errors: { scan: [] } });
            updateButtons();

            const frames = document.querySelectorAll('frame, iframe');
            log(`Found ${frames.length} frames to scan`);

            for (const frame of frames) {
                try {
                    if (!store.getState().searchOptions.skipExternal || isSameOrigin(frame.src)) {
                        await scanFrame(frame, depth);
                    }
                } catch (frameError) {
                    updateState({ errors: { scan: [...store.getState().errors.scan, { type: 'frame', url: frame.src, error: frameError.message }] } });
                    log(`Failed to scan frame ${frame.src}: ${frameError.message}`, 'error');
                }
            }

            // Scan the main document
            await scanDocument(document, depth);
            
            if (store.getState().errors.scan.length > 0) {
                log(`Scan completed with ${store.getState().errors.scan.length} errors`, 'warning');
            } else {
                log('Scan completed successfully');
            }

        } catch (error) {
            updateState({ errors: { scan: [...store.getState().errors.scan, { type: 'global', error: error.message }] } });
            log(`Scan failed: ${error.message}`, 'error');

            // Implement retry mechanism
            if (store.getState().retryCount < store.getState().maxRetries) {
                updateState({ retryCount: store.getState().retryCount + 1 });
                log(`Retrying scan (attempt ${store.getState().retryCount}/${store.getState().maxRetries})...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 1000 * store.getState().retryCount));
                return scanDirectory(depth);
            } else {
                log('Max retry attempts reached', 'error');
            }
        } finally {
            updateState({ scanning: false });
            updateState({ retryCount: 0 });
            updateButtons();
        }
    }

    // Fetch with timeout and error handling
    async function fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = options.timeout || store.getState().timeoutMs;
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }

    // Enhanced file size fetching with retry
    async function getFileSize(url) {
        for (let attempt = 1; attempt <= store.getState().maxRetries; attempt++) {
            try {
                const response = await fetchWithTimeout(url, {
                    method: 'HEAD',
                    timeout: store.getState().timeoutMs
                });

                const size = response.headers.get('content-length');
                return size ? parseInt(size, 10) : null;
            } catch (error) {
                updateState({ errors: { network: [...store.getState().errors.network, { type: 'fileSize', url, attempt, error: error.message }] } });

                if (attempt === store.getState().maxRetries) {
                    log(`Failed to get file size for ${url}: ${error.message}`, 'error');
                    return null;
                }

                // Exponential backoff
                await new Promise(resolve => 
                    setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000))
                );
            }
        }
    }

    // Safe parsing with error handling
    function safeParseYear(str) {
        try {
            const year = parseInt(str.match(/\b(19|20)\d{2}\b/)?.[0]);
            return isNaN(year) ? null : year;
        } catch (error) {
            updateState({ errors: { parse: [...store.getState().errors.parse, { type: 'year', input: str, error: error.message }] } });
            return null;
        }
    }

    function safeParseEpisode(str) {
        try {
            const match = str.match(/S(\d{1,2})E(\d{1,2})/i);
            if (!match) return { season: null, episode: null };
            return {
                season: parseInt(match[1]),
                episode: parseInt(match[2])
            };
        } catch (error) {
            updateState({ errors: { parse: [...store.getState().errors.parse, { type: 'episode', input: str, error: error.message }] } });
            return { season: null, episode: null };
        }
    }

    async function scanFrame(frame, depth = 0) {
        if (depth > store.getState().searchOptions.maxDepth) return [];

        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        const results = await scanDocument(frameDoc, depth + 1);
        return results;
    }

    async function scanDocument(doc, depth = 0) {
        const results = [];

        // Process links in current document
        const links = Array.from(doc.getElementsByTagName('a'));
        for (const link of links) {
            try {
                const href = link.href || link.getAttribute('href');
                if (!href) continue;

                const url = new URL(href, window.location.href);
                
                // Skip external links if option is enabled
                if (store.getState().searchOptions.skipExternal && url.host !== window.location.host) {
                    continue;
                }

                const ext = url.pathname.split('.').pop().toLowerCase();
                if (VIDEO_EXTENSIONS.includes(ext)) {
                    const filename = link.textContent.trim() || decodeURIComponent(url.pathname.split('/').pop());
                    const info = parseFilename(filename);
                    
                    let size = null;
                    try {
                        size = await getFileSize(url.href);
                    } catch (error) {
                        // Ignore size fetch errors
                    }

                    results.push({
                        url: url.href,
                        filename,
                        path: url.pathname,
                        size,
                        ...info
                    });
                }
            } catch (error) {
                continue;
            }
        }

        // Recursively process frames if recursive search is enabled
        if (store.getState().searchOptions.recursive) {
            const frames = Array.from(doc.getElementsByTagName('frame'))
                .concat(Array.from(doc.getElementsByTagName('iframe')));
            
            for (const frame of frames) {
                try {
                    const frameResults = await scanFrame(frame, depth);
                    results.push(...frameResults);
                } catch (error) {
                    // Skip inaccessible frames
                    continue;
                }
            }
        }

        return results;
    }

    async function generateM3U() {
        try {
            log('Generating M3U playlist...');
            
            const content = ['#EXTM3U'];
            store.getState().videos.forEach(video => {
                content.push(`#EXTINF:-1,${video.filename}`);
                content.push(video.url);
            });

            const blob = new Blob([content.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'playlist.m3u';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            log('Playlist generated successfully', 'success');
        } catch (error) {
            log(`M3U generation error: ${error.message}`, 'error');
        }
    }

    // Helper Functions
    function formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    function updateStats() {
        const { elements } = store.getState().ui;
        const totalCount = elements.totalCount;
        const totalSize = elements.totalSize;
        const filteredCount = elements.filteredCount;

        if (totalCount) totalCount.textContent = store.getState().videos.length;
        if (totalSize) {
            const bytes = store.getState().videos.reduce((sum, video) => sum + (video.size || 0), 0);
            totalSize.textContent = formatFileSize(bytes);
        }
        if (filteredCount) {
            const filtered = getFilteredAndSortedVideos();
            filteredCount.textContent = filtered.length;
        }
    }

    function getFilteredAndSortedVideos() {
        let filtered = store.getState().videos;

        // Apply text search
        if (store.getState().filters.searchTerm) {
            const terms = store.getState().filters.searchTerm.split(' ').filter(t => t);
            filtered = filtered.filter(video => 
                terms.every(term => 
                    video.title.toLowerCase().includes(term) ||
                    video.filename.toLowerCase().includes(term)
                )
            );
        }

        // Apply quality filter
        if (store.getState().filters.quality !== 'all') {
            filtered = filtered.filter(video => video.quality === store.getState().filters.quality);
        }

        // Apply type filter
        if (store.getState().filters.type !== 'all') {
            filtered = filtered.filter(video => 
                store.getState().filters.type === 'tv' ? video.season !== null : video.season === null
            );
        }

        // Apply year filter
        if (store.getState().filters.year !== 'all') {
            filtered = filtered.filter(video => video.year === store.getState().filters.year);
        }

        // Apply size filters
        filtered = filtered.filter(video => {
            const size = video.size || 0;
            return size >= store.getState().filters.minSize && size <= store.getState().filters.maxSize;
        });

        // Apply sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (store.getState().sortBy) {
                case 'name':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'quality':
                    const qualityOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
                    comparison = qualityOrder[b.quality] - qualityOrder[a.quality];
                    break;
                case 'size':
                    comparison = (b.size || 0) - (a.size || 0);
                    break;
                case 'year':
                    comparison = (b.year || 0) - (a.year || 0);
                    break;
            }
            return store.getState().sortOrder === 'asc' ? comparison : -comparison;
        });

        return filtered;
    }

    // UI Updates
    function updateButtons() {
        const { elements } = store.getState().ui;
        const scanBtn = elements.scanBtn;
        const generateBtn = elements.generateBtn;

        if (scanBtn) scanBtn.disabled = store.getState().scanning;
        if (generateBtn) generateBtn.disabled = store.getState().videos.length === 0;
    }

    // Draggable Functionality
    function makeDraggable(element) {
        const header = element.querySelector('#mm-header');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === header) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                element.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        }

        function dragEnd() {
            isDragging = false;
        }
    }

    // Loading indicator management
    function showLoading(operation) {
        updateState({ loading: { ...getState().loading, [operation]: true } });
        updateLoadingUI();
    }

    function hideLoading(operation) {
        updateState({ loading: { ...getState().loading, [operation]: false } });
        updateLoadingUI();
    }

    function updateLoadingUI() {
        const state = getState();
        const { elements } = state.ui;
        
        // Update loading spinners
        Object.entries(state.loading).forEach(([operation, isLoading]) => {
            const button = elements[`${operation}Btn`];
            if (button instanceof HTMLButtonElement) {
                if (isLoading) {
                    button.classList.add('loading');
                    button.disabled = true;
                } else {
                    button.classList.remove('loading');
                    button.disabled = false;
                }
            }
        });

        // Update main loading overlay
        const container = elements.container;
        if (!(container instanceof HTMLElement)) return;

        let overlay = container.querySelector('.mm-loading-overlay');
        if (Object.values(state.loading).some(Boolean)) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'mm-loading-overlay';
                overlay.innerHTML = `
                    <div class="mm-loader"></div>
                    <div class="mm-loading-text">Processing...</div>
                `;
                container.appendChild(overlay);
            }
        } else if (overlay) {
            overlay.remove();
        }
    }

    // Tooltip management
    function addTooltips() {
        const tooltips = {
            'mm-scan-btn': 'Scan current page for video files',
            'mm-generate-btn': 'Generate M3U playlist from found videos',
            'mm-clear-btn': 'Clear all found videos',
            'mm-export-btn': 'Export current settings',
            'mm-import-btn': 'Import settings from file',
            'mm-quality-filter': 'Filter videos by quality',
            'mm-type-filter': 'Filter by movie or TV show',
            'mm-year-filter': 'Filter by release year',
            'mm-search': 'Search video titles',
            'mm-recursive': 'Enable recursive frame scanning',
            'mm-skip-external': 'Skip external domain links',
            'mm-max-depth': 'Maximum recursive search depth'
        };

        Object.entries(tooltips).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.setAttribute('title', text);
                
                // Add aria-label for accessibility
                element.setAttribute('aria-label', text);
                
                // Add tooltip div for custom styling
                const tooltip = document.createElement('div');
                tooltip.className = 'mm-tooltip';
                tooltip.textContent = text;
                
                element.addEventListener('mouseenter', () => {
                    const rect = element.getBoundingClientRect();
                    tooltip.style.top = `${rect.bottom + 5}px`;
                    tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
                    document.body.appendChild(tooltip);
                });
                
                element.addEventListener('mouseleave', () => {
                    tooltip.remove();
                });
            }
        });
    }

    // Drag and drop handling
    function initializeDragAndDrop() {
        const { elements } = getState().ui;
        const container = elements.container;
        if (!container) return;

        const dropZone = document.createElement('div');
        dropZone.className = 'mm-drop-zone';
        dropZone.innerHTML = `
            <div class="mm-drop-zone-content">
                <div class="mm-drop-icon">📁</div>
                <div class="mm-drop-text">Drop files here</div>
                <div class="mm-drop-subtext">Import settings or M3U files</div>
            </div>
        `;
        container.appendChild(dropZone);

        // Drag events
        container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            updateState({ dragOver: true });
            container.classList.add('drag-over');
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!container.contains(e.relatedTarget)) {
                updateState({ dragOver: false });
                container.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            updateState({ dragOver: false });
            container.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;

            showLoading('import');
            try {
                for (const file of files) {
                    if (file.name.endsWith('.json')) {
                        await importSettings(file);
                    } else if (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8')) {
                        await importM3U(file);
                    } else {
                        log(`Unsupported file type: ${file.name}`, 'error');
                    }
                }
            } catch (error) {
                log(`Failed to process dropped files: ${error.message}`, 'error');
            } finally {
                hideLoading('import');
            }
        });
    }

    // Import M3U playlist
    async function importM3U(file) {
        const text = await file.text();
        const lines = text.split('\n');
        const videos = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                const url = lines[++i]?.trim();
                if (url) {
                    const filename = decodeURIComponent(url.split('/').pop());
                    const info = parseFilename(filename);
                    videos.push({
                        url,
                        filename,
                        path: new URL(url).pathname,
                        size: null,
                        ...info
                    });
                }
            } else if (line && !line.startsWith('#')) {
                const url = line;
                const filename = decodeURIComponent(url.split('/').pop());
                const info = parseFilename(filename);
                videos.push({
                    url,
                    filename,
                    path: new URL(url).pathname,
                    size: null,
                    ...info
                });
            }
        }

        if (videos.length > 0) {
            updateState({ videos: [...getState().videos, ...videos] });
            log(`Imported ${videos.length} videos from M3U playlist`, 'success');
            updateResults();
        }
    }

    // Styles
    GM_addStyle(`
        :root {
            --bg-primary: rgba(18, 18, 18, 0.95);
            --bg-secondary: rgba(28, 28, 28, 0.95);
            --bg-tertiary: rgba(35, 35, 35, 0.95);
            --accent: #ff69b4;
            --accent-dark: #d44a91;
            --text-primary: #ffffff;
            --text-secondary: #b0b0b0;
            --border-color: rgba(255, 255, 255, 0.1);
            --hover-bg: rgba(255, 105, 180, 0.1);
        }

        #mm-launcher {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 48px;
            height: 48px;
            background: var(--accent);
            border-radius: 50%;
            cursor: pointer;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(255, 105, 180, 0.3);
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        }

        #mm-launcher:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(255, 105, 180, 0.4);
        }

        #mm-launcher svg {
            width: 24px;
            height: 24px;
            color: white;
        }

        #mm-container {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            background: var(--bg-primary);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 999998;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            max-height: 80vh;
            border: 1px solid var(--border-color);
            backdrop-filter: blur(10px);
            color: var(--text-primary);
        }

        #mm-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 12px 12px 0 0;
            border-bottom: 1px solid var(--border-color);
        }

        #mm-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 500;
        }

        #mm-controls button {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px 8px;
            font-size: 16px;
            transition: color 0.2s ease;
        }

        #mm-controls button:hover {
            color: var(--accent);
        }

        #mm-content {
            padding: 15px;
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            min-height: 0;
        }

        #mm-tabs {
            display: flex;
            gap: 5px;
            margin-bottom: 15px;
            padding: 5px;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .mm-tab {
            padding: 8px 15px;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
            flex: 1;
            font-size: 14px;
        }

        .mm-tab:hover {
            color: var(--text-primary);
            background: var(--hover-bg);
        }

        .mm-tab.active {
            background: var(--accent);
            color: white;
        }

        .mm-search-box input {
            width: 100%;
            padding: 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .mm-search-box input:focus {
            border-color: var(--accent);
            outline: none;
        }

        .mm-filters {
            margin-bottom: 15px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .mm-filter-group {
            flex: 1;
            min-width: 150px;
        }

        .mm-filter-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--text-secondary);
            font-size: 12px;
        }

        .mm-filter-group select,
        .mm-size-input input,
        .mm-size-input select {
            width: 100%;
            padding: 8px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .mm-filter-group select:focus,
        .mm-size-input input:focus,
        .mm-size-input select:focus {
            border-color: var(--accent);
            outline: none;
        }

        .mm-button-group {
            display: flex;
            gap: 10px;
        }

        .mm-button-group button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: var(--accent);
            color: white;
            cursor: pointer;
            flex: 1;
            font-size: 14px;
            transition: all 0.2s ease;
            text-transform: uppercase;
            font-weight: 500;
            letter-spacing: 0.5px;
        }

        .mm-button-group button:hover {
            background: var(--accent-dark);
            transform: translateY(-1px);
        }

        .mm-button-group button:disabled {
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            cursor: not-allowed;
            transform: none;
        }

        .mm-stats {
            margin-top: 15px;
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            display: flex;
            justify-content: space-around;
            color: var(--text-secondary);
            font-size: 13px;
        }

        .mm-stats span {
            color: var(--accent);
            font-weight: 500;
        }

        #mm-console-wrapper {
            margin-top: auto;
            border-top: 1px solid var(--border-color);
            flex-shrink: 0;
            height: 150px;
            display: flex;
            flex-direction: column;
        }

        #mm-console-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            color: var(--text-secondary);
        }

        #mm-clear-console {
            padding: 4px 8px;
            font-size: 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        #mm-clear-console:hover {
            border-color: var(--accent);
            color: var(--accent);
        }

        #mm-console {
            flex-grow: 1;
            overflow-y: auto;
            background: var(--bg-tertiary);
            padding: 10px;
            font-family: 'Consolas', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: var(--text-secondary);
        }

        .log-entry {
            margin-bottom: 4px;
            padding: 4px 6px;
            border-radius: 4px;
            background: var(--bg-primary);
        }

        .log-entry.error {
            color: #ff4444;
            background: rgba(255, 68, 68, 0.1);
        }

        .log-entry.warning {
            color: #ffbb33;
            background: rgba(255, 187, 51, 0.1);
        }

        .log-entry.success {
            color: #00C851;
            background: rgba(0, 200, 81, 0.1);
        }

        .video-item {
            background: var(--bg-secondary);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }

        .video-item:hover {
            border-color: var(--accent);
            transform: translateX(2px);
        }

        .video-title {
            font-weight: 500;
            color: var(--text-primary);
            margin-bottom: 8px;
        }

        .video-meta {
            display: flex;
            gap: 10px;
            margin: 8px 0;
            font-size: 12px;
            flex-wrap: wrap;
        }

        .video-quality {
            background: var(--accent);
            color: white;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 500;
        }

        .video-size {
            color: var(--text-secondary);
        }

        .video-year {
            color: var(--text-secondary);
            background: var(--bg-tertiary);
            padding: 3px 8px;
            border-radius: 4px;
        }

        .video-episode {
            background: var(--accent);
            color: white;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 500;
        }

        .video-url {
            font-size: 12px;
            color: var(--text-secondary);
            word-break: break-all;
            padding: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
        }

        .mm-settings-group {
            background: var(--bg-secondary);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }

        .mm-settings-group h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: var(--text-primary);
            font-weight: 500;
        }

        .mm-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 8px 0;
            cursor: pointer;
            color: var(--text-secondary);
        }

        .mm-checkbox input {
            width: 16px;
            height: 16px;
            accent-color: var(--accent);
        }

        .mm-setting-item {
            margin: 12px 0;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .mm-setting-item input[type="number"] {
            width: 70px;
            padding: 6px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-primary);
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-tertiary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--accent);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent-dark);
        }

        /* Custom Select Styling */
        select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ff69b4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            padding-right: 30px !important;
        }

        .mm-shortcuts-list {
            margin-top: 15px;
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .mm-shortcut {
            display: flex;
            align-items: center;
            margin: 8px 0;
        }

        .mm-shortcut-combo {
            background: var(--bg-secondary);
            padding: 4px 8px;
            border-radius: 4px;
            margin-right: 10px;
            font-family: monospace;
            color: var(--accent-color);
        }

        .mm-shortcut-desc {
            color: var(--text-secondary);
        }

        .mm-loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .mm-loader {
            width: 40px;
            height: 40px;
            border: 3px solid var(--accent-color);
            border-top-color: transparent;
            border-radius: 50%;
            animation: mm-spin 1s linear infinite;
        }

        .mm-loading-text {
            color: var(--text-primary);
            margin-top: 10px;
            font-size: 14px;
        }

        @keyframes mm-spin {
            to { transform: rotate(360deg); }
        }

        .loading {
            position: relative;
            color: transparent !important;
        }

        .loading::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 16px;
            height: 16px;
            margin: -8px 0 0 -8px;
            border: 2px solid var(--accent-color);
            border-top-color: transparent;
            border-radius: 50%;
            animation: mm-spin 1s linear infinite;
        }

        .mm-tooltip {
            position: fixed;
            background: var(--bg-secondary);
            color: var(--text-primary);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            transform: translateX(-50%);
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
            max-width: 200px;
            white-space: normal;
        }

        .mm-tooltip::before {
            content: '';
            position: absolute;
            top: -5px;
            left: 50%;
            transform: translateX(-50%);
            border: 5px solid transparent;
            border-bottom-color: var(--border-color);
        }

        .mm-drop-zone {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .drag-over .mm-drop-zone {
            display: flex;
        }

        .mm-drop-zone-content {
            text-align: center;
            color: var(--text-primary);
        }

        .mm-drop-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }

        .mm-drop-text {
            font-size: 18px;
            margin-bottom: 5px;
        }

        .mm-drop-subtext {
            font-size: 14px;
            color: var(--text-secondary);
        }
    `);

    // Initialize
    function initialize() {
        loadPreferences();
        createLauncher();
        initializeKeyboardShortcuts();
        addTooltips();
        initializeDragAndDrop();
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})(); 

function isSameOrigin(url) {
    try {
        const urlObj = new URL(url, window.location.origin);
        return urlObj.origin === window.location.origin;
    } catch (error) {
        return false;
    }
}

function updateState(newState) {
    store.setState(newState);
}

function getState() {
    return store.getState();
}

/**
 * Updates the UI elements based on current loading state
 */
function updateLoadingUI() {
    const state = getState();
    const { elements } = state.ui;
    
    // Update loading spinners
    Object.entries(state.loading).forEach(([operation, isLoading]) => {
        const button = elements[`${operation}Btn`];
        if (button instanceof HTMLButtonElement) {
            if (isLoading) {
                button.classList.add('loading');
                button.disabled = true;
            } else {
                button.classList.remove('loading');
                button.disabled = false;
            }
        }
    });

    // Update main loading overlay
    const container = elements.container;
    if (!(container instanceof HTMLElement)) return;

    let overlay = container.querySelector('.mm-loading-overlay');
    if (Object.values(state.loading).some(Boolean)) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mm-loading-overlay';
            overlay.innerHTML = `
                <div class="mm-loader"></div>
                <div class="mm-loading-text">Processing...</div>
            `;
            container.appendChild(overlay);
        }
    } else if (overlay) {
        overlay.remove();
    }
}

// Event handlers
function handleRecursiveChange(e) {
    const target = e.target;
    if (!target) return;
    
    updateState({ searchOptions: { ...getState().searchOptions, recursive: target.checked } });
}

function handleMaxDepthChange(e) {
    const target = e.target;
    if (!target) return;
    
    updateState({ searchOptions: { ...getState().searchOptions, maxDepth: parseInt(target.value, 10) } });
}

function handleSkipExternalChange(e) {
    const target = e.target;
    if (!target) return;
    
    updateState({ searchOptions: { ...getState().searchOptions, skipExternal: target.checked } });
}

// UI updates
function updateResults() {
    const state = getState();
    const { elements } = state.ui;
    const container = elements.container;
    if (!(container instanceof HTMLElement)) return;

    const resultsDiv = container.querySelector('.mm-results');
    if (!resultsDiv) return;

    // Clear existing results
    resultsDiv.innerHTML = '';

    // Filter and sort videos
    const filteredVideos = filterVideos(state.videos);
    const sortedVideos = sortVideos(filteredVideos);

    // Create video elements
    sortedVideos.forEach(video => {
        const videoElement = createVideoElement(video);
        resultsDiv.appendChild(videoElement);
    });

    updateStats();
}

function updateButtons() {
    const state = getState();
    const { elements } = state.ui;
    
    // Update button states based on video count
    if (elements.generateBtn) {
        elements.generateBtn.disabled = state.videos.length === 0;
    }
    if (elements.clearBtn) {
        elements.clearBtn.disabled = state.videos.length === 0;
    }
}

function updateStats() {
    const state = getState();
    const { elements } = state.ui;
    const container = elements.container;
    if (!(container instanceof HTMLElement)) return;

    const statsDiv = container.querySelector('.mm-stats');
    if (!statsDiv) return;

    const filteredVideos = filterVideos(state.videos);
    statsDiv.textContent = `Found ${filteredVideos.length} videos`;
}

// Settings management
/**
 * @returns {Promise<void>}
 */
async function exportSettings() {
    const settings = {
        searchOptions: getState().searchOptions,
        filters: getState().filters
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    try {
        await GM_download({
            url,
            name: 'mediamagnet-settings.json',
            saveAs: true
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * @param {File} file
 * @returns {Promise<void>}
 */
async function importSettings(file) {
    try {
        const text = await file.text();
        const settings = JSON.parse(text);
        
        updateState({
            searchOptions: { ...getState().searchOptions, ...settings.searchOptions },
            filters: { ...getState().filters, ...settings.filters }
        });
        
        log('Settings imported successfully', 'success');
    } catch (error) {
        log(`Failed to import settings: ${error.message}`, 'error');
    }
}

/**
 * @param {Store} state
 * @returns {Video[]}
 */
function filterVideos(state) {
    return state.videos.filter(video => {
        const { filters } = state;
        
        if (filters.quality !== 'all' && video.quality !== filters.quality) return false;
        if (filters.type !== 'all' && video.type !== filters.type) return false;
        if (video.size !== null) {
            if (video.size < filters.minSize) return false;
            if (filters.maxSize !== Infinity && video.size > filters.maxSize) return false;
        }
        if (filters.year !== 'all' && video.year !== filters.year) return false;
        
        if (filters.searchTerm) {
            const searchLower = filters.searchTerm.toLowerCase();
            const filenameLower = video.filename.toLowerCase();
            if (!filenameLower.includes(searchLower)) return false;
        }
        
        return true;
    });
}

/**
 * @param {Video[]} videos
 * @returns {Video[]}
 */
function sortVideos(videos) {
    return [...videos].sort((a, b) => {
        return a.filename.localeCompare(b.filename);
    });
}

/**
 * @param {Video} video
 * @returns {HTMLElement}
 */
function createVideoElement(video) {
    const element = document.createElement('div');
    element.className = 'mm-video-item';
    element.dataset.url = video.url;
    
    const title = document.createElement('div');
    title.className = 'mm-video-title';
    title.textContent = video.filename;
    
    const info = document.createElement('div');
    info.className = 'mm-video-info';
    info.textContent = `${video.quality} | ${video.type} | ${video.year}`;
    
    if (video.size !== null) {
        const size = document.createElement('div');
        size.className = 'mm-video-size';
        size.textContent = formatSize(video.size);
        info.appendChild(size);
    }
    
    element.appendChild(title);
    element.appendChild(info);
    
    return element;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[MediaMagnet] [${type.toUpperCase()}] [${timestamp}] ${message}`);
}

/**
 * Save current preferences to GM storage
 */
function savePreferences() {
    const state = getState();
    const preferences = {
        searchOptions: state.searchOptions,
        filters: state.filters
    };
    GM_setValue('preferences', JSON.stringify(preferences));
}

/**
 * Load preferences from GM storage
 */
function loadPreferences() {
    const stored = GM_getValue('preferences');
    if (!stored) return;
    
    try {
        const preferences = JSON.parse(stored);
        updateState({
            searchOptions: { ...getState().searchOptions, ...preferences.searchOptions },
            filters: { ...getState().filters, ...preferences.filters }
        });
    } catch (error) {
        log(`Failed to load preferences: ${error.message}`, 'error');
    }
}

/**
 * Initialize keyboard shortcuts
 */
function initializeKeyboardShortcuts() {
    const shortcuts = [
        { key: 'Ctrl+M', description: 'Toggle interface', action: toggleInterface },
        { key: 'Ctrl+F', description: 'Focus search', action: focusSearch },
        { key: 'Ctrl+S', description: 'Start scan', action: startScan },
        { key: 'Ctrl+L', description: 'Clear results', action: clearResults },
        { key: 'Ctrl+Shift+E', description: 'Export settings', action: exportSettings },
        { key: 'Ctrl+Shift+I', description: 'Import settings', action: importSettings }
    ];

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey) return;
        
        const key = e.shiftKey ? `Ctrl+Shift+${e.key.toUpperCase()}` : `Ctrl+${e.key.toUpperCase()}`;
        const shortcut = shortcuts.find(s => s.key === key);
        
        if (shortcut) {
            e.preventDefault();
            shortcut.action();
        }
    });
}

/**
 * Toggle interface visibility
 */
function toggleInterface() {
    const { elements } = getState().ui;
    const container = elements.container;
    if (container instanceof HTMLElement) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Focus search input
 */
function focusSearch() {
    const searchInput = document.getElementById('mm-search');
    if (searchInput instanceof HTMLInputElement) {
        searchInput.focus();
    }
}

/**
 * Start video scan
 */
function startScan() {
    const state = getState();
    if (state.scanning) return;
    
    updateState({ scanning: true });
    scanForVideos().finally(() => {
        updateState({ scanning: false });
    });
}

/**
 * Clear all results
 */
function clearResults() {
    updateState({ videos: [] });
    updateResults();
}

/**
 * Create and initialize the UI launcher
 */
function createLauncher() {
    const launcher = document.createElement('div');
    launcher.className = 'mm-launcher';
    launcher.innerHTML = `
        <button class="mm-launcher-btn" title="Toggle MediaMagnet">
            <span class="mm-launcher-icon">🎬</span>
        </button>
    `;
    
    launcher.addEventListener('click', toggleInterface);
    document.body.appendChild(launcher);
}

/**
 * @param {Event} e
 */
function handleFileInput(e) {
    const target = e.target;
    if (!target.files?.length) return;
    
    showLoading('import');
    importSettings(target.files[0]).finally(() => {
        hideLoading('import');
        if (target.form) {
            target.form.reset();
        }
    });
}

function handleYearSelect() {
    const yearSelect = document.getElementById('mm-year-filter');
    if (!yearSelect) return;
    
    const currentYear = new Date().getFullYear();
    const startYear = 1900;
    
    yearSelect.innerHTML = '<option value="all">All Years</option>';
    for (let year = currentYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        yearSelect.appendChild(option);
    }
}

/**
 * @param {Event} e
 */
function handleVideoClick(e) {
    const target = e.target;
    if (!target) return;
    
    const videoItem = target.closest('.mm-video-item');
    if (!videoItem) return;
    
    const url = videoItem.dataset?.url;
    if (!url) return;
    
    window.open(url, '_blank');
}

/**
 * @param {HTMLElement | null} element
 * @returns {asserts element is HTMLButtonElement}
 */
function assertIsButton(element) {
    if (!(element instanceof HTMLButtonElement)) {
        throw new Error('Element is not a button');
    }
}

/**
 * @param {HTMLElement | null} element
 * @returns {asserts element is HTMLInputElement}
 */
function assertIsInput(element) {
    if (!(element instanceof HTMLInputElement)) {
        throw new Error('Element is not an input');
    }
}

/**
 * @param {HTMLElement | null} element
 * @returns {asserts element is HTMLImageElement}
 */
function assertIsImage(element) {
    if (!(element instanceof HTMLImageElement)) {
        throw new Error('Element is not an image');
    }
}

// Update UI initialization
function initializeUI() {
    const { elements } = getState().ui;
    
    // Initialize buttons
    if (elements.scanBtn) assertIsButton(elements.scanBtn);
    if (elements.generateBtn) assertIsButton(elements.generateBtn);
    if (elements.clearBtn) assertIsButton(elements.clearBtn);
    if (elements.exportBtn) assertIsButton(elements.exportBtn);
    if (elements.importBtn) assertIsButton(elements.importBtn);
    
    // Initialize inputs
    if (elements.recursiveCheckbox) assertIsInput(elements.recursiveCheckbox);
    if (elements.skipExternalCheckbox) assertIsInput(elements.skipExternalCheckbox);
    if (elements.maxDepthInput) assertIsInput(elements.maxDepthInput);
    
    // Add event listeners
    elements.scanBtn?.addEventListener('click', startScan);
    elements.clearBtn?.addEventListener('click', clearResults);
    elements.exportBtn?.addEventListener('click', exportSettings);
    elements.importBtn?.addEventListener('change', handleFileInput);
    
    // Initialize year select
    handleYearSelect();
    
    // Initialize video click handlers
    const container = elements.container;
    if (container instanceof HTMLElement) {
        container.addEventListener('click', handleVideoClick);
    }
}

/**
 * @param {string} operation - The operation to show loading for
 */
function showLoading(operation) {
    updateState({
        loading: {
            ...getState().loading,
            [operation]: true
        }
    });
    updateLoadingUI();
}

/**
 * @param {string} operation - The operation to hide loading for
 */
function hideLoading(operation) {
    updateState({
        loading: {
            ...getState().loading,
            [operation]: false
        }
    });
    updateLoadingUI();
}

/**
 * Scan for videos in the current page
 * @returns {Promise<void>}
 */
async function scanForVideos() {
    const state = getState();
    if (state.scanning) return;

    showLoading('scan');
    try {
        const videos = await findVideos();
        updateState({
            videos: [...state.videos, ...videos]
        });
        updateResults();
    } catch (error) {
        log(`Scan failed: ${error.message}`, 'error');
    } finally {
        hideLoading('scan');
    }
}

/**
 * Find videos in the current page
 * @returns {Promise<Video[]>}
 */
async function findVideos() {
    // Implementation of video finding logic
    return [];
}
