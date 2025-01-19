// ==UserScript==
// @name         MediaMagnet
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Scan directories for video files and create M3U playlists
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Global state
    const state = {
        videos: [],
        scanning: false,
        filters: {
            quality: 'all',
            type: 'all',
            minSize: 0,
            maxSize: Infinity,
            searchTerm: '',
            year: 'all',
            hasEpisode: 'all'
        },
        sortBy: 'name',
        sortOrder: 'asc',
        searchOptions: {
            recursive: true,
            maxDepth: 10,
            skipExternal: true
        }
    };

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
        const console = document.getElementById('mm-console');
        if (!console) return;

        const entry = document.createElement('div');
        entry.className = `console-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        console.appendChild(entry);
        console.scrollTop = console.scrollHeight;
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
        initializeEventListeners();
        populateYearFilter();
    }

    function createLauncher() {
        const launcher = document.createElement('div');
        launcher.id = 'mm-launcher';
        launcher.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        `;
        document.body.appendChild(launcher);

        launcher.addEventListener('click', () => {
            const container = document.getElementById('mm-container');
            if (container) {
                container.style.display = container.style.display === 'none' ? 'flex' : 'none';
            } else {
                createInterface();
            }
        });
    }

    // Event Listeners
    function initializeEventListeners() {
        // Window controls
        document.getElementById('mm-minimize').addEventListener('click', () => {
            document.getElementById('mm-container').style.display = 'none';
        });

        document.getElementById('mm-close').addEventListener('click', () => {
            document.getElementById('mm-container').remove();
        });

        // Clear console
        document.getElementById('mm-clear-console').addEventListener('click', () => {
            document.getElementById('mm-console').innerHTML = '';
        });

        // Tabs
        document.querySelectorAll('.mm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.mm-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.mm-tab-pane').forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`mm-${tab.dataset.tab}-tab`).classList.add('active');
            });
        });

        // Search and filter handlers
        document.getElementById('mm-search').addEventListener('input', debounce((e) => {
            state.filters.searchTerm = e.target.value.toLowerCase();
            updateResults();
        }, 300));

        ['quality', 'type', 'year'].forEach(filter => {
            document.getElementById(`mm-${filter}-filter`).addEventListener('change', (e) => {
                state.filters[filter] = e.target.value;
                updateResults();
            });
        });

        // Size filter handlers
        ['min', 'max'].forEach(type => {
            const sizeInput = document.getElementById(`mm-${type}-size`);
            const unitSelect = document.getElementById(`mm-${type}-size-unit');
            
            const updateSizeFilter = () => {
                const value = parseFloat(sizeInput.value);
                const unit = unitSelect.value;
                if (!isNaN(value)) {
                    state.filters[`${type}Size`] = value * SIZE_UNITS[unit];
                    updateResults();
                }
            };

            sizeInput.addEventListener('input', updateSizeFilter);
            unitSelect.addEventListener('change', updateSizeFilter);
        });

        // Sort controls
        document.getElementById('mm-sort-by').addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            updateResults();
        });

        document.getElementById('mm-sort-order').addEventListener('click', (e) => {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            e.target.textContent = state.sortOrder === 'asc' ? '↓' : '↑';
            updateResults();
        });

        // Main buttons
        document.getElementById('mm-scan-btn').addEventListener('click', () => {
            scanDirectory().catch(error => log(error.message, 'error'));
        });

        document.getElementById('mm-generate-btn').addEventListener('click', () => {
            generateM3U().catch(error => log(error.message, 'error'));
        });

        // Settings handlers
        document.getElementById('mm-recursive').addEventListener('change', (e) => {
            state.searchOptions.recursive = e.target.checked;
        });

        document.getElementById('mm-max-depth').addEventListener('change', (e) => {
            state.searchOptions.maxDepth = parseInt(e.target.value) || 10;
        });

        document.getElementById('mm-skip-external').addEventListener('change', (e) => {
            state.searchOptions.skipExternal = e.target.checked;
        });

        // Clear results
        document.getElementById('mm-clear-btn').addEventListener('click', () => {
            state.videos = [];
            updateResults();
            updateStats();
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
        const yearSelect = document.getElementById('mm-year-filter');
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 1900; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    async function scanDirectory() {
        if (state.scanning) {
            log('Scan already in progress');
            return;
        }

        try {
            state.scanning = true;
            updateButtons();
            log('Starting directory scan...');

            const processNode = async (node, depth = 0) => {
                if (depth > state.searchOptions.maxDepth) return [];
                
                const results = [];
                
                // Process links in current node
                const links = Array.from(node.getElementsByTagName('a'));
                for (const link of links) {
                    try {
                        const href = link.href || link.getAttribute('href');
                        if (!href) continue;

                        const url = new URL(href, window.location.href);
                        
                        // Skip external links if option is enabled
                        if (state.searchOptions.skipExternal && url.host !== window.location.host) {
                            continue;
                        }

                        const ext = url.pathname.split('.').pop().toLowerCase();
                        if (VIDEO_EXTENSIONS.includes(ext)) {
                            const filename = link.textContent.trim() || decodeURIComponent(url.pathname.split('/').pop());
                            const info = parseFilename(filename);
                            
                            let size = null;
                            try {
                                const response = await fetch(url, { method: 'HEAD' });
                                size = parseInt(response.headers.get('content-length'));
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
                if (state.searchOptions.recursive) {
                    const frames = Array.from(node.getElementsByTagName('frame'))
                        .concat(Array.from(node.getElementsByTagName('iframe')));
                    
                    for (const frame of frames) {
                        try {
                            const frameDoc = frame.contentDocument || frame.contentWindow.document;
                            const frameResults = await processNode(frameDoc, depth + 1);
                            results.push(...frameResults);
                        } catch (error) {
                            // Skip inaccessible frames
                            continue;
                        }
                    }
                }

                return results;
            };

            const videos = await processNode(document);
            state.videos = videos;

            log(`Found ${videos.length} video files`, 'success');
            updateResults();
            updateStats();
        } catch (error) {
            log(`Scan error: ${error.message}`, 'error');
        } finally {
            state.scanning = false;
            updateButtons();
        }
    }

    async function generateM3U() {
        try {
            log('Generating M3U playlist...');
            
            const content = ['#EXTM3U'];
            state.videos.forEach(video => {
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
        const totalCount = document.getElementById('mm-total-count');
        const totalSize = document.getElementById('mm-total-size');
        const filteredCount = document.getElementById('mm-filtered-count');

        if (totalCount) totalCount.textContent = state.videos.length;
        if (totalSize) {
            const bytes = state.videos.reduce((sum, video) => sum + (video.size || 0), 0);
            totalSize.textContent = formatFileSize(bytes);
        }
        if (filteredCount) {
            const filtered = getFilteredAndSortedVideos();
            filteredCount.textContent = filtered.length;
        }
    }

    function getFilteredAndSortedVideos() {
        let filtered = state.videos;

        // Apply text search
        if (state.filters.searchTerm) {
            const terms = state.filters.searchTerm.split(' ').filter(t => t);
            filtered = filtered.filter(video => 
                terms.every(term => 
                    video.title.toLowerCase().includes(term) ||
                    video.filename.toLowerCase().includes(term)
                )
            );
        }

        // Apply quality filter
        if (state.filters.quality !== 'all') {
            filtered = filtered.filter(video => video.quality === state.filters.quality);
        }

        // Apply type filter
        if (state.filters.type !== 'all') {
            filtered = filtered.filter(video => 
                state.filters.type === 'tv' ? video.season !== null : video.season === null
            );
        }

        // Apply year filter
        if (state.filters.year !== 'all') {
            filtered = filtered.filter(video => video.year === state.filters.year);
        }

        // Apply size filters
        filtered = filtered.filter(video => {
            const size = video.size || 0;
            return size >= state.filters.minSize && size <= state.filters.maxSize;
        });

        // Apply sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (state.sortBy) {
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
            return state.sortOrder === 'asc' ? comparison : -comparison;
        });

        return filtered;
    }

    function updateResults() {
        const resultsContainer = document.getElementById('mm-results');
        if (!resultsContainer) return;

        const filtered = getFilteredAndSortedVideos();

        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No videos found</div>';
            return;
        }

        resultsContainer.innerHTML = filtered.map(video => `
            <div class="video-item">
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
    }

    // UI Updates
    function updateButtons() {
        const scanBtn = document.getElementById('mm-scan-btn');
        const generateBtn = document.getElementById('mm-generate-btn');

        if (scanBtn) scanBtn.disabled = state.scanning;
        if (generateBtn) generateBtn.disabled = state.videos.length === 0;
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

        .console-entry {
            margin-bottom: 4px;
            padding: 4px 6px;
            border-radius: 4px;
            background: var(--bg-primary);
        }

        .console-entry.error {
            color: #ff4444;
            background: rgba(255, 68, 68, 0.1);
        }

        .console-entry.warning {
            color: #ffbb33;
            background: rgba(255, 187, 51, 0.1);
        }

        .console-entry.success {
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
    `);

    // Initialize
    function initialize() {
        createLauncher();
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})(); 
