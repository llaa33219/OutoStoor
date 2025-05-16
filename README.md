# Entry Auto Save Extension

This Chrome extension provides automatic saving for Entry projects, storing them locally to prevent data loss.

## Features

- Automatically saves your Entry projects at regular intervals (default: every 1 minute)
- Saves are organized by project ID
- View your save history and restore previous versions
- Manual save option
- Configurable auto-save interval

## How It Works

The extension simulates user input in the console by using:
- `Entry.projectId` to get the current project ID
- `Entry.exportProject()` to get the project data
- `Entry.clearProject()` and `Entry.loadProject()` to restore saved projects

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `auto-save-extension` folder
5. The extension icon should appear in your browser toolbar

## Usage

1. Visit an Entry project page
2. Click the extension icon to open the popup
3. Configure your preferred auto-save interval (1-60 minutes)
4. The extension will automatically save your project at the specified interval
5. To manually save, click the "Save Now" button
6. To view saved projects, click on a project ID in the list
7. To restore a previous version, click "Load This Save" on the desired save

## Notes

- Make sure you are on an Entry project page when using the extension
- The extension saves data to your browser's local storage
- Up to 50 saves per project are stored (oldest saves are automatically removed) 