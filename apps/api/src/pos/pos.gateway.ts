import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: 'pos', cors: { origin: '*' } })
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PosGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`POS Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`POS Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinStore')
  handleJoinStore(client: Socket, payload: { storeId: string }) {
    if (!payload?.storeId) {
      return;
    }

    const roomName = `store:${payload.storeId}`;
    void client.join(roomName);
    this.logger.log(`Client ${client.id} joined room: ${roomName}`);
    client.emit('joined', { room: roomName });
  }

  sendPrintJob(storeId: string, data: unknown) {
    const roomName = `store:${storeId}`;
    this.logger.log(`🚀 Sending PRINT_JOB to ${roomName}`);
    this.server.to(roomName).emit('PRINT_JOB', data);
  }

  sendPrintSummary(storeId: string, data: unknown) {
    const roomName = `store:${storeId}`;
    this.logger.log(`🚀 Sending PRINT_SUMMARY to ${roomName}`);
    this.server.to(roomName).emit('PRINT_SUMMARY', data);
  }
}
