
import { observable, action } from 'mobx';
import axios from 'axios';

class Search {
    @observable loading = false;
    @observable playlists = [];
    @observable albums = [];
    @observable artists = [];
    @observable users = [];

    // fnOS 曲库里的歌曲
    @observable tracks = [];

    /**
        Search type

        10: 专辑
        100: 歌手
        1000: 歌单
        1002: 用户
        1004: MV
        1006: 歌词
        1009: 电台
     * */

    // URL of get more playlists
    nextHref4playlists = '';
    nextHref4albums = '';
    nextHref4artists = '';
    nextHref4users = '';

    // fnOS 搜索的翻页
    page4tracks = 1;
    total4tracks = 0;

    // 最近一次搜索的关键词（fnOS 翻页用）
    lastKeyword = '';

    /**
     * fnOS 模式：搜索 NAS 曲库。
     */
    @action async getTracks(keyword) {
        self.loading = true;
        self.lastKeyword = keyword;

        var response = await axios.get('/api/fnos/search', {
            params: { q: keyword, page: 1, size: 24 },
        });

        var data = response.data;

        self.tracks = data.list || [];
        self.total4tracks = data.total || 0;
        self.page4tracks = 1;
        self.loading = false;
    }

    @action async loadmoreTracks() {
        var page = self.page4tracks + 1;

        var response = await axios.get('/api/fnos/search', {
            params: { q: self.lastKeyword, page, size: 24 },
        });

        var data = response.data;

        if (!data.list || !data.list.length) {
            return;
        }

        self.tracks.push(...data.list);
        self.page4tracks = page;
    }

    @action async getPlaylists(keyword) {
        self.loading = true;

        var response = await axios.get(`/api/search/1000/0/${keyword}`);
        var data = response.data;

        self.playlists = data.playlists;
        self.nextHref4playlists = data.nextHref;
        self.loading = false;
    }

    @action async loadmorePlaylists() {
        if (!self.nextHref4playlists) {
            return;
        }

        var response = await axios.get(self.nextHref4playlists);
        var data = response.data;

        self.playlists.push(...data.playlists);
        self.nextHref4playlists = data.nextHref;
    }

    @action async getAlbums(keyword) {
        self.loading = true;

        var response = await axios.get(`/api/search/10/0/${keyword}`);
        var data = response.data;

        self.albums = data.albums;
        self.nextHref4albums = data.nextHref;
        self.loading = false;
    }

    @action async loadmoreAlbums() {
        if (!self.nextHref4albums) {
            return;
        }

        var response = await axios.get(self.nextHref4albums);
        var data = response.data;

        self.albums.push(...data.albums);
        self.nextHref4albums = data.nextHref;
    }

    @action async getArtists(keyword) {
        self.loading = true;

        var response = await axios.get(`/api/search/100/0/${keyword}`);
        var data = response.data;

        self.artists = data.artists;
        self.nextHref4artists = data.nextHref;
        self.loading = false;
    }

    @action async loadmoreArtists() {
        if (!self.nextHref4artists) {
            return;
        }

        var response = await axios.get(self.nextHref4artists);
        var data = response.data;

        self.artists.push(...data.artists);
        self.nextHref4artists = data.nextHref;
    }

    @action async getUsers(keyword) {
        self.loading = true;

        var response = await axios.get(`/api/search/1002/0/${keyword}`);
        var data = response.data;

        self.users = data.users;
        self.nextHref4users = data.nextHref;
        self.loading = false;
    }

    @action async loadmoreUsers() {
        if (!self.nextHref4users) {
            return;
        }

        var response = await axios.get(self.nextHref4users);
        var data = response.data;

        self.users.push(...data.users);
        self.nextHref4users = data.nextHref;
    }
}

const self = new Search();
export default self;
