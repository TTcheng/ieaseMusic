
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
 * fnOS 艺术家页。
 *
 * 只在 fnOS 音源模式下可达（/fnos/artist/:guid）。
 */
@inject(stores => ({
    artist: stores.fnos.artist,
    loading: stores.fnos.artistLoading,
    getArtist: stores.fnos.getArtist,
    setup: stores.controller.setup,
    play: stores.controller.play,
}))
@observer
class Artist extends Component {
    async componentDidMount() {
        var { guid } = this.props.match.params;

        await this.props.getArtist(guid);
    }

    playAll() {
        var { artist, setup } = this.props;

        if (!artist.songs || !artist.songs.length) {
            return;
        }

        setup({
            id: `FNOS_ARTIST_${artist.id}`,
            name: artist.name,
            link: `/fnos/artist/${artist.id}`,
            songs: artist.songs,
        });

        this.props.play(artist.songs[0].id);
    }

    renderAlbum(album, index) {
        var { classes } = this.props;

        return (
            <Link
                className={classes.album}
                key={album.guid || index}
                to={album.link}
            >
                <figure>
                    <ProgressImage {...{
                        height: 160,
                        width: 160,
                        src: album.cover,
                    }} />

                    <p title={album.name}>
                        {album.name}
                    </p>

                    <small>
                        {album.size} Tracks
                    </small>
                </figure>
            </Link>
        );
    }

    renderSong(song, index) {
        var { classes, setup, play } = this.props;

        return (
            <div
                className={classes.row}
                key={song.guid || index}
                onClick={
                    () => {
                        var { artist } = this.props;

                        setup({
                            id: `FNOS_ARTIST_${artist.id}`,
                            name: artist.name,
                            link: `/fnos/artist/${artist.id}`,
                            songs: artist.songs,
                        });

                        play(song.id);
                    }
                }
            >
                <span className={classes.index}>
                    {index + 1}
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
        var { classes, artist, loading } = this.props;
        var albums = artist.albums || [];
        var songs = artist.songs || [];

        return (
            <div className={classes.container}>
                <Loader show={loading} />

                <Header transparent={true} showBack={true} />

                <div
                    className={classes.hero}
                    style={{
                        backgroundImage: artist.background
                            ? `url(${artist.background})`
                            : 'none',
                    }}
                >
                    <div
                        className={classes.background}
                        style={{
                            backgroundImage: artist.background
                                ? `url(${artist.background})`
                                : 'none',
                        }}
                    />

                    <ProgressImage {...{
                        className: classes.cover,
                        height: 260,
                        width: 260,
                        src: artist.cover,
                    }} />

                    <div className={classes.summary}>
                        <h1>
                            {artist.name}
                        </h1>

                        <p>
                            {artist.albumCount} Albums · {artist.trackCount} Tracks
                        </p>
                    </div>
                </div>

                <div className={classes.body}>
                    {
                        albums.length
                            ? (
                                <div className={classes.list}>
                                    <header>
                                        <span>Albums</span>
                                    </header>

                                    <div className={classes.albums}>
                                        {albums.map((album, index) => this.renderAlbum(album, index))}
                                    </div>
                                </div>
                            )
                            : false
                    }

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

export default injectSheet(classes)(Artist);
