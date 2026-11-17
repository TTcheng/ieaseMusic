
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Modal, ModalBody, ModalHeader } from 'ui/Modal';
import injectSheet, { ThemeProvider } from 'react-jss';
import clazz from 'classname';

import classes from './classes';
import Switch from 'ui/Switch';
import theme from 'config/theme';

@inject('preferences', 'source')
@observer
class Preferences extends Component {
    close() {
        this.props.preferences.show = false;
    }

    saveBackground(index, background) {
        var { preferences } = this.props;
        var backgrounds = preferences.backgrounds;

        backgrounds[index] = background;
        preferences.setBackgrounds(backgrounds);
    }

    saveLastfm() {
        var { preferences } = this.props;

        preferences.setLastfm({
            username: this.username.value,
            password: this.password.value,
            connected: preferences.lastfm.connected,
        });
    }

    /**
     * 切换音源。
     *
     * 切换会清掉当前登录态，需要重新登录 —— 先确认再切。
     */
    async switchSource(source) {
        var current = this.props.source.source;

        if (current === source) {
            return;
        }

        var confirmed = window.confirm(
            '切换音源会退出当前登录，需要重新登录。是否继续？'
        );

        if (!confirmed) {
            // 取消后把单选框拨回原值
            this.forceUpdate();

            return;
        }

        await this.props.source.setSource(source);
        this.props.preferences.show = false;

        window.location.hash = '#/login';
    }

    isConnected() {
        var { username, password, connected } = this.props.preferences.lastfm;

        return connected && `${username}:${password}` === connected;
    }

    choiceDownloadDir(e) {
        e.preventDefault();
        this.downloads.click();
    }

    renderOptions() {
        var { classes, preferences, source } = this.props;
        // source 是 store 实例，当前音源在 source.source 上
        var currentSource = source.source;
        var {
            showTray,
            setShowTray,
            showMenuBar,
            setShowMenuBar,
            isMacOS,
            revertTrayIcon,
            setRevertTrayIcon,
            alwaysOnTop,
            setAlwaysOnTop,
            autoPlay,
            setAutoPlay,
            showNotification,
            setShowNotification,
            port,
            setPort,
            highquality,
            setHighquality,
            backgrounds,
            autoupdate,
            setAutoupdate,
            scrobble,
            setScrobble,
            lastfm,
            connect,
            connecting,
            proxy,
            setProxy,
            downloads,
            setDownloads,
        } = preferences;
        return (
            <div className={classes.container}>
                <section>
                    <article>
                        <label htmlFor="alwaysOnTop">
                            <div>
                                <h4>Always on Top</h4>
                                <p>Make the player that stays on top</p>
                            </div>

                            <Switch
                                defaultChecked={alwaysOnTop}
                                id="alwaysOnTop"
                                onChange={e => setAlwaysOnTop(e.target.checked)} />
                        </label>

                        <label htmlFor="showTray">
                            <div>
                                <h4>Show menu bar icon</h4>
                                <p>If the menu bar icon is hidden, you can still access ieaseMusic using the dock icon.</p>
                            </div>

                            <Switch
                                defaultChecked={showTray}
                                id="showTray"
                                onChange={e => setShowTray(e.target.checked)} />
                        </label>

                        {
                            // macOS 始终有菜单栏，这个开关对它没有意义
                            isMacOS
                                ? false
                                : (
                                    <label htmlFor="showMenuBar">
                                        <div>
                                            <h4>Show menu bar</h4>
                                            <p>Windows 与 Linux 通用</p>
                                        </div>

                                        <Switch
                                            defaultChecked={showMenuBar}
                                            id="showMenuBar"
                                            onChange={e => setShowMenuBar(e.target.checked)} />
                                    </label>
                                )
                        }

                        <label htmlFor="revertTrayIcon">
                            <div>
                                <h4>Revert tray icon to fit dark panel</h4>
                            </div>

                            <Switch
                                defaultChecked={revertTrayIcon}
                                id="revertTrayIcon"
                                onChange={e => setRevertTrayIcon(e.target.checked)} />
                        </label>

                        <label htmlFor="autoPlay">
                            <h4>Auto play at started</h4>

                            <Switch
                                defaultChecked={autoPlay}
                                id="autoPlay"
                                onChange={e => setAutoPlay(e.target.checked)} />
                        </label>

                        <label htmlFor="showNotification">
                            <h4>Show desktop notifications</h4>

                            <Switch
                                defaultChecked={showNotification}
                                id="showNotification"
                                onChange={e => setShowNotification(e.target.checked)} />
                        </label>

                        <label htmlFor="highquality">
                            <div>
                                <h4>Only High Quality</h4>
                                <p>Only the high quality track accepted, Usually you not need enable this option.</p>
                            </div>

                            <Switch
                                defaultChecked={highquality}
                                id="highquality"
                                onChange={e => setHighquality(+e.target.checked)} />
                        </label>

                        <label htmlFor="autoupdate">
                            <h4>Auto update</h4>

                            <Switch
                                defaultChecked={autoupdate}
                                id="autoupdate"
                                onChange={e => setAutoupdate(+e.target.checked)} />
                        </label>

                        <label htmlFor="scrobble">
                            <h4>Scrobble to NeteaseCloud Music</h4>

                            <Switch
                                defaultChecked={scrobble}
                                id="scrobble"
                                onChange={e => setScrobble(+e.target.checked)} />
                        </label>

                        <label
                            style={{
                                display: 'block',
                            }}>
                            <div>
                                <h4>API server port</h4>
                                <p>After change port, you need restart the app.</p>
                            </div>

                            <input
                                className={classes.textInput}
                                min="1000"
                                max="65535"
                                defaultValue={port}
                                onBlur={ev => setPort(+ev.target.value)}
                                placeholder="1000 ~ 65535"
                                type="number" />
                        </label>

                        <label
                            style={{
                                display: 'block',
                            }}>
                            <div>
                                <h4>HTTP proxy</h4>
                                <p>Need restart app.</p>
                            </div>

                            <input
                                className={classes.textInput}
                                defaultValue={proxy}
                                onBlur={ev => setProxy(ev.target.value)}
                                placeholder="http://your.proxy.com:port"
                            />
                        </label>

                        <label className={classes.downloads}>
                            <aside>
                                <input
                                    webkitdirectory="true"
                                    onChange={e => setDownloads(e.target.files[0])}
                                    ref={ele => (this.downloads = ele)}
                                    type="file"
                                />
                                <h4>Downloads</h4>
                                <p onClick={e => this.choiceDownloadDir(e)}>{downloads}</p>
                            </aside>

                            <button onClick={e => this.choiceDownloadDir(e)}>Change</button>
                        </label>
                    </article>

                    <article>
                        <h3>
                            音源
                            <small>同一时间只使用一个音源，切换后需重新登录</small>
                        </h3>
                        <label htmlFor="sourceNetease">
                            <div>
                                <h4>网易云音乐</h4>
                                <p>在线曲库、榜单、歌单与红心</p>
                            </div>

                            <input
                                checked={currentSource === 'netease'}
                                id="sourceNetease"
                                name="source"
                                onChange={e => this.switchSource('netease')}
                                type="radio" />
                        </label>

                        <label htmlFor="sourceFnos">
                            <div>
                                <h4>飞牛音乐（NAS 曲库）</h4>
                                <p>搜索并播放本机曲库，支持 FLAC</p>
                            </div>

                            <input
                                checked={currentSource === 'fnos'}
                                id="sourceFnos"
                                name="source"
                                onChange={e => this.switchSource('fnos')}
                                type="radio" />
                        </label>
                    </article>

                    <article>
                        <h3>
                            Connect to Last.fm
                            <small>Track what you listen to, whenever you listen.</small>
                        </h3>
                        <div className={classes.field}>
                            <span>Username</span>
                            <input
                                className={classes.textInput}
                                defaultValue={lastfm.username}
                                onBlur={ev => this.saveLastfm()}
                                placeholder="Your last.fm username"
                                ref={
                                    ele => (this.username = ele)
                                }
                                type="text" />
                        </div>

                        <div className={classes.field}>
                            <span>Password</span>
                            <input
                                className={classes.textInput}
                                defaultValue={lastfm.password}
                                onBlur={ev => this.saveLastfm()}
                                placeholder="Your last.fm password"
                                ref={
                                    ele => (this.password = ele)
                                }
                                type="password" />
                        </div>
                        <button
                            className={
                                clazz(classes.connect, {
                                    [classes.connected]: this.isConnected(),
                                })
                            }
                            disabled={this.isConnected() || connecting || !lastfm.username || !lastfm.password}
                            onClick={e => connect()}>
                            {
                                connecting ? (
                                    <span>
                                        <i className="ion-ios-loop" />
                                        Connecting to Last.fm
                                    </span>
                                ) : (
                                    this.isConnected() ? (
                                        <span>
                                            <i className="ion-android-done" />
                                            Connected to Last.fm
                                        </span>
                                    ) : (
                                        <span>
                                            <i className="ion-flash" />
                                            Connect to Last.fm
                                        </span>
                                    )
                                )
                            }
                        </button>
                    </article>

                    <article>
                        <h3>Playlist Background ...</h3>
                        {
                            backgrounds.map((e, index) => {
                                return (
                                    <div
                                        className={classes.field}
                                        key={index}
                                    >
                                        <span>{e.type}</span>

                                        <input
                                            className={classes.textInput}
                                            defaultValue={e.background}
                                            onBlur={
                                                ev => this.saveBackground(index, {
                                                    type: e.type,
                                                    background: ev.target.value,
                                                })
                                            }
                                            placeholder="Please entry the background address"
                                            type="text"
                                        />
                                    </div>
                                );
                            })
                        }
                    </article>
                </section>
            </div>
        );
    }

    render() {
        var { classes, preferences } = this.props;

        return (
            <Modal
                show={preferences.show}
                onCancel={() => this.close()}
            >
                <ModalHeader
                    className={classes.header}
                >
                    Preferences...

                    <i
                        className={classes.close}
                        onClick={() => this.close()}
                    >
                        <img
                            alt="Close Menus"
                            className={classes.close}
                            src="assets/close.png" />
                    </i>
                </ModalHeader>

                <ModalBody
                    className={classes.modal}
                >
                    <ThemeProvider theme={theme}>
                        {
                            this.renderOptions()
                        }
                    </ThemeProvider>
                </ModalBody>
            </Modal>
        );
    }
}

export default injectSheet(classes)(Preferences);
