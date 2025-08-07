# Co-browsing WebSocket App

An open-source collaborative co-browsing application that allows multiple users to browse web pages together in real-time. The system consists of a backend WebSocket server built with Bun and a Chrome extension for capturing and synchronizing browser events.

## Features

- **Real-time Synchronization**: All user interactions (clicks, scrolls, form inputs) are synchronized across connected clients
- **Control Handover**: Users can request and release control of the browsing session
- **Room-based Sessions**: Create or join rooms using simple room IDs
- **Chrome Extension**: Easy-to-use browser extension with popup interface
- **WebSocket Communication**: Fast, low-latency communication using WebSockets

## Architecture

- **Backend Server** (`backend/server.ts`): Bun-based WebSocket server handling room management and event synchronization
- **Chrome Extension** (`extension/`): Browser extension with content scripts, background scripts, and popup UI
- **Event Synchronization**: Real-time capture and replay of DOM events across clients

## Setup Instructions

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Node.js (for extension build tools)
- Google Chrome browser

### Backend Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start the server:
   ```bash
   bun run dev
   ```
   
   The server will start on `localhost:8080`

### Chrome Extension Setup

1. Navigate to the extension directory and install dependencies:
   ```bash
   cd extension
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `extension/dist` folder

## Usage

1. **Start the backend server** using `bun run dev`
2. **Open the Chrome extension** by clicking the extension icon in your browser
3. **Create or join a room**:
   - Click "Create Room" to start a new session and get a room ID
   - Or enter a room ID and click "Join Room" to join an existing session
4. **Control the session**:
   - The room creator has control by default
   - Other users can click "Request Control" to take control
   - The controller can click "Release Control" to give up control
5. **Browse together**: All interactions from the controller are synchronized to other participants

## Project Structure

```
cobrowsing-ws/
├── backend/
│   └── server.ts           # WebSocket server
├── extension/
│   ├── src/
│   │   ├── background.js   # Extension background script
│   │   ├── content.js      # Content script for DOM interaction
│   │   ├── popup.js        # Popup UI logic
│   │   └── injected.js     # Page context event capture
│   ├── public/
│   │   ├── manifest.json   # Extension manifest
│   │   └── popup.html      # Popup UI
│   └── dist/               # Built extension files
├── package.json
└── README.md
```

## Development

### Backend Development
- The server auto-reloads with `bun run dev`
- WebSocket connections are handled on port 8080
- Room management and event broadcasting logic in `backend/server.ts`

### Extension Development
- Use `npm run dev` in the `extension` directory for development builds
- Reload the extension in Chrome after making changes
- Check browser console and extension background page for debugging

## Technical Details

### Event Synchronization
The system captures and synchronizes:
- **Scroll events**: Window scroll position
- **Click events**: Element clicks with CSS selectors
- **Input events**: Form field changes
- **Form submissions**: Complete form data
- **Navigation**: URL changes

### Security Considerations
- Only captures events from the controlling user
- Uses CSS selectors for element targeting (no direct DOM references)
- WebSocket connections are local by default (localhost:8080)

## Contributing

This is an open-source project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Open source - feel free to use and modify as needed.