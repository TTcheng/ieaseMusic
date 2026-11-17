
import React from 'react';
import { Route, Switch, Redirect, withRouter } from 'react-router-dom';

import Layout from './pages/Layout';
import Welcome from './pages/Welcome';
import Player from './pages/Player';
import User from './pages/User';
import Artist from './pages/Artist';
import Top from './pages/Top';
import Playlist from './pages/Playlist';
import FM from './pages/FM';
import Singleton from './pages/Singleton';
import Comments from './pages/Comments';
import Lyrics from './pages/Lyrics';
import Search from './pages/Search';
import Source from './pages/Login/Source';
import Fnos from './pages/Login/Fnos';
import FnosAlbum from './pages/Fnos/Album';
import FnosArtist from './pages/Fnos/Artist';
import { Legacy as LoginByLegacy, QRCode as LoginByQrCode } from './pages/Login';
import stores from 'stores';

/**
 * 未登录（或未选音源）一律回登录页。
 *
 * 单一音源模式：必须先选音源再登录，才能进 app。
 */
function requireAuth(component, props) {
    if (stores.me.hasLogin()) {
        return (
            React.createElement(
                component,
                {
                    ...props,
                }
            )
        );
    }

    return <Redirect to="/login" />;
}

/**
 * fnOS 专属页面（专辑/艺术家）。
 *
 * 这些页面只在 fnOS 音源下有内容，其他音源访问直接回首页。
 */
function requireFnos(component, props) {
    if (stores.source.isFnos() && stores.me.hasLogin()) {
        return (
            React.createElement(
                component,
                {
                    ...props,
                }
            )
        );
    }

    return <Redirect to="/" />;
}

const Main = withRouter(props => <Layout {...props} />);

export default () => {
    return (
        /* eslint-disable */
        <Main>
            <Switch>
                <Route exact path="/login" component={Source} />
                <Route exact path="/login/fnos" component={Fnos} />
                <Route exact path="/login/netease" component={LoginByLegacy} />
                <Route exact path="/login/qrcode/:type" component={LoginByQrCode} />

                <Route
                    exact
                    path="/"
                    render={props => requireAuth(Welcome, props)} />
                <Route
                    exact
                    path="/player/:type/:id"
                    render={props => requireAuth(Player, props)} />
                <Route
                    exact
                    path="/user/:id"
                    render={props => requireAuth(User, props)} />
                <Route
                    exact
                    path="/artist/:id"
                    render={props => requireAuth(Artist, props)} />
                <Route
                    exact
                    path="/top"
                    render={props => requireAuth(Top, props)} />
                <Route
                    exact
                    path="/playlist/:type"
                    render={props => requireAuth(Playlist, props)} />
                <Route
                    exact
                    path="/singleton"
                    render={props => requireAuth(Singleton, props)} />
                <Route
                    exact
                    path="/comments"
                    render={props => requireAuth(Comments, props)} />
                <Route
                    exact
                    path="/lyrics"
                    render={props => requireAuth(Lyrics, props)} />
                <Route
                    exact
                    path="/search"
                    render={props => requireAuth(Search, props)} />
                <Route
                    exact
                    path="/fm"
                    render={props => requireAuth(FM, props)} />

                <Route
                    exact
                    path="/fnos/album/:guid"
                    render={props => requireFnos(FnosAlbum, props)} />
                <Route
                    exact
                    path="/fnos/artist/:guid"
                    render={props => requireFnos(FnosArtist, props)} />
            </Switch>
        </Main>
        /* eslint-enable */
    );
};
