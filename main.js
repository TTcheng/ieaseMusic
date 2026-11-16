
import path from 'path';
import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, shell, powerMonitor } from 'electron';
import windowStateKeeper from 'electron-window-state';
import storage from 'electron-json-storage';
import axios from 'axios';
import _debug from 'debug';

import pkg from './package.json';
import config from './config';
import api from './server/api';
import usocket from './server/usocket';
import { updater, downloader } from './submodules';

const _PLATFORM = process.platform;

let debug = _debug('dev:main');
let error = _debug('dev:main:error');
let apiServer;
let forceQuit = false;
let quitting = false;
let menu;
let tray;
let mainWindow;
let isOsx = _PLATFORM === 'darwin';
let isLinux = _PLATFORM === 'linux';

// 菜单栏开关，统管 Linux 与 Windows。macOS 走系统惯例（永远有菜单栏），
// 不受这个开关影响。
let showMenuBar = false;
let revertTrayIcon = false;

// Shared data to other applocation via a unix socket file
let shared = {
    modes: [],
    track: {},
    playing: false,
    playlist: []
};
let mainMenu = [
    {
        label: 'ieaseMusic',
        submenu: [
            {
                label: `About ieaseMusic`,
                selector: 'orderFrontStandardAboutPanel:',
            },
            {
                label: 'Preferences...',
                accelerator: 'CmdOrCtrl+,',
                click() {
                    mainWindow.webContents.send('show-preferences');
                }
            },
            {
                type: 'separator'
            },
            {
                role: 'hide'
            },
            {
                role: 'hideothers'
            },
            {
                role: 'unhide'
            },
            {
                type: 'separator'
            },
            {
                label: 'Check for updates',
                accelerator: 'CmdOrCtrl+U',
                click() {
                    updater.checkForUpdates();
                }
            },
            {
                label: 'Quit',
                accelerator: 'CmdOrCtrl+Q',
                selector: 'terminate:',
                click() {
                    goodbye();
                }
            }
        ]
    },
    {
        label: 'Controls',
        submenu: [
            {
                label: 'Pause',
                accelerator: 'Space',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-toggle');
                }
            },
            {
                label: 'Next',
                accelerator: 'Right',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-next');
                }
            },
            {
                label: 'Previous',
                accelerator: 'Left',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-previous');
                }
            },
            {
                label: 'Increase Volume',
                accelerator: 'Up',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-volume-up');
                }
            },
            {
                label: 'Decrease Volume',
                accelerator: 'Down',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-volume-down');
                }
            },
            {
                label: 'Like',
                accelerator: 'CmdOrCtrl+L',
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-like');
                }
            },
        ],
    },
    {
        label: 'Recently Played',
        submenu: [
            {
                label: 'Nothing...',
            }
        ],
    },
    {
        label: 'Next Up',
        submenu: [
            {
                label: 'Nothing...',
            }
        ],
    },
    {
        label: 'Edit',
        submenu: [
            {
                role: 'undo'
            },
            {
                role: 'redo'
            },
            {
                type: 'separator'
            },
            {
                role: 'cut'
            },
            {
                role: 'copy'
            },
            {
                role: 'paste'
            },
            {
                role: 'pasteandmatchstyle'
            },
            {
                role: 'delete'
            },
            {
                role: 'selectall'
            }
        ]
    },
    {
        label: 'View',
        submenu: [
            {
                label: 'Home',
                accelerator: 'CmdOrCtrl+Shift+H',
                click() {
                    mainWindow.webContents.send('show-home');
                }
            },
            {
                label: 'Search',
                accelerator: 'CmdOrCtrl+F',
                click() {
                    mainWindow.webContents.send('show-search');
                }
            },
            {
                label: 'Top podcasts',
                accelerator: 'CmdOrCtrl+Shift+T',
                click() {
                    mainWindow.webContents.send('show-top');
                }
            },
            {
                label: 'Playlist',
                accelerator: 'CmdOrCtrl+Shift+P',
                click() {
                    mainWindow.webContents.send('show-playlist');
                }
            },
            {
                label: 'Made For You',
                accelerator: 'CmdOrCtrl+Shift+F',
                click() {
                    mainWindow.webContents.send('show-fm');
                }
            },
            {
                label: 'Downloads',
                accelerator: 'CmdOrCtrl+Shift+D',
                click() {
                    downloader.showDownloader();
                }
            },
            {
                type: 'separator',
            },
            {
                label: 'Menu',
                accelerator: 'CmdOrCtrl+Shift+L',
                click() {
                    mainWindow.webContents.send('show-menu');
                }
            },
            {
                label: 'Next Up',
                accelerator: 'CmdOrCtrl+P',
                click() {
                    mainWindow.webContents.send('show-playing');
                }
            },
            {
                type: 'separator'
            },
            {
                role: 'toggledevtools'
            },
        ]
    },
    {
        role: 'window',
        submenu: [
            {
                role: 'minimize'
            },
            {
                role: 'close'
            }
        ]
    },
    {
        role: 'help',
        submenu: [
            {
                label: 'Bug report 🐛',
                click() {
                    shell.openExternal('https://github.com/trazyn/ieaseMusic/issues');
                }
            },
            {
                label: 'Fork me on Github 🚀',
                click() {
                    shell.openExternal('https://github.com/trazyn/ieaseMusic');
                }
            },
            {
                type: 'separator'
            },
            {
                label: '💕 Follow me on Twitter 👏',
                click() {
                    shell.openExternal('https://twitter.com/var_darling');
                }
            }
        ]
    }
];
let trayMenu = [
    {
        label: 'Pause',
        click() {
            mainWindow.webContents.send('player-toggle');
        }
    },
    {
        label: 'Next',
        click() {
            mainWindow.webContents.send('player-next');
        }
    },
    {
        label: 'Previous',
        click() {
            mainWindow.webContents.send('player-previous');
        }
    },
    {
        type: 'separator'
    },
    {
        label: 'Preferences...',
        accelerator: 'CmdOrCtrl+,',
        click() {
            mainWindow.webContents.send('show-preferences');
        }
    },
    {
        type: 'separator'
    },
    {
        label: 'Toggle main window',
        click() {
            let isVisible = mainWindow.isVisible();
            isVisible ? mainWindow.hide() : mainWindow.show();
        }
    },
    {
        type: 'separator'
    },
    {
        label: 'Check for updates',
        accelerator: 'CmdOrCtrl+U',
        click() {
            updater.checkForUpdates();
        }
    },
    {
        label: 'Fork me on Github',
        click() {
            shell.openExternal('https://github.com/trazyn/ieaseMusic');
        }
    },
    {
        type: 'separator'
    },
    {
        label: 'Toggle DevTools',
        accelerator: 'Alt+CmdOrCtrl+I',
        click() {
            mainWindow.show();
            mainWindow.toggleDevTools();
        }
    },
    {
        type: 'separator'
    },
    {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        selector: 'terminate:',
        click() {
            goodbye();
        }
    }
];
let dockMenu = [
    {
        label: 'Toggle Player',
        accelerator: 'Space',
        click() {
            mainWindow.show();
            mainWindow.webContents.send('player-toggle');
        }
    },
    {
        label: 'Next',
        accelerator: 'Right',
        click() {
            mainWindow.show();
            mainWindow.webContents.send('player-next');
        }
    },
    {
        label: 'Previous',
        accelerator: 'Left',
        click() {
            mainWindow.show();
            mainWindow.webContents.send('player-previous');
        }
    },
    {
        label: 'Like',
        accelerator: 'CmdOrCtrl+L',
        click() {
            mainWindow.show();
            mainWindow.webContents.send('player-like');
        }
    },
];

