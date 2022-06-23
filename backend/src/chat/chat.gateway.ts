import { Inject, Logger, forwardRef } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
  } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/services/users.service';
import { ChannelI, RolesI} from './interfaces/back.interface';
import { MessageI } from './interfaces/back.interface';
import { ChanServices } from './services/chan.service';
import { MessageService } from './services/message.service';
import { FrontChannelI, FrontUserGlobalI, FrontUserChannelI } from './interfaces/front.interface';
import * as bcrypt from 'bcrypt';
import { Status } from '../users/enums/status.enum';
import { ChannelType } from 'src/users/enums/channelType.enum';

@WebSocketGateway({ cors: { origin: '*', credentials: true }, credentials: true, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  constructor(
    private readonly chanServices: ChanServices,
    private readonly messageServices: MessageService,
    private readonly authServices: AuthService,
    @Inject(forwardRef(() => UsersService))
    private readonly userServices: UsersService,
  ) {}

  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('ChatGateway');

  afterInit(server: Server) {
    this.logger.log('Chat is Init 🙏');
  }

  /******* Connection ********/
  async handleConnection(client: Socket) {
    try {
      const user: User = await this.authServices.getUserBySocket(client);
      client.data.user = user;
      await this.userServices.changeStatus(client.data.user, Status.ONLINE, client.id);
      this.logger.log(`Client connected: ${client.data.user.username}`);
    } catch {
      this.logger.log('Failed to retrieve user from client');
      return client.disconnect();
    }
  }

  /******* Disconection ********/
  @SubscribeMessage('disconnect')
  async handleDisconnect(client: Socket) {
    try {
      if (!client.data.user) {
        return client.disconnect();
      }
      this.logger.log(`Client disconnected: ${client.data.user.username}`);
      await this.userServices.changeStatus(client.data.user, Status.OFFLINE, null);
    } catch (e) {
      this.logger.log(e);
      client.disconnect();
    }
  }

  /*********** .  . Create Channel **************** */
  @SubscribeMessage('createChannel')
  async onChannelCreation(client: Socket, channel: ChannelI): Promise<boolean> {
    if (!client.data.user) {
      client.disconnect();
      return false;
    }
    const createChannel: {channel: string, error: string} = await this.chanServices.createChannel(channel, client.data.user);
    if (!createChannel.channel) {
      this.logger.log(`ERROR: ${createChannel.error}`);
      client.emit('errorChannelCreation', `${createChannel.error}` );
      return false;
    }
    this.logger.log(`new Channel: ${createChannel.channel} created`);
    client.emit('channelCreated', `${createChannel.channel}`);
    return true;
  }

  /************* . . Delete Channel **************** */
  @SubscribeMessage('deleteChannel')
  async onDeleteChannel(client: Socket, channel: ChannelI) {
    await this.chanServices.deleteChannel(channel);
    // TODO emit channel destruction
    this.logger.log(`delete Channel: ${channel.name}`);
  }

  @SubscribeMessage('message')
  async onSendMessage(client: Socket, params: { channelId: string, content: string}) {
    this.logger.log('sending message');
    const channel = await this.chanServices.getChannelFromId(params.channelId);
    const user: RolesI = await this.chanServices.getUserOnChannel(channel, client.data.user.id);
    if (!user) {
      return;
    }
    let date = new Date;
    if (user.muteDate >= date) {
      return;
    }
    const message: MessageI = await this.messageServices.create({ channel, date, content: params.content, user: client.data.user });
    const originalMessage = message.content;
    const sender = message.user;
    const connectedUsers: User[] = await this.chanServices.getAllChanUser(params.channelId);
    for (const user of connectedUsers) {
      const blockedUser: number = user.blockedIds.find(element => element === sender.id)
      if (blockedUser) {
        if (channel.type === ChannelType.PM) {
          continue ;
        }
        message.content = "... 🛑 ...";
      }
      else {
        message.content = originalMessage;
      }
      const frontMessage = { content: message.content, date: message.date.toUTCString(), userId: message.user.id };
      this.server.to(user.chatSocket).emit('newMessage', { id: params.channelId, message: frontMessage });
    }
  }

  /************** . Join Channel *************/
  @SubscribeMessage('joinChannel')
  async handleJoinChannel(client: Socket, channel: ChannelI) {
    const channelFound = await this.chanServices.findChannelWithUsers(channel.id);
    if (!channelFound) {
      return ;
    }
    if (channelFound.password) {
      if (!channel.password) {
        client.emit('wrongPassword');
        return ;
      } else if (await bcrypt.compare(channel.password, channelFound.password) === false) {
        client.emit('wrongPassword');
        return ;
      }
    }
    const index = channelFound.banned.indexOf(client.data.user.id);
    if (index !== -1) {
      client.emit('youAreBanned');
      return ;
    }
    await this.chanServices.pushUserToChan(channelFound, client.data.user);
    this.logger.log(`${client.data.user.username} joined ${channelFound.name}`);
    client.emit('joinAccepted', { id: channelFound.id, isPm: false });
    this.emitMyChannels(client);
    const connectedUsers: User[] = await this.chanServices.getAllChanUser(channelFound.id);
    for (const user of connectedUsers) {
      this.server.to(user.chatSocket).emit('userChannelModif', { id: channelFound.id });
    }
  }

  /********************* Leave Channel ********************/
  // @UseGuards(AuthChat)
  @SubscribeMessage('leaveChannel')
  async handleLeaveChannel(client: Socket, params: { id: string }) {
    await this.chanServices.removeUserFromChan(params.id, client.data.user);
    //await this.chanServices.unmuteUser(channel.id, client.data.user);
    this.logger.log(`${client.data.user.username} leave a channel`);
    client.emit('leftChannel', { id: params.id });
    const connectedUsers: User[] = await this.chanServices.getAllChanUser(params.id);
    for (const user of connectedUsers) {
      this.server.to(user.chatSocket).emit('userChannelModif', { id: params.id });
    }
  }

  @SubscribeMessage('editChannel')
  async updateChannel(client: Socket, input:
    { channelId: string, type: ChannelType, password: string, avatar: null | Buffer }): Promise<void> {
    const { channelId, type, password, avatar} = input;
    const channelFound = await this.chanServices.findChannelWithUsers(channelId);
    const ret: Boolean = await this.chanServices.updateChannel(channelFound, {type, password, avatar});
    if (ret === true) {
      this.server.emit('channelEdited', { id: channelId })
    }
  }

  /********************* Block user *********************/
  @SubscribeMessage('blockUserControl')
  async blockUserControl(client: Socket, data: { targetId: number, block: boolean }): Promise<void>{
    const { targetId, block } = data;
    const change = await this.userServices.updateBlockedUser(client.data.user.id, block, targetId);
    if (change) {
      client.emit('blockChange', { targetId: targetId });
    }
  }

  /* dose back check the right for calling this socket route or front end ensure this ? */
  @SubscribeMessage('muteUser')
  async muteUser(client: Socket, data: any): Promise<void> {
    const {channelId, targetId, time} = data;
    await this.chanServices.muteUser(channelId, targetId, time);
    const user = await this.userServices.findUserById(targetId );
    client.emit('UserMuted', `you have muted ${user.username} for ${time} seconds`);
    this.server.to(user.chatSocket).emit('muted', `you have being muted for ${time} seconds`);
  }

  @SubscribeMessage('unmuteUser')
  async unmuteUser(client: Socket, data: any): Promise<void> {
    const {channelId, targetId} = data; 
    await this.chanServices.unmuteUser(channelId, targetId)
  }

  /* dose back check the right for calling this socket route or front end ensure this ? */
  @SubscribeMessage('banUser')
  async banUser(client: Socket, data: any): Promise<void> {
    const {channelId, userId} = data;
    const user = await this.userServices.findUserById(userId + '');
    if (!user) return ;
    const channel = await this.chanServices.banUser(channelId, user);
    client.emit('UserBanned', `you have banned ${user.username} from ${channel.name}`);
    this.server.to(user.chatSocket).emit('banned', `you have been banned from ${channel.name}`);
  }
  
  @SubscribeMessage('unBanUser')
  async unBanUser(client: Socket, data: any): Promise<void> {
    const {channelId, userId} = data;
    const user = await this.userServices.findUserById(userId + '');
    if (!user) return ;
    const channel = await this.chanServices.unBanUser(channelId, userId);
    if (!channel) { return ; }
    client.emit('UserUnbanned', `you have unbanned ${user.username} from ${channel.name}`);
    this.server.to(user.chatSocket).emit('unBanned', `you have been unbanned from ${channel.name}`);
  }

  @SubscribeMessage('giveAdminRights')
  async giveAdminRights(client: Socket, data: any): Promise<void> {
    const {channelId, userId} = data;
    const res = await this.chanServices.addAdmin(channelId, userId);
    if (!res)
      return; //emit error to client
    //const channelUsers: RolesI[] = await this.chanServices.getChannelUsers(channelId);
    //emit status chante to userId.chatSocket.... but a bit expensive

  }

  /****** Emit Service ******/
  async sendUsersList() {
    const users = await this.userServices.getUsers();
    this.server.emit('usersList', users);
  }

  @SubscribeMessage('getUsersList')
  async sendUsersListToOne(client: Socket) {
    console.log('here');
    const users = await this.userServices.getUsers();
    client.emit('usersList', users);    
  }

  @SubscribeMessage('emitMyChannels')
  async emitMyChannels(client: Socket) {
    this.logger.log('Get channels joined by user');
    const channels: FrontChannelI[] = await this.chanServices.getChannelsFromUser(client.data.user.id);
    for (let channel of channels) {
      channel.blocked = false;
      if (channel.type === ChannelType.PM) {
        let user: User = client.data.user;
        let usersId = channel.name.split('/').map(Number);
        let targetId = usersId[0];
        if (usersId[0] === user.id) {
          targetId = usersId[1];
        }
        let index = user.blockedIds.indexOf(targetId);
        if (index !== -1) {
          channel.blocked = true;
        }
      }
    }
    client.emit('channelList', channels);
  }

  @SubscribeMessage('getChannelUsers')
  async getChanneUsers(client: Socket, params: any): Promise<any> {
    this.logger.log('Get channel users');
    const channelUsers: RolesI[] = await this.chanServices.getChannelUsers(params.id);
    let isMember = false;
    let res = [] as any[];

    for (let user of channelUsers) {
      if (user.userId === client.data.user.id) {
        isMember = true;
      }
      res.push({ 'id': user.userId, 'role': user.role }) //better changeThis
    }
    if (isMember === false) {
      this.logger.log('Access Refused');
      client.emit('AccessRefused');
      return;
    }
    client.emit('channelUsers', { id: params.id, users: res });
  }

  @SubscribeMessage('getChannelMessages')
  async getChannelMessages(client: Socket, params: any) {
    const user = await this.userServices.findUserById(client.data.user.id);
    this.logger.log('Get channel messages');
    if (!await this.chanServices.userIsInChannel(user, params.id)) {
      return;
    }
    const messages = await this.messageServices.findMessagesForChannel(params.id, user);
    client.emit('channelMessages', { id: params.id, messages: messages });
  }

  // add banned logic into this
  @SubscribeMessage('getJoinableChannels')
  async getJoinableChannels(client: Socket, targetId: number) {
    try {
      this.logger.log('retrieving Joinable Channels');
      const channels: FrontChannelI[] = await this.chanServices.filterJoinableChannel(targetId);
      client.emit('joinableChannels', channels);
    } catch (e) {
      client.disconnect();
      this.logger.log(e);
    }
  }

  @SubscribeMessage('getFindUser')
  async findUser(client: Socket, name: string) {
    try {
      const users = await this.userServices.filterUserByName(name) as any;
      for (let user of users) {
        user.avatar =  user.id;
      }
      client.emit('findUser', users);
    } catch (e) {
      client.disconnect();
      this.logger.log(e);
    }
  }

  @SubscribeMessage('getConnectedUsers')
  async getConnectedUsers(client: Socket) {
    try {
      let connectedUsers = await this.userServices.getConnectedUsers();
      const clientId = client.data.user.id;
      for (const [i, value] of connectedUsers.entries()) {
        if (value.id === clientId) {
          connectedUsers.splice(i, 1);
          break ;
        }
    }
      client.emit('connectedUsers', connectedUsers);
    } catch(e) {
      client.disconnect();
      this.logger.log(e);
    } 
  }

  @SubscribeMessage('createPrivateConversation')
  async privateConversation(client: Socket, targetId: string) {
    try {
      const user1 = client.data.user;
      const user2 = await this.userServices.findUserById(targetId);
      const channel = await this.chanServices.privateConversation(user1, user2);
      if (channel != null) {
        client.emit('joinAccepted', { id: channel.id, isPm: true });
        this.server.to(user2.chatSocket).emit('joinAccepted', { id: channel.id, isPm: true });
      } else {
        client.emit('alreadyInPm', { name: user2.nickname });
      }
    } catch (e) {
      client.disconnect();
      this.logger.log(e);
    }
  }
}
