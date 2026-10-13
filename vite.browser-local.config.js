import {mergeConfig} from 'vite';
import base from './vite.config.js';
export default mergeConfig(base,{build:{outDir:'dist-browser-local',rollupOptions:{input:{demo:'examples/browser-local.html','article-voice':'src/article-voice.js'}}}});
