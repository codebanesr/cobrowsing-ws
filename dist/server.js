var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/ws/browser.js
var require_browser = __commonJS((exports, module) => {
  module.exports = function() {
    throw new Error("ws does not work in the browser. Browser clients must use the native " + "WebSocket object");
  };
});

// backend/server.ts
var import_ws = __toESM(require_browser(), 1);

// node_modules/uuid/dist/esm-browser/rng.js
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}

// node_modules/uuid/dist/esm-browser/stringify.js
var byteToHex = [];
for (let i = 0;i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// node_modules/uuid/dist/esm-browser/native.js
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native_default = {
  randomUUID
};

// node_modules/uuid/dist/esm-browser/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0;i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;
// backend/server.ts
class CobrowsingServer {
  wss;
  clients = new Map;
  rooms = new Map;
  constructor(port = 8080) {
    this.wss = new import_ws.WebSocketServer({ port });
    console.log(`Co-browsing server started on port ${port}`);
    this.setupEventHandlers();
  }
  setupEventHandlers() {
    this.wss.on("connection", (ws) => {
      const clientId = v4_default();
      const client = {
        id: clientId,
        ws,
        isController: false
      };
      this.clients.set(clientId, client);
      console.log(`Client ${clientId} connected`);
      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      });
      ws.on("close", () => {
        this.handleClientDisconnect(client);
        console.log(`Client ${clientId} disconnected`);
      });
      ws.send(JSON.stringify({
        type: "connected",
        clientId
      }));
    });
  }
  handleMessage(client, message) {
    switch (message.type) {
      case "join-room":
        this.handleJoinRoom(client, message.roomId);
        break;
      case "create-room":
        this.handleCreateRoom(client);
        break;
      case "request-control":
        this.handleRequestControl(client);
        break;
      case "release-control":
        this.handleReleaseControl(client);
        break;
      case "sync-event":
        this.handleSyncEvent(client, message);
        break;
      default:
        console.log("Unknown message type:", message.type);
    }
  }
  handleJoinRoom(client, roomId) {
    if (!this.rooms.has(roomId)) {
      client.ws.send(JSON.stringify({
        type: "error",
        message: "Room does not exist"
      }));
      return;
    }
    const room = this.rooms.get(roomId);
    client.roomId = roomId;
    room.clients.set(client.id, client);
    this.broadcastToRoom(roomId, {
      type: "user-joined",
      clientId: client.id,
      userCount: room.clients.size
    });
    client.ws.send(JSON.stringify({
      type: "joined-room",
      roomId,
      isController: client.isController,
      userCount: room.clients.size
    }));
  }
  handleCreateRoom(client) {
    const roomId = v4_default().substring(0, 8);
    const room = {
      id: roomId,
      clients: new Map,
      controllerId: client.id
    };
    client.roomId = roomId;
    client.isController = true;
    room.clients.set(client.id, client);
    this.rooms.set(roomId, room);
    client.ws.send(JSON.stringify({
      type: "room-created",
      roomId,
      isController: true
    }));
  }
  handleRequestControl(client) {
    if (!client.roomId)
      return;
    const room = this.rooms.get(client.roomId);
    if (!room)
      return;
    if (room.controllerId) {
      const currentController = room.clients.get(room.controllerId);
      if (currentController) {
        currentController.isController = false;
        currentController.ws.send(JSON.stringify({
          type: "control-released"
        }));
      }
    }
    room.controllerId = client.id;
    client.isController = true;
    this.broadcastToRoom(client.roomId, {
      type: "controller-changed",
      controllerId: client.id
    });
  }
  handleReleaseControl(client) {
    if (!client.roomId || !client.isController)
      return;
    const room = this.rooms.get(client.roomId);
    if (!room)
      return;
    room.controllerId = undefined;
    client.isController = false;
    this.broadcastToRoom(client.roomId, {
      type: "control-released",
      controllerId: null
    });
  }
  handleSyncEvent(client, message) {
    if (!client.roomId || !client.isController)
      return;
    this.broadcastToRoom(client.roomId, {
      type: "sync-event",
      eventType: message.eventType,
      data: message.data
    }, client.id);
  }
  handleClientDisconnect(client) {
    this.clients.delete(client.id);
    if (client.roomId) {
      const room = this.rooms.get(client.roomId);
      if (room) {
        room.clients.delete(client.id);
        if (room.controllerId === client.id) {
          room.controllerId = undefined;
          this.broadcastToRoom(client.roomId, {
            type: "control-released",
            controllerId: null
          });
        }
        this.broadcastToRoom(client.roomId, {
          type: "user-left",
          clientId: client.id,
          userCount: room.clients.size
        });
        if (room.clients.size === 0) {
          this.rooms.delete(client.roomId);
        }
      }
    }
  }
  broadcastToRoom(roomId, message, excludeClientId) {
    const room = this.rooms.get(roomId);
    if (!room)
      return;
    const messageStr = JSON.stringify(message);
    room.clients.forEach((client) => {
      if (client.id !== excludeClientId && client.ws.readyState === 1) {
        client.ws.send(messageStr);
      }
    });
  }
}
var server = new CobrowsingServer(8080);
