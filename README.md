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
- Content filtering options:
  - Toggle anime content
  - Toggle adult content
  - Include/exclude keywords
  - Minimum/maximum file size filters
- Clean and modern user interface with badges
- Generate M3U playlists with proper titles
- Minimizable interface
- **Smart Directory Scanning**
  - Recursive folder scanning with configurable depth
  - Intelligent media folder detection
  - Automatic skipping of non-media folders
  - Progress bar and real-time scan status
  - Configurable scan settings:
    - Maximum folder depth
    - Smart folder detection
    - Small folder skipping
    - Recursive scanning toggle

## Installation

1. Install the Tampermonkey browser extension
2. Click on the Tampermonkey icon and select "Create new script"
3. Copy and paste the contents of `mediamagnet.user.js` into the editor
4. Save the script (Ctrl+S or File > Save)


- The script requires the following permissions:
  - GM_setValue/GM_getValue: For storing scan results
  - GM_download: For downloading the M3U playlist
- The interface can be minimized by clicking the "-" button
- File size parsing works with KB, MB, and GB units
