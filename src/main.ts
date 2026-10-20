import { mount } from 'svelte';
import App from './App.svelte';
import { AppState } from './lib/app.svelte';
import { createPlatform } from './lib/platform';
import { showStartupError, watchErrors } from './lib/startup';
import './styles/app.css';

async function start() {
  const platform = await createPlatform();
  const audio = new Audio();
  // CORS mode, so the equalizer (Web Audio) may process the stream; the proxy allows the app.
  audio.crossOrigin = 'anonymous';
  const app = new AppState(platform, audio);
  mount(App, { target: document.getElementById('app')!, props: { app } });
  await app.init();
}

watchErrors();
start().catch(showStartupError);
