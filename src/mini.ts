import { mount } from 'svelte';
import MiniApp from './MiniApp.svelte';
import { createPlatform } from './lib/platform';
import { showStartupError, watchErrors } from './lib/startup';
import './styles/app.css';

async function start() {
  const platform = await createPlatform();
  mount(MiniApp, { target: document.getElementById('app')!, props: { platform } });
}

watchErrors();
start().catch(showStartupError);
