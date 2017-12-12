// cf. https://stackoverflow.com/questions/39020022/angular-2-unit-tests-cannot-find-name-describe/39945169#39945169
import { } from 'jasmine';
declare var require: any;
var Application = require('spectron').Application;
var assert = require('assert');

describe('application launch', function () {
    beforeEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10 * 1000;
        this.app = new Application({
            path: './node_modules/electron/dist/electron',
            args: ['./app.js', '--fake-packet=./fake/packets.json'],
        });
        return this.app.start().then(_ => this.app.client.waitUntilWindowLoaded());
    });

    afterEach(function () {
        if (this.app) {
            return this.app.stop();
        }
    });

    const sleep = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    it('renders main toolbar & sidepanel headers', function () {
        return Promise.all([
            this.app.client.getText("=S60C"),
            this.app.client.getText("h2=Plan"),
            this.app.client.getText("h2=Workers"),
        ]);
    });

    /* Workers tab */
    it('Show raw actions', function () {
        return this.app.client.click('*=Show raw actions');
    });

    /* Plan tab*/
    it('Generates Feeder1D plan & run sim', function () {
        return this.app.client.click('h2 button').then(_ => {
            return sleep(100); // wait for anim finish
        }).then(_ => {
            return this.app.client.click('button=PopulateForFeederPlan');
        }).then(_ => {
            return sleep(100); // wait for model load
        }).then(_ => {
            return this.app.client.click('button=GenFeederPlan');
        }).then(_ => {
            return this.app.client.getText("span=W1");  // timeline header
        }).then(_ => {
            return this.app.client.click('button=Sim Start');
        });
    });
});
