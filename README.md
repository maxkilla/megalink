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
5. Get a TMDB API key from [themoviedb.org](https://www.themoviedb.org/settings/api)

## Usage

1. Navigate to any open directory containing video files
2. Look for the MediaMagnet interface in the top-right corner
3. Enter your TMDB API key in the input field
4. Configure content settings:
   - Toggle "Include Adult Content" to show/hide adult content
   - Toggle "Include Anime" to show/hide anime content
5. Set your desired filters (optional):
   - Include keywords: Only include files containing these words
   - Exclude keywords: Exclude files containing these words
   - Min/Max size: Filter files by size (in MB)
6. Click "Scan Directory" to start scanning
7. Click "Identify Videos" to identify the scanned videos
8. Once identification is complete, click "Generate M3U" to create and download the playlist with proper titles

## Content Identification

### Anime Detection
- Uses Jikan API (MyAnimeList) for accurate anime identification
- Detects common anime release patterns
- Shows episode count and MAL score
- Identifies adult anime (hentai) separately

### Adult Content Detection
- Smart detection of adult content using common patterns
- Separate categorization for adult content
- Optional adult content filtering
- Clear 18+ badges for adult content

### Movies and TV Shows
- Uses TMDB API for accurate identification
- Shows release year and ratings
- Distinguishes between movies and TV series

## Content Types and Badges

The interface uses color-coded badges to clearly identify content types:
- 🟢 Movie: Regular movies
- 🔵 TV: Television series
- 🔴 Anime: Anime content
- ⭕ Adult: Adult content (with 18+ badge)

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
- 3GP
- TS

## Notes

- The script requires the following permissions:
  - GM_setValue/GM_getValue: For storing scan results
  - GM_download: For downloading the M3U playlist
- The interface can be minimized by clicking the "-" button
- File size parsing works with KB, MB, and GB units
