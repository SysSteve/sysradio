import { mount } from 'svelte';
import App from './App.svelte';
import { AppState } from './lib/app.svelte';
import { createPlatform } from './lib/platform';
import './styles/app.css';

const platform = await createPlatform();
const app = new AppState(platform, new Audio());
mount(App, { target: document.getElementById('app')!, props: { app } });
await app.init();
