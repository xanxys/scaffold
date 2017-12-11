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
            args: ['./app.js'],
        });
        return this.app.start().then(_ => this.app.client.waitUntilWindowLoaded());
    });

    afterEach(function () {
        if (this.app) {
            return this.app.stop();
        }
    });

    it('renders main toolbar & sidepanel headers', function () {
        return Promise.all([
            this.app.client.getText("=S60C"),
            this.app.client.getText("h2=Plan"),
            this.app.client.getText("h2=Workers"),
        ]);
    });
});
