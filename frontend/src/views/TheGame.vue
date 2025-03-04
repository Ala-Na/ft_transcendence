<template>
<div>
	<particles-bg type="cobweb" :bg="true" />


	<!-- game options -->
	<div v-if="!gameStarted && !route.query.watch">
		<v-row justify="center">
				<div class="button_slick Spotnik">W ⬆️</div>
				<div class="button_slick Spotnik">S ⬇️</div>
		</v-row>
		<div v-if="!fatalError">
			<v-container>
				<v-row justify="center">
					<div v-if="waitForChatOpponent" class="button_slick button_slide big_button Spotnik">Wait for opponent to join game</div>
					<div v-else-if="!searchingGame" class="button_slick button_slide big_button Spotnik" @click="Play">SearchGame</div>
					<div v-else-if="!matchId" class="button_slick big_button Spotnik">Searching A Game</div>
					<div v-else class="button_slide button_slick big_button Spotnik" @click="AcceptGame">A Game Has Been Found</div>
				</v-row>
			</v-container>
		</div>
		<div class="params">
			<div class="button_slick">
				<h1 class="Spotnik">Ball Speed</h1>
				<v-radio-group v-model="ballSpeed">
					<v-radio label="Slow" :value="'SLOW'"></v-radio>
					<v-radio label="Mid" :value="'NORMAL'"></v-radio>
					<v-radio label="Speedy" :value="'FAST'"></v-radio>
				</v-radio-group>
			</div>
			<div class="button_slick">
				<h1 class="Spotnik">Ball Size</h1>
				<v-radio-group v-model="ballSize">
					<v-radio label="Smol" :value="'SMALL'"></v-radio>
					<v-radio label="Mid" :value="'NORMAL'"></v-radio>
					<v-radio label="Chonke" :value="'BIG'"></v-radio>
				</v-radio-group>
			</div>
		</div>
	</div>

	<!-- game watching -->
	<div v-if="!gameStarted && route.query.watch">
		<v-row justify="center">
			<div class="button_slick big_button Spotnik" v-if="!matchesList && !route.query.matchid && !route.query.user">There Is Not A Single Matches Right Now</div>
			<div class="button_slick big_button Spotnik" v-if="match404">This Match Dosent Exist</div>
		</v-row>
		<v-row v-if="!route.query.matchid && !route.query.user">
			<v-col v-for="(matches) in matchesList" :key="matches">
				<div class="button_slide overlay custom_offset" @click="goToFollowGame(matches.matchId)">
					<v-img min-width="15%" max-width="20%" :src="matches.avatarLeft"/>
					<div class="big_text text_custom">{{matches.leftPlayer}}</div>
					<v-spacer></v-spacer>
					<div class="big_text Spotnik" color="white">VS</div>
					<v-spacer></v-spacer>
					<v-img min-width="15%" max-width="20%" :src="matches.avatarRight"/>
					<div class="big_text text_custom">{{matches.rightPlayer}}</div>
				</div>
			</v-col>
		</v-row>
	</div>

	<!-- canvas of the game -->
	<div v-show="gameStarted">
		<canvas id="pongGame"></canvas>
	</div>
	<img id="left_arrow" :src="require('../assets/arrow-left.png')" style="display:none"/>
	<img id="right_arrow" :src="require('../assets/arrow-right.png')" style="display:none"/>
</div>
</template>

<script lang="ts">
import { useRoute } from "vue-router"
import { onMounted, onUnmounted } from "@vue/runtime-core";
import { defineComponent, ref, watch } from "vue";
import { io } from 'socket.io-client';
import { useKeypress } from "vue3-keypress";
import { onBeforeRouteLeave } from 'vue-router';
import { ParticlesBg } from "particles-bg-vue"; //https://github.com/lindelof/particles-bg-vue
import { getAvatarID, getUserInfos } from "../components/FetchFunctions"
import { useStore, Store } from "vuex";
import router from "../router/index";


