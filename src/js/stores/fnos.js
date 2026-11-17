
import { observable, action } from 'mobx';
import axios from 'axios';

class Fnos {
    // 专辑页
    @observable album = {};
    @observable albumLoading = true;

    // 艺术家页
    @observable artist = {};
    @observable artistLoading = true;

    @action async getAlbum(guid) {
        self.albumLoading = true;

        var response = await axios.get(`/api/fnos/album/${guid}`);

        self.album = response.data || {};
        self.albumLoading = false;

        return self.album;
    }

    @action async getArtist(guid) {
        self.artistLoading = true;

        var response = await axios.get(`/api/fnos/artist/${guid}`);

        self.artist = response.data || {};
        self.artistLoading = false;

        return self.artist;
    }
}

const self = new Fnos();
export default self;
