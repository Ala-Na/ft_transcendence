import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import NotFound from '../views/NotFound.vue'
import LoginPage from "../views/LoginPage.vue";
import UserPage from "../views/UserPage.vue";
import TwoAuth from "../views/TwoAuthPage.vue";
import TheGame from "../views/TheGame.vue";
import EditUser from "../views/EditUser.vue";

const routes = [
	{
		path: '/',
		name: "Home",
		component: HomePage,
	},
	{
		path: '/login',
		name: "login",
		component: LoginPage
	},
	{
		path: '/:catchAll(.*)',
		name: "404",
		component: NotFound,
	},
	{
		path: '/user',
		name: "user",
		component: UserPage
	},
	{
		path: '/2auth',
		name: "twoAuth",
		component: TwoAuth
	},
	{
		path: '/game',
		name: "TheGame",
		component: TheGame
	},
	{
		path: '/user/edit',
		name: "editUser",
		component: EditUser
	}
]
	const router = createRouter({
	history: createWebHistory(process.env.BASE_URL),
	routes
})

export default router