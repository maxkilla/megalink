# MediaMagnet - Open Directory Video Scanner

MediaMagnet is a Tampermonkey script that helps you scan open directories for video files, automatically identify movies, TV shows, anime, and adult content, and generate M3U playlists with advanced filtering options.

## Features

- Scans open directories for video files
- Smart content type detection:
  - Movies and TV shows (via TMDB)
  - Anime (via MyAnimeList)
  - Adult content detection
- Automatic video identification:
  - Movies and TV shows via TMDB API
  - Anime identification via Jikan API (MyAnimeList)
  - Smart adult content detection and categorization
  - Shows year, type, and ratings
  - Remembers original filename
- Advanced filtering and sorting:
  - Quality filters (4K, 1080p, 720p, etc.)
  - Content type filters (movies, TV shows, anime)
  - Year-based filtering
  - File size range filters
  - Custom search terms
  - Sort by name, size, or date
- Modern UI features:
  - Clean and responsive interface
  - Virtual scrolling for large lists
  - Real-time search and filtering
  - Drag and drop interface
  - Minimizable window
  - Dark theme
- Smart Directory Scanning:
  - Recursive folder scanning with configurable depth
  - Intelligent media folder detection
  - Automatic skipping of non-media folders
  - Progress bar and real-time scan status
  - External link handling
- Data Management:
  - Export/Import settings
  - Save preferences
  - Generate M3U playlists
  - Keyboard shortcuts

## Installation

1. Install the Tampermonkey browser extension
2. Click on the Tampermonkey icon and select "Create new script"
3. Copy and paste the contents of `mediamagnet.user.js` into the editor
4. Save the script (Ctrl+S or File > Save)

## Usage

1. Navigate to any open directory containing video files
2. Look for the MediaMagnet interface in the top-right corner
3. Configure scan settings:
   - Set maximum scan depth
   - Toggle recursive scanning
   - Choose whether to skip external links
4. Use the filters to narrow down results:
   - Quality (4K, 1080p, 720p, etc.)
   - Type (Movie, TV Show, Anime)
   - Year
   - File size range
   - Search terms
5. Click "Scan Directory" to start scanning
6. Use the generated results to:
   - Sort by different criteria
   - Generate M3U playlists
   - Export settings
   - Clear results

## Keyboard Shortcuts

- `Ctrl+M`: Toggle interface visibility
- `Ctrl+F`: Focus search input
- `Ctrl+S`: Start scan
- `Ctrl+C`: Clear results

## Supported Video Formats

- MP4
- MKV
- AVI
- MOV
- WMV
- FLV
- WebM
- M4V
- MPG/MPEG

## Technical Details

- Written in JavaScript with JSDoc type annotations
- Uses modern browser features:
  - ResizeObserver for responsive UI
  - Virtual scrolling for performance
  - Drag and drop API
- State management with pub/sub pattern
- Asynchronous scanning with progress tracking
- Local storage for preferences
- Error handling and retry mechanisms

## Contributing

Feel free to submit issues and enhancement requests!
