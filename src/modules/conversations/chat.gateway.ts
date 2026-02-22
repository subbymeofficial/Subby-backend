import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { Logger } from '@nestjs/common';

interface AuthenticatedSocket {
  id: string;
  userId?: string;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: unknown) => void;
  to: (room: string) => { emit: (event: string, data: unknown) => void };
  disconnect?: (close?: boolean) => void;
}

const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket & { handshake?: { auth?: { token?: string }; query?: { token?: string } } }) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.query?.token;
      if (!token) {
        client.emit('error', { message: 'Authentication required' });
        (client as { disconnect?: (c?: boolean) => void }).disconnect?.();
        return;
      }

      const secret = this.configService.get<string>('jwt.secret') || 'default-secret';
      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.sub;
      if (!userId) {
        client.emit('error', { message: 'Invalid token' });
        (client as { disconnect?: (c?: boolean) => void }).disconnect?.();
        return;
      }

      (client as AuthenticatedSocket).userId = userId;
      client.join(`user:${userId}`);

      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }
      connectedUsers.get(userId)!.add(client.id);

      this.logger.log(`User ${userId} connected (socket ${client.id})`);
    } catch {
      client.emit('error', { message: 'Invalid token' });
      (client as { disconnect?: (c?: boolean) => void }).disconnect?.();
    }
  }

  handleDisconnect(client: AuthenticatedSocket & { id?: string }) {
    const userId = (client as AuthenticatedSocket & { userId?: string }).userId;
    if (userId) {
      const set = connectedUsers.get(userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) connectedUsers.delete(userId);
      }
    }
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = (client as AuthenticatedSocket & { userId?: string }).userId;
    if (!userId || !data.conversationId) return;

    try {
      await this.conversationsService.validateParticipant(data.conversationId, userId);
      client.join(`conversation:${data.conversationId}`);
    } catch {
      client.emit('error', { message: 'Cannot join conversation' });
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = (client as AuthenticatedSocket & { userId?: string }).userId;
    if (!userId || !data.conversationId) return;
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      userId,
      conversationId: data.conversationId,
    });
  }

  async emitNewMessage(conversationId: string, message: unknown): Promise<void> {
    this.server.to(`conversation:${conversationId}`).emit('new_message', message);
  }

  async emitMessageRead(
    conversationId: string,
    data: { messageIds: string[]; userId: string },
  ): Promise<void> {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message_read', data);
  }

  async emitNotification(userId: string, notification: unknown): Promise<void> {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  isUserOnline(userId: string): boolean {
    return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
  }
}
