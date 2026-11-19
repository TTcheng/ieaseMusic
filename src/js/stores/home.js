
import { observable, action } from 'mobx';
import axios from 'axios';
import { CronJob } from 'cron';

import helper from 'utils/helper';
import me from './me';
import preferences from './preferences';
import controller from './controller';
import source from './source';

class Home {
    @observable loading = true;

    // 卡片列表（专辑 / 艺术家 / 歌单…），各音源形状不同
    @observable list = [];

    // fnOS 模式的「最近添加」播放列表 {id, name, songs}
    @observable recent = null;

    constructor() {
        // eslint-disable-next-line
        new CronJob('00 05 06 * * *', () => {
            // Every 6:05 refresh daily playlist, #331
            self.load();
        }).start();
    }

    @action async load() {
        var res;

        if (source.isFnos()) {
            // fnOS 模式：首页来自 NAS 曲库。
            // 响应是具名结构 {recent, albums, artists}，
            // 不是网易云那种 list 数组 —— 两种形状别混。
            res = await axios.get('/api/fnos/home');

            var fnos = res.data;

            self.recent = fnos.recent || null;
            self.list = [].concat(fnos.albums || [], fnos.artists || []);

            if (fnos.recent) {
                controller.setup(fnos.recent);

                // 自动播放（与网易云分支同一套逻辑）
                if (preferences.autoPlay) {
                    controller.play();
                } else {
                    controller.song = controller.playlist.songs[0];
                }
            }

            // 不 await：取配色要加载图片，慢也不该挡住首页渲染
            self.paintPallets(self.list);

            return self.list;
        }

        if (me.hasLogin()) {
            res = await axios.get(`/api/home/${me.profile.userId}`);

            let favorite = res.data.list[0];
            let recommend = res.data.list[1];

            // Save the songs of red heart
            me.rocking(favorite);

            if (favorite.size) {
                controller.setup(favorite);
            } else if (recommend.size) {
                // Play the recommend songs
                controller.setup(recommend);
            } else {
                // Some user no favorite and recommend, set a fallback playlist
                controller.setup(res.data.list[2]);
            }
        } else {
            res = await axios.get(`/api/home`);
            controller.setup(res.data.list[0]);
        }

        // 首页为空时不设播放列表（避免 setup(undefined) 崩掉）
        if (res.data.list.length) {
            if (preferences.autoPlay) {
                controller.play();
            } else {
                controller.song = controller.playlist.songs[0];
            }
        }

        res.data.list.map(e => (e.pallet = false));

        self.list = res.data.list;

        // 不 await：取配色要加载图片，慢也不该挡住首页渲染
        self.paintPallets(self.list);

        return self.list;
    }

    /**
     * 取每张卡片的配色（用于阴影）。
     *
     * 注意不要并发重建 self.list —— 多个 updateShadow 各自基于
     * 当时的 self.list 重建，会互相覆盖，最后拿到残缺的数组。
     * 这里先算好所有配色，再一次性写回。
     */
    @action async paintPallets(list) {
        var paletts = await Promise.all(list.map(async(e) => {
            if (!e.cover) return null;

            return helper.getPallet(e.cover.replace(/\?param=.*/, '') + '?param=20y20');
        }));

        paletts.forEach((pallet, index) => {
            if (!pallet) return;

            list[index].pallet = pallet;
        });
    }

    @action async getList() {
        self.loading = true;

        await self.load();

        // Just call once for init player
        self.getList = Function;
        self.loading = false;
    }

    @action updateShadow(e, index) {
        self.list = [
            ...self.list.slice(0, index),
            e,
            ...self.list.slice(index + 1, self.list.length),
        ];
    }
}

const self = new Home();
export default self;
