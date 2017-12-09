// Initialize bootstrap.
import $ from 'jquery';
global.jQuery = $;
require('bootstrap');

// Components
import Vue from 'vue/dist/vue.js';

import TheToolbar from './the-toolbar.vue';
Vue.component('the-toolbar', TheToolbar);

import TheSidepanel from './the-sidepanel.vue';
Vue.component('the-sidepanel', TheSidepanel);

import ThePlanToolbar from './the-plan-toolbar.vue';
Vue.component('the-plan-toolbar', ThePlanToolbar);

import Timeline from './timeline.vue';
Vue.component('timeline', Timeline);

import TheTabWorker from './the-tab-worker.vue';
Vue.component('the-tab-worker', TheTabWorker);

// Hand over exec to TypeScript land.
import { runMain } from './main.ts';
runMain();