/**
 * 按 showMenuBar 开关装卸菜单栏。
 *
 * macOS 始终有菜单栏（系统惯例），Linux 与 Windows 受开关控制。
 * 关闭时把窗口菜单与应用菜单都摘掉，否则 Windows 标题栏下仍会留一条。
 */
function applyMenuBar() {
    if (isOsx) {
        updateMenu();
        return;
    }

    if (showMenuBar) {
        // updateMenu 内部会 setApplicationMenu，这里不要碰窗口菜单，
        // 否则会把刚装上的菜单又摘掉。
        updateMenu();
        return;
    }

    if (mainWindow) {
        mainWindow.setMenu(null);
    }

    Menu.setApplicationMenu(null);
}

function updateMenu(playing) {
    // macOS 永远有菜单栏（系统惯例）；Linux 与 Windows 由 showMenuBar 统管。
    if (!isOsx && !showMenuBar) {
        return;
    }

    mainMenu[1]['submenu'][0]['label'] = playing ? 'Pause' : 'Play';
    menu = Menu.buildFromTemplate(mainMenu);

    Menu.setApplicationMenu(menu);
}

function updateTray(playing) {
    // Update unread mesage count
    trayMenu[0].label = playing ? 'Pause' : 'Play';

    let contextmenu = Menu.buildFromTemplate(trayMenu);
    let icon = playing
        ? `${__dirname}/src/assets/playing.png`
        : `${__dirname}/src/assets/notplaying.png`
        ;

    if (revertTrayIcon) {
        icon = playing
            ? `${__dirname}/src/assets/playing-dark-panel.png`
            : `${__dirname}/src/assets/notplaying-dark-panel.png`
        ;
    }

    if (!tray) {
        // Init tray icon
        tray = new Tray(icon);

        tray.on('right-click', () => {
            tray.popUpContextMenu();
        });
    }

    tray.setImage(icon);
    tray.setContextMenu(contextmenu);
}

