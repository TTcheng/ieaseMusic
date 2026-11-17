
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import injectSheet from 'react-jss';

import classes from './classes';

/**
 * 选音源 —— 登录流程的第一步。
 *
 * 单一音源模式：整个 app 同一时刻只用一个音源，
 * 所以必须先选音源，再按该音源的凭据登录。
 */
@inject('source')
@observer
class Source extends Component {
    choose(source) {
        this.props.history.replace(`/login/${source}`);
    }

    render() {
        var { classes } = this.props;

        return (
            <div className={classes.container}>
                <header>
                    <h1>Choose a source</h1>
                    <p>ieaseMusic 一次只使用一个音源，选好后再登录</p>
                </header>

                <section>
                    <div
                        className={classes.card}
                        onClick={e => this.choose('netease')}
                    >
                        <i className="ion-ios-music-note" />
                        <h2>网易云音乐</h2>
                        <small>
                            用网易云账号登录，使用在线曲库、榜单、歌单与红心
                        </small>
                    </div>

                    <div
                        className={classes.card}
                        onClick={e => this.choose('fnos')}
                    >
                        <i className="ion-network" />
                        <h2>飞牛音乐</h2>
                        <small>
                            用 NAS 账号登录，搜索并播放本机曲库（支持 FLAC）
                        </small>
                    </div>
                </section>
            </div>
        );
    }
}

export default injectSheet(classes)(Source);
