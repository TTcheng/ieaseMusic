
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import injectSheet from 'react-jss';

import classes from './classes';
import helper from 'utils/helper';
import Loader from 'ui/Loader';
import ProgressImage from 'ui/ProgressImage';
import Header from 'components/Header';

/**
 * fnOS 专辑页。
 *
 * 只在 fnOS 音源模式下可达（/fnos/album/:guid）。
 */
@inject(stores => ({
    album: stores.fnos.album,
    loading: stores.fnos.albumLoading,
    getAlbum: stores.fnos.getAlbum,
    setup: stores.controller.setup,
    play: stores.controller.play,
    playing: stores.controller.playing,
    playlistId: stores.controller.playlist.id,
}))
@observer
class Album extends Component {
    async componentDidMount() {
        var { guid } = this.props.match.params;

        await this.props.getAlbum(guid);
    }

    playAll() {
        var { album, setup } = this.props;

        if (!album.songs || !album.songs.length) {
            return;
        }

        setup({
            id: `FNOS_ALBUM_${album.id}`,
            name: album.name,
            link: `/fnos/album/${album.id}`,
            songs: album.songs,
        });

        this.props.play(album.songs[0].id);
    }

    renderSong(song, index) {
        var { classes, playlistId, setup, play } = this.props;
        var playing = playlistId === `FNOS_ALBUM_${this.props.album.id}`
            && this.props.playing;

        return (
            <div
                className={classes.row}
                key={song.guid || index}
                onClick={
                    () => {
                        var { album } = this.props;

                        setup({
                            id: `FNOS_ALBUM_${album.id}`,
                            name: album.name,
                            link: `/fnos/album/${album.id}`,
                            songs: album.songs,
                        });

                        play(song.id);
                    }
                }
            >
                <span className={classes.index}>
                    {
                        playing
                            ? <i className="ion-ios-play" />
                            : index + 1
                    }
                </span>

                <aside>
                    <span title={song.name}>
                        {song.name}
                    </span>

                    <span>
                        {song.artists.map(a => a.name).join(' / ')}
                    </span>

                    <span className={classes.time}>
                        {helper.getTime(song.duration)}
                    </span>
                </aside>
            </div>
        );
    }

    render() {
        var { classes, album, loading } = this.props;
        var songs = album.songs || [];

        return (
            <div className={classes.container}>
                <Loader show={loading} />

                <Header transparent={true} showBack={true} />

                <div
                    className={classes.hero}
                    style={{
                        backgroundImage: album.background
                            ? `url(${album.background})`
                            : 'none',
                    }}
                >
                    <div
                        className={classes.background}
                        style={{
                            backgroundImage: album.background
                                ? `url(${album.background})`
                                : 'none',
                        }}
                    />

                    <ProgressImage {...{
                        className: classes.cover,
                        height: 260,
                        width: 260,
                        src: album.cover,
                    }} />

                    <div className={classes.summary}>
                        <h1>
                            {album.name}
                        </h1>

                        <p>
                            {
                                (album.artists || []).map((a, index) => (
                                    <Link key={index} to={a.link}>
                                        {a.name}
                                    </Link>
                                ))
                            }
                        </p>

                        <p>
                            {album.trackCount} Tracks
                            {album.releaseDate ? ` · ${album.releaseDate}` : ''}
                        </p>
                    </div>
                </div>

                <div className={classes.body}>
                    <div className={classes.list}>
                        <header>
                            <span>Tracks</span>

                            {
                                songs.length
                                    ? (
                                        <span onClick={e => this.playAll()}>
                                            Play all
                                        </span>
                                    )
                                    : false
                            }
                        </header>

                        {
                            songs.length
                                ? songs.map((song, index) => this.renderSong(song, index))
                                : (
                                    <div className={classes.empty}>
                                        没有曲目
                                    </div>
                                )
                        }
                    </div>
                </div>
            </div>
        );
    }
}

export default injectSheet(classes)(Album);