function registerGlobalShortcut() {
    // Play the next song
    globalShortcut.register('MediaNextTrack', e => {
        mainWindow.webContents.send('player-next');
    });

    // Play the previous song
    globalShortcut.register('MediaPreviousTrack', e => {
        mainWindow.webContents.send('player-previous');
    });

    // Toggle the player
    globalShortcut.register('MediaPlayPause', e => {
        mainWindow.webContents.send('player-toggle');
    });
}

const goodbye = () => {
    forceQuit = true;
    app.quit();
};

const createMainWindow = () => {
    var mainWindowState = windowStateKeeper({
        defaultWidth: 800,
        defaultHeight: 520,
    });

    mainWindow = new BrowserWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        show: false,
        width: 800,
        height: 520,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        backgroundColor: 'none',
        titleBarStyle: 'hiddenInset',
    });

    if (isLinux) {
        mainWindow.setIcon(
            path.join(__dirname, 'src/assets/dock.png')
        );
    }

    // 菜单栏：macOS 始终有，Linux/Windows 由 showMenuBar 决定
    applyMenuBar();

    mainWindowState.manage(mainWindow);
    mainWindow.loadURL(`file://${__dirname}/src/index.html`);

    mainWindow.webContents.on('did-finish-load', () => {
        try {
            mainWindow.show();
            mainWindow.focus();
        } catch (ex) { }
    });

    mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', e => {
        if (isLinux) {
            app.quit();
            return;
        }

        if (forceQuit) {
            app.quit();
        } else {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    // Update the history menu
    ipcMain.on('update-history', (event, args) => {
        var historyMenu = mainMenu.find(e => e.label === 'Recently Played');
        var submenu = args.songs.map((e, index) => {
            return {
                label: e.name,
                accelerator: `CmdOrCtrl+${index}`,
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-play', {
                        id: e.id,
                    });
                }
            };
        });

        historyMenu.submenu = submenu;
        updateMenu();
    });

    // Update next up menu
    ipcMain.on('update-playing', async(event, args) => {
        var playingMenu = mainMenu.find(e => e.label === 'Next Up');
        var submenu = args.songs.map((e, index) => {
            return {
                label: e.name,
                click() {
                    mainWindow.show();
                    mainWindow.webContents.send('player-play', {
                        id: e.id,
                    });
                }
            };
        });

        shared.playlist = args.songs;
        playingMenu.submenu = submenu;
        updateMenu();
    });

    // Update menu icon image and controls menu
    ipcMain.on('update-status', (event, args) => {
        var { playing, song, modes } = args;

        if (tray) {
            updateTray(playing, song);
        }

        shared.modes = modes;
        shared.track = song;
        shared.playing = +playing;
        updateMenu(playing);
    });

    // Show/Hide menu icon
    ipcMain.on('update-preferences', (event, args = {}) => {
        var proxyOptions = { proxyBypassRules: 'localhost' };
        var proxy = args.proxy || '';

        if (proxy.endsWith('.pac')) {
            proxyOptions.pacScript = proxy;
        } else {
            proxyOptions.proxyRules = proxy;
        }

        mainWindow.setAlwaysOnTop(!!args.alwaysOnTop);
        mainWindow.webContents.session.setProxy(
            proxyOptions,
            () => debug('Apply proxy: %s', args.proxy)
        );

        revertTrayIcon = args.revertTrayIcon;

        // 菜单栏开关立即生效，不必重启
        if (args.showMenuBar !== undefined && args.showMenuBar !== showMenuBar) {
            showMenuBar = !!args.showMenuBar;
            applyMenuBar();
        }

        if (!args.showTray) {
            if (tray) {
                tray.destroy();
                tray = null;
            }

            return;
        }

        updateTray(args.playing);
    });

    // Show the main window
    ipcMain.on('show', event => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Minimize the window
    ipcMain.on('minimize', event => {
        mainWindow.minimize();
    });

    // Quit app
    ipcMain.on('goodbye', () => goodbye());

    // A javaScript error occured in the main process
    process.on('uncaughtException', (ex) => {
        error(ex);
    });

    // App has suspend
    powerMonitor.on('suspend', () => {
        mainWindow.webContents.send('player-pause');
    });

    if (isOsx) {
        // App about
        app.setAboutPanelOptions({
            applicationName: 'ieaseMusic',
            applicationVersion: pkg.version,
            copyright: 'Made with 💖 by trazyn. \n https://github.com/trazyn/ieaseMusic',
            credits: `With the invaluable help of: \n github.com/Binaryify/NeteaseCloudMusicApi`,
            version: pkg.version
        });
        app.dock.setMenu(Menu.buildFromTemplate(dockMenu));
    }

    mainWindow.goodbye = () => goodbye();

    updateMenu();
    registerGlobalShortcut();
    usocket(shared, mainWindow);
    updater.installAutoUpdater(() => goodbye());
    downloader.createDownloader();
    mainWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8');

    global.mainWindow = mainWindow;
    debug('Create main process success 🍻');
};

app.setName('ieaseMusic');

app.on('activate', e => {
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
});
app.on('before-quit', e => {
    e.preventDefault();

    if (quitting) {
        return;
    }

    apiServer && apiServer.close();

    // Fix issues #14
    forceQuit = true;
    quitting = true;
    mainWindow = null;

    app.exit(0);
    process.exit(0);
});
app.on('ready', async() => {
    storage.get('preferences', (err, preferences = {}) => {
        if (err) {
            throw err;
        }

        var port = config.api.port || preferences.port;

        showMenuBar = !!preferences.showMenuBar;
        revertTrayIcon = preferences.revertTrayIcon;

        createMainWindow();
        updater.checkForUpdates(preferences.autoupdate);

        axios.defaults.baseURL = `http://localhost:${port}`;

        apiServer = api(
            port,
            preferences.proxy,
            err => {
                if (err) throw err;
                debug(`API server is running with port ${port} 👊`);
            }
        );
    });
});