export default defineComponent ({
	components: {
		ParticlesBg
	},
	setup() {
		const store = useStore() as Store<any>;
		const gameSocket = ref< any | null>(null);
		const matchesList = ref< any | null>(null);
		const matchId = ref<string | null>(null);
		const searchingGame = ref<boolean>(false);
		const fatalError = ref<boolean>(false);
		const gameData = ref<any>({
			pos: "" as string, //can be "left" or "right" OR the name of the left player if watching
			opponent: "" as string,
			ball: {x: 0 as number, y: 0 as number, radius: 10 as number},
			paddle:{ width: 5 as number, height: 15 as number},
			paddleL: { x: 0 as number, y: 0 as number},
			paddleR: { x: 0, y: 0 },
			score: { leftScore: 0, rightScore: 0 },
			winner: "",
		})
		const gameStarted = ref<boolean>(false);
		let canvas: HTMLCanvasElement | null = null;
		let ctx: CanvasRenderingContext2D | null = null;
		let framesId: number | undefined | null = null;
		let winText: string | null = null;
		let showInfo: boolean = true;
		const ballSpeed = ref<string>("NORMAL");
		const ballSize = ref<string>("NORMAL");
		const route: any = useRoute()
		const match404 = ref<boolean>(false);
		let waitForChatOpponent = ref<boolean>(false);

		onMounted(async() =>{
			try {
				gameSocket.value = store.getters.getGameSocket;
				if (gameSocket.value === null) {
					gameSocket.value = io('ws://:3000/game',{
						transportOptions: {
						polling: { extraHeaders: { auth: document.cookie }},
						withCredentials: true
					}});
					console.log("starting connection to game websocket");
				} else {
					if (store.getters.getWatchGame === false) {
						const opponentId = store.getters.getOpponentSocketId;
						waitForChatOpponent.value = true;
						searchingGame.value = true
						if (opponentId !== null) {
							gameSocket.value!.emit('invitToGame', { opponentSocketId: opponentId, ballSize: 'NORMAL', ballSpeed: 'NORMAL' });
						} else {
							setTimeout(() => {
								if (waitForChatOpponent.value === true) {
									waitForChatOpponent.value = false;
									searchingGame.value = false;
									gameSocket.value!.emit('checkIfInGame');
								}
							}, 7 * 1000);
						}
					}
					store.commit('setGameSocket', null);
					store.commit('setOpponentSocketId', null);
					store.commit('setWatchGame', false);
				}
			} catch (error) {
				console.log("the error is:" + error);
			}

			gameSocket.value!.on('secondConnection', function() {
				alert('Are you already connected somewhere else ? Some things may not work as intended.');
			})

			gameSocket.value!.on('joined', (text: string) => {
				console.log("joined" + text);
			})

			gameSocket.value!.on('foundMatch', (res: string) =>{
				if (waitForChatOpponent.value === true) {
					waitForChatOpponent.value = false;
				}
				matchId.value = res;
				console.log("found match:" + JSON.stringify(res));
				if (!res)
					gameStarted.value = false;
			})

			gameSocket.value!.on('opponentNotHere', () => {
				alert('Your opponent never joined game.');
				gameSocket.value.disconnect();
				router.push('/');
			})

			gameSocket.value!.on('beReady', (params: { pos: string, opponent: string }) => {
				console.log("beReady:");
				gameData.value!.pos = params.pos;
				gameData.value!.opponent = params.opponent;
				canvas = document.getElementById('pongGame') as HTMLCanvasElement;
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight;
				ctx = canvas.getContext('2d');
				gameStarted.value = true;
				console.log("max-width:" + canvas.width + " max-height:" + canvas.height);
			})

			gameSocket.value!.on('dimensions', (params: { ballRad: number, padLength: number, padWidth: number }) =>{
				console.log("dimensions:");
				gameData.value.ball.radius = params.ballRad;
				gameData.value.paddle.height = params.padWidth;
				gameData.value.paddle.width = params.padLength;
			})

			gameSocket.value!.on('countdown', (params: { countdown: number }) =>{
				console.log("countdown:" + params.countdown);
			})

			gameSocket.value!.on('gameStarting', () =>{
				console.log("gameStarting:");
				showInfo = false;
			})

			gameSocket.value!.on('gameUpdate', (params: { ball: { x: number, y: number }, paddle: { L: { x: number, y: number }, R: { x : number, y: number }}} ) =>{
				gameData.value.ball.x = params.ball.x;
				gameData.value.ball.y = params.ball.y;
				gameData.value.paddleL = params.paddle.L;
				gameData.value.paddleR = params.paddle.R;
			})

			gameSocket.value!.on('score', (params: { leftScore: number, rightScore: number }) =>{
				gameData.value.score = params;
			})

			gameSocket.value!.on('endGame', (params: { winner: string }) =>{
				console.log("endGame:" + JSON.stringify(params));
				gameData.value.winner = params.winner;
				if (params.winner != gameData.value.opponent)
					winText = "well done neo keep dreaming";
				else if (!route.query.watch)
					winText = "wake up neo stop loosing";
				else
					winText = params.winner + " has won";
			})

			gameSocket.value!.on('requestError', () =>{
				gameSocket.value!.disconnect();
			})

			gameSocket.value!.on('ongoingGame', async (params: { matchId: number, leftPlayer: string, rightPlayer: string }) =>{
				console.log(params)
				const leftInfo = await getUserInfos(params.leftPlayer)
				const rightInfo = await getUserInfos(params.rightPlayer)
				matchesList.value = {
					...matchesList.value,
					[params.matchId]: {
						matchId: params.matchId,
						leftPlayer: params.leftPlayer,
						rightPlayer: params.rightPlayer,
						avatarLeft: await getAvatarID(leftInfo.id!),
						avatarRight: await getAvatarID(rightInfo.id!),
					}
				}
			})

			gameSocket.value!.on('newList', () =>{
				console.log("new list")
				matchesList.value = null;
			})

			gameSocket.value!.on('endList', () =>{
				console.log("end list")
				if (route.query.matchid)
				{
					gameSocket.value!.emit('followGame', route.query.matchid)
					match404.value = true;
				}
			})

			gameSocket.value!.onopen = (event: Event) => {
				console.log("event: " + event)
				console.log("connected to the server")
			}

			gameSocket.value!.onclose = (event: Event) => {
				console.log("event close: " + event)
				fatalError.value = true
			}

			gameSocket.value!.on('disconnect', () => {
				alert('Something went wrong. You\'ll be disconnected from game.');
				router.push('/');
			})

			gameSocket.value!.on('opponentDisconnected', () => {
				alert('Your opponent disconnected.');
				router.push('/');
			})

			gameSocket.value!.on('matchId', (matchId: {matchId : number, leftPlayer: string, rightPlayer: string}) => {
				console.log("matchid")
				console.log(matchId)
				router.push('redirect?' + new URLSearchParams({url: ('/game?watch=true&matchid=' + matchId.matchId)}));
			})

			gameSocket.value!.on('notAvailable', () => {
				console.log("notavailable")
				match404.value = true
			})

			window.addEventListener('resize', resizeCanvas);

			if (route.query.user)
				setTimeout(function () {gameSocket.value!.emit('getMatchByUser', {playerName: route.query.user})}, 600)

			if (route.query.watch)
				setTimeout(function () {WatchGame()}, 600)
		})

		onUnmounted(async() => {
			gameSocket.value.disconnect();
		})

		watch(gameStarted, (gameChange) =>{
			if (gameChange)
			{
				if (!canvas)
				{
					canvas = document.getElementById('pongGame') as HTMLCanvasElement;
					canvas.width = window.innerWidth
					canvas.height = window.innerHeight
					ctx = canvas.getContext('2d');
				}
				framesId = window.setInterval(renderFrame, 16)
			}
			else
				window.clearInterval(framesId!)
		})

		function FollowGame(id: number){
			console.log("FollowGame")
			gameSocket.value!.emit('followGame', id);
		}

		function goToFollowGame(id: number){
			router.push('/redirect?' + new URLSearchParams({url: ('/game?watch=true&matchid=' + id)}))
		}

		onBeforeRouteLeave(() => {
			gameSocket.value.disconnect()
		})

		function resizeCanvas(){
			if (canvas){
			canvas.width = window.innerWidth
			canvas.height = window.innerHeight
			}
		}

		function WatchGame(){
			console.log("watchGame")
			gameSocket.value!.emit('watchGame', {})
		}

		function Play(){
			gameSocket.value.emit('joinGame', {
				ballSize: ballSize.value,
				ballSpeed: ballSpeed.value,
			})
			searchingGame.value = true
			console.log("joinGame")
		}

		function AcceptGame(){
			gameSocket.value.emit('acceptGame', matchId.value)
			console.log("acceptGame")
		}

		function Disconnect(){
			gameSocket.value.disconnect()
			console.log("disconnect")
		}

		function renderFrame() {
			ctx!.fillStyle = '#000';
			ctx!.fillRect(0, 0, canvas!.width, canvas!.height)
			ctx!.fillStyle = '#00ff00'
			ctx!.fillRect(gameData.value.paddleL.x * canvas!.width, gameData.value.paddleL.y * canvas!.height, gameData.value.paddle.width * canvas!.width, gameData.value.paddle.height * canvas!.height)
			ctx!.fillRect(gameData.value.paddleR.x * canvas!.width, gameData.value.paddleR.y * canvas!.height, gameData.value.paddle.width * canvas!.width, gameData.value.paddle.height * canvas!.height)
			if (!winText){
				ctx!.beginPath()
				ctx!.arc(gameData.value.ball.x * canvas!.width,gameData.value.ball.y * canvas!.height, gameData.value.ball.radius * canvas!.height, 0, Math.PI*2, false)
				ctx!.closePath()
				ctx!.fill()
			}
			ctx!.font = canvas!.width/3 + "%" + " Monospace"
			ctx!.fillText(gameData.value.score.leftScore.toString(), 0.4 * canvas!.width, 0.1 * canvas!.height);
			ctx!.fillText(gameData.value.score.rightScore.toString(), 0.6 * canvas!.width, 0.1 * canvas!.height);

			if (winText)
			{
				ctx!.font = canvas!.width/4 + "%" + " Spotnik"
				ctx!.fillText(winText, 0.2 * canvas!.width, 0.5 * canvas!.height);
			}
			if (showInfo){
				if (gameData.value.pos == "left")
					ctx!.drawImage(document.getElementById('left_arrow') as HTMLCanvasElement, 0.2 * canvas!.width, 0.35 * canvas!.height, 0.15 * canvas!.width, 0.25 * canvas!.height)
				else if (gameData.value.pos == "right")
					ctx!.drawImage(document.getElementById('right_arrow') as HTMLCanvasElement, 0.6 * canvas!.width, 0.35 * canvas!.height, 0.15 * canvas!.width, 0.25 * canvas!.height)
				ctx!.font = canvas!.width/4 + "%" + " Spotnik"
				if (gameData.value.pos != "left" && gameData.value.pos != "right")
					ctx!.fillText(gameData.value.pos + " VS " + gameData.value.opponent, 0.25 * canvas!.width, 0.9 * canvas!.height);
				else
					ctx!.fillText("VS " + gameData.value.opponent, 0.35 * canvas!.width, 0.9 * canvas!.height);
			}
		}

		useKeypress({
		keyEvent: "keydown",
		keyBinds: [
			{
				keyCode: 87,
				success: () => {
					if (!route.query.watch)
						gameSocket.value.emit('gameInput', {matchId: matchId.value, input: "UP"})
				},
			},
			{
				keyCode: 83,
				success: () => {
					if (!route.query.watch)
						gameSocket.value.emit('gameInput', {matchId: matchId.value, input: "DOWN"})
				},
			},
		]
		})

		return { Disconnect,
		Play,
		AcceptGame,
		matchId,
		fatalError,
		gameData,
		gameStarted,
		searchingGame,
		ballSize,
		ballSpeed,
		WatchGame,
		route,
		matchesList,
		FollowGame,
		goToFollowGame,
		match404,
		waitForChatOpponent}
	},
})
</script>

<style>

h1 {
	justify: end;
}

.params{
	display: flex;
	flex-direction: row;
	justify-content: space-around;
}


.button_slick {
  color: #FFF;
  border: 2px solid rgb(216, 2, 134);
  background-color: #162944;
  border-radius: 0px;
  padding: 18px 36px;
  display: inline-block;
  /* font-family: monospace; */
  font-size: 14px;
  letter-spacing: 1px;
  box-shadow: inset 0 0 0 0 #D80286;
  -webkit-transition: ease-out 0.4s;
  -moz-transition: ease-out 0.4s;
  transition: ease-out 0.4s;
}

.button_slide:hover {
	cursor: pointer;
	box-shadow: inset 0 100px 0 0 #D80286;
}

.clickable{
	cursor: pointer;
}

</style>

<style scoped>
@import url('https://fonts.googleapis.com/css?family=Rajdhani:300&display=swap');

.custom_offset {
  margin-top: 80px;
}

.big_text {
	font-size: 350%;
	font-weight: bold;
	color: #EA25B5;
}

.text_custom {
	font-family: 'Rajdhani', sans-serif;
	color: #04BBEC;
}

.big_button {
  margin: 180px auto 0 auto;
}

</style>
