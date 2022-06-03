import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { ChatGateway } from './chat.gateway';
import { Chan } from './entities/channel.entity';
import { ChanUser } from './entities/channelUser.entity';
import { Message } from './entities/message.entity';
import { SocketConnected } from './entities/socketsUser';
import { SocketJoined } from './entities/sockets-connected-to-channel';
import { ChanServices } from './services/chan.service';
import { ChatServices } from './services/chat.service';
import { ConnectService } from './services/connect.service';
import { MessageService } from './services/message.service';
import { AuthService } from '../auth/auth.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chan,
      ChanUser,
      Message,
      SocketConnected,
      SocketJoined,
    ]),
    UsersModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatGateway,
    ChanServices,
    ChatServices,
    ConnectService,
    MessageService,
    AuthService,
  ],
  exports: [ChatGateway],
})
export class ChatModule {}
