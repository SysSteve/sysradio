import { mount } from 'svelte';
import MiniApp from './MiniApp.svelte';
import { createPlatform } from './lib/platform';
import './styles/app.css';

const platform = await createPlatform();
mount(MiniApp, { target: document.getElementById('app')!, props: { platform } });
