function leaveChat(socket: any, to: any, next: any) {
	if (to.name === 'Chat' || to.name === 'NewRoom' || to.name === 'PublicRoom'
		|| to.name === 'PrivateRoom' || to.name === 'ProtectedRoom'
		|| to.name === 'ChangeRoom' || to.name === 'ManageUsers') {
			next(true);
			return;
	}
	const answer = window.confirm("Are you sure you want to leave the chat ?")
	if (answer) {
			console.log('disconnection from chat');
		socket.disconnect()
		next(true);
		return;
	}
	next(false);	
}

export default leaveChat;
