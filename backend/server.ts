import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Client {
  id: string;
  ws: any;
  roomId?: string;
  isController: boolean;
}

interface Room {
  id: string;
  clients: Map<string, Client>;
  controllerId?: string;
}

class CobrowsingServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private rooms: Map<string, Room> = new Map();

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    console.log(`Co-browsing server started on port ${port}`);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws) => {
      const clientId = uuidv4();
      const client: Client = {
        id: clientId,
        ws,
        isController: false
      };

      this.clients.set(clientId, client);
      console.log(`Client ${clientId} connected`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.handleClientDisconnect(client);
        console.log(`Client ${clientId} disconnected`);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId
      }));
    });
  }

  private handleMessage(client: Client, message: any) {
    switch (message.type) {
      case 'join-room':
        this.handleJoinRoom(client, message.roomId);
        break;
      case 'create-room':
        this.handleCreateRoom(client);
        break;
      case 'request-control':
        this.handleRequestControl(client);
        break;
      case 'release-control':
        this.handleReleaseControl(client);
        break;
      case 'sync-event':
        this.handleSyncEvent(client, message);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private handleJoinRoom(client: Client, roomId: string) {
    if (!this.rooms.has(roomId)) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Room does not exist'
      }));
      return;
    }

    const room = this.rooms.get(roomId)!;
    client.roomId = roomId;
    room.clients.set(client.id, client);

    // Notify all clients in the room
    this.broadcastToRoom(roomId, {
      type: 'user-joined',
      clientId: client.id,
      userCount: room.clients.size
    });

    client.ws.send(JSON.stringify({
      type: 'joined-room',
      roomId: roomId,
      isController: client.isController,
      userCount: room.clients.size
    }));
  }

  private handleCreateRoom(client: Client) {
    const roomId = uuidv4().substring(0, 8);
    const room: Room = {
      id: roomId,
      clients: new Map(),
      controllerId: client.id
    };

    client.roomId = roomId;
    client.isController = true;
    room.clients.set(client.id, client);
    this.rooms.set(roomId, room);

    client.ws.send(JSON.stringify({
      type: 'room-created',
      roomId: roomId,
      isController: true
    }));
  }

  private handleRequestControl(client: Client) {
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    // Release current controller
    if (room.controllerId) {
      const currentController = room.clients.get(room.controllerId);
      if (currentController) {
        currentController.isController = false;
        currentController.ws.send(JSON.stringify({
          type: 'control-released'
        }));
      }
    }

    // Set new controller
    room.controllerId = client.id;
    client.isController = true;

    this.broadcastToRoom(client.roomId, {
      type: 'controller-changed',
      controllerId: client.id
    });
  }

  private handleReleaseControl(client: Client) {
    if (!client.roomId || !client.isController) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    room.controllerId = undefined;
    client.isController = false;

    this.broadcastToRoom(client.roomId, {
      type: 'control-released',
      controllerId: null
    });
  }

  private handleSyncEvent(client: Client, message: any) {
    if (!client.roomId || !client.isController) return;

    // Forward the event to all other clients in the room
    this.broadcastToRoom(client.roomId, {
      type: 'sync-event',
      eventType: message.eventType,
      data: message.data
    }, client.id);
  }

  private handleClientDisconnect(client: Client) {
    this.clients.delete(client.id);

    if (client.roomId) {
      const room = this.rooms.get(client.roomId);
      if (room) {
        room.clients.delete(client.id);

        // If this was the controller, release control
        if (room.controllerId === client.id) {
          room.controllerId = undefined;
          this.broadcastToRoom(client.roomId, {
            type: 'control-released',
            controllerId: null
          });
        }

        // Notify other clients
        this.broadcastToRoom(client.roomId, {
          type: 'user-left',
          clientId: client.id,
          userCount: room.clients.size
        });

        // Clean up empty rooms
        if (room.clients.size === 0) {
          this.rooms.delete(client.roomId);
        }
      }
    }
  }

  private broadcastToRoom(roomId: string, message: any, excludeClientId?: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.clients.forEach((client) => {
      if (client.id !== excludeClientId && client.ws.readyState === 1) {
        client.ws.send(messageStr);
      }
    });
  }
}

// Start the server
const server = new CobrowsingServer(8080);