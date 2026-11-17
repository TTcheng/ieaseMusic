
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Link } from 'react-router-dom';
import injectSheet from 'react-jss';
import axios from 'axios';
import clazz from 'classname';

import classes from './classes';

/**
 * fnOS（飞牛音乐）登录。
 *
 * 填 NAS 地址与账号密码，先测试连接，通过后保存并进入 app。
 */
@inject('source')
@observer
class Fnos extends Component {
    state = {
        showError: false,
        showOk: false,
        error: '',
        ok: '',
        testing: false,
        logging: false,
    }

    values() {
        return {
            base: this.base.value.trim(),
            username: this.username.value.trim(),
            password: this.password.value,
        };
    }

    async testConnection() {
        var { base, username, password } = this.values();

        if (!base || !username || !password) {
            this.setState({
                showError: true,
                showOk: false,
                error: '请填写完整的连接信息',
            });

            return false;
        }

        this.setState({
            testing: true,
            showError: false,
            showOk: false,
        });

        try {
            var response = await axios.get('/api/fnos/test', {
                params: { base, username, password },
            });

            if (response.data.success) {
                this.setState({
                    showOk: true,
                    ok: `连接成功，曲库共 ${response.data.trackCount} 首`,
                });

                return true;
            }

            this.setState({
                showError: true,
                error: response.data.error || '连接失败',
            });

            return false;
        } catch (ex) {
            this.setState({
                showError: true,
                error: ex.message,
            });

            return false;
        } finally {
            this.setState({ testing: false });
        }
    }

    async doLogin() {
        var { base, username, password } = this.values();

        this.setState({
            logging: true,
            showError: false,
        });

        try {
            // 先测一次，确保凭据真的能用
            var response = await axios.get('/api/fnos/test', {
                params: { base, username, password },
            });

            if (!response.data.success) {
                this.setState({
                    showError: true,
                    error: response.data.error || '连接失败',
                    logging: false,
                });

                return;
            }

            await this.props.source.setFnosProfile({
                base,
                username,
                password,
                user: response.data.user,
            });
            await this.props.source.setSource('fnos');

            this.props.history.replace('/');
        } catch (ex) {
            this.setState({
                showError: true,
                error: ex.message,
                logging: false,
            });
        }
    }

    async handleEnter(e) {
        if (e.charCode !== 13) {
            return;
        }

        this.doLogin();
    }

    render() {
        var { classes } = this.props;
        var { showError, showOk, error, ok, logging: busy, testing: probing } = this.state;

        return (
            <div className={classes.container}>
                <Link
                    className={classes.back}
                    to="/login"
                >
                    <i className="ion-android-arrow-back" />
                    Change source
                </Link>

                <header>
                    <h1>飞牛音乐</h1>
                    <p>用 NAS 上的「飞牛音乐」曲库作为音源</p>
                </header>

                <section>
                    <input
                        defaultValue={this.props.source.fnosProfile.base || 'https://nas:5667'}
                        onKeyPress={e => this.handleEnter(e)}
                        placeholder="服务地址，如 https://nas:5667"
                        ref={
                            ele => (this.base = ele)
                        }
                        type="text" />
                    <input
                        defaultValue={this.props.source.fnosProfile.username}
                        onKeyPress={e => this.handleEnter(e)}
                        placeholder="NAS 用户名"
                        ref={
                            ele => (this.username = ele)
                        }
                        type="text" />
                    <input
                        onKeyPress={e => this.handleEnter(e)}
                        placeholder="NAS 密码"
                        ref={
                            ele => (this.password = ele)
                        }
                        type="password" />

                    <p
                        className={
                            clazz(classes.error, {
                                [classes.show]: showError,
                            })
                        }
                    >
                        {error || '连接失败，请检查地址与账号密码'}
                    </p>

                    <p
                        className={
                            clazz(classes.ok, {
                                [classes.showOk]: showOk,
                            })
                        }
                    >
                        {ok}
                    </p>
                </section>

                <footer>
                    <button
                        className={
                            clazz({
                                [classes.busy]: busy || probing,
                            })
                        }
                        disabled={busy || probing}
                        onClick={e => this.doLogin()}
                    >
                        <span>
                            {busy ? 'Logining...' : 'Login'}
                        </span>
                    </button>

                    <button
                        className={classes.secondary}
                        disabled={busy || probing}
                        onClick={e => this.testConnection()}
                    >
                        {probing ? 'Testing...' : 'Test connection'}
                    </button>
                </footer>
            </div>
        );
    }
}

export default injectSheet(classes)(Fnos);
