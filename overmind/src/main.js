// Initialize bootstrap.
import $ from 'jquery';
global.jQuery = $;
require('bootstrap');

// Components
import Vue from 'vue/dist/vue.js';

import TheToolbar from './components/the-toolbar.vue';
Vue.component('the-toolbar', TheToolbar);

import TheSidepanel from './components/the-sidepanel.vue';
Vue.component('the-sidepanel', TheSidepanel);


import TheTabPlan from './components/the-tab-plan.vue';
Vue.component('the-tab-plan', TheTabPlan);

import ThePlanToolbar from './components/the-plan-toolbar.vue';
Vue.component('the-plan-toolbar', ThePlanToolbar);

import Timeline from './components/timeline.vue';
Vue.component('timeline', Timeline);


import TheTabWorker from './components/the-tab-worker.vue';
Vue.component('the-tab-worker', TheTabWorker);

// Hand over exec to TypeScript land.
import { remote } from 'electron';
import { runMain } from './main.ts';
runMain(remote.getGlobal('parsedArgs'));
