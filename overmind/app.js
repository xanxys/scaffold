const electron = require('electron');
const argv = require('argv');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;


require('electron-reload')(__dirname, {
    ignored: /node_modules|fake|state|[\/\\]\./
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1500,
        height: 1000
    });
    mainWindow.loadURL(`file://${__dirname}/index.html`);
    if (global.parsedArgs.dev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
    BrowserWindow.addDevToolsExtension('node_modules/vue-devtools/vender');


    global.parsedArgs = {};
    global.parsedArgs['dev'] = process.argv.some(arg => arg === '--dev');

    const prefix = '--fake-packet=';
    const arg = process.argv.find(arg => arg.startsWith('--fake-packet='));
    if (arg) {
        global.parsedArgs['fake-packet'] = arg.substr(prefix.length);
    }
    // For whatever reason, argv.run(process.argv) freezes (resulting in test timeout failure) in spectron (npm test).

    /*
    argv.option([
        {
            name: 'dev',
            type: 'boolean',
        },
        {
            name: 'fake-packet',
            type: 'string',
        }
    ]).run(process.argv);
    */

    createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow()
    }
});
