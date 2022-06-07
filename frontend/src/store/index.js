import {createStore} from "vuex"

const store = createStore({
	state: {
		user: {
			nickname:	"",
			friends:	[],
			status:	"",
			eloScore:	0,
		},
		connected: false,
		need2fa: false,

		channels: [],
	},
	getters: {
		whoAmI:(state) => {
			return state.user;
		},
		isConnected:(state) => {
			return state.connected && !state.need2fa;
		},
		need2Fa:(state) => {
			return state.need2fa;
		},

		getChannels:(state) => {
			return state.channels;
		}
	},
	mutations: {
		setUser(state, user) {
			state.user = user;
		},
		setConnected(state, connected) {
			state.connected = connected[0];
			state.need2fa = connected[1];
		},
		setNeed2FA(state, TwoFA) {
			state.need2fa = TwoFA;
		},

		setChannels(state, chanarray) {
			state.channels = chanarray;
		}
	},
	actions: {},
})



export default store
