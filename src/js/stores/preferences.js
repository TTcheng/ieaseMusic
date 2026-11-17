
import path from 'path';
import { observable, action } from 'mobx';
import { remote, ipcRenderer } from 'electron';
import axios from 'axios';

import pkg from 'root/package.json';
import controller from './controller';
import config from 'config/index';
import theme from 'config/theme.js';
import storage from 'common/storage';
import lastfm from 'utils/lastfm';

// macOS 走系统惯例（永远有菜单栏），所以菜单栏开关对它没有意义，UI 上要隐藏
const isMacOS = remote.process.platform === 'darwin';

class Preferences {
    @observable show = false;
    @observable showTray = false;
    // 菜单栏开关，统管 Linux 与 Windows（macOS 始终有菜单栏）
    @observable showMenuBar = false;
    @observable revertTrayIcon = false;
    @observable alwaysOnTop = false;
    @observable showNotification = true;
    @observable autoPlay = true;
    @observable volume = 1;
    @observable port = config.api.port;
    @observable highquality = 0;
    @observable autoupdate = false;
    @observable lastfm = {
        username: '', // Your last.fm username
        password: '', // Your last.fm password
    };
    @observable connecting = false;
    @observable scrobble = true;
    @observable proxy = '';
    @observable downloads = path.join(remote.app.getPath('music'), pkg.name);

    @action async init() {
        var preferences = await storage.get('preferences');

        var {
            showTray = self.showTray,
            showMenuBar = self.showMenuBar,
            revertTrayIcon = self.revertTrayIcon,
            alwaysOnTop = self.alwaysOnTop,
            showNotification = self.showNotification,
            autoPlay = self.autoPlay,
            port = self.port,
            volume = self.volume,
            highquality = self.highquality,
            backgrounds = theme.playlist.backgrounds,
            autoupdate = self.autoupdate,
            scrobble = self.scrobble,
            lastfm = self.lastfm,
            proxy = self.proxy,
            downloads = self.downloads,
        } = preferences;

        self.showTray = !!showTray;
        self.showMenuBar = !!showMenuBar;
        self.revertTrayIcon = !!revertTrayIcon;
        self.alwaysOnTop = !!alwaysOnTop;
        self.showNotification = !!showNotification;
        self.autoPlay = !!autoPlay;
        self.port = port || config.api.port;
        self.volume = +volume || 1;
        self.highquality = +highquality || 0;
        self.backgrounds = backgrounds;
        self.autoupdate = autoupdate;
        self.scrobble = scrobble;
        self.lastfm = lastfm;
        self.proxy = proxy;
        self.downloads = downloads;

        // Save preferences
        self.save();
        axios.defaults.baseURL = `http://localhost:${self.port}`;

        return preferences;
    }

    @action async save() {
        var { showTray, showMenuBar, revertTrayIcon, alwaysOnTop, showNotification, autoPlay, port, volume, highquality, backgrounds, autoupdate, scrobble, lastfm, proxy, downloads } = self;

        await storage.set('preferences', {
            showTray,
            showMenuBar,
            revertTrayIcon,
            alwaysOnTop,
            showNotification,
            autoPlay,
            port,
            volume,
            highquality,
            backgrounds,
            autoupdate,
            scrobble,
            lastfm,
            proxy,
            downloads,
        });

        ipcRenderer.send('update-preferences', {
            playing: controller.playing,
            showTray,
            alwaysOnTop,
            proxy,
            revertTrayIcon,
            showMenuBar
        });
    }

    @action setShowTray(showTray) {
        self.showTray = showTray;
        self.save();
    }

    @action setShowMenuBar(showMenuBar) {
        self.showMenuBar = showMenuBar;
        self.save();
    }

    @action setRevertTrayIcon(revertTrayIcon) {
        self.revertTrayIcon = revertTrayIcon;
        self.save();
    }

    @action setAlwaysOnTop(alwaysOnTop) {
        self.alwaysOnTop = alwaysOnTop;
        self.save();
    }

    @action setShowNotification(showNotification) {
        self.showNotification = showNotification;
        self.save();
    }

    @action setAutoPlay(autoPlay) {
        self.autoPlay = autoPlay;
        self.save();
    }

    @action setBackgrounds(backgrounds) {
        self.backgrounds = backgrounds;
        self.save();
    }

    @action setLastfm(lastfm) {
        self.lastfm = lastfm;
        self.save();
    }

    @action setVolume(volume) {
        self.volume = volume;
        self.save();
    }

    @action setHighquality(highquality) {
        self.highquality = highquality;
        self.save();
    }

    @action setScrobble(scrobble) {
        self.scrobble = scrobble;
        self.save();
    }

    @action setAutoupdate(autoupdate) {
        self.autoupdate = autoupdate;
        self.save();
    }

    @action setPort(port) {
        if (port < 1000
            || port > 65535) {
            port = config.api.port;
        }

        self.port = port;
        self.save();
    }

    @action setDownloads(downloads) {
        self.downloads = downloads.path;
        self.save();
    }

    @action setProxy(proxy) {
        if (!/^http(s)?:\/\/\w+/i.test(proxy)) {
            proxy = '';
        }

        self.proxy = proxy;
        self.save();
    }

    @action async connect() {
        var { username, password } = self.lastfm;

        self.connecting = true;

        var success = await lastfm.initialize(username, password);

        if (success) {
            self.setLastfm({
                username,
                password,
                connected: `${username}:${password}`,
            });
        }

        self.connecting = false;
    }

    // macOS 始终有菜单栏，这个开关对它无意义，UI 上不显示
    get isMacOS() {
        return isMacOS;
    }
}

const self = new Preferences();
export default self;
