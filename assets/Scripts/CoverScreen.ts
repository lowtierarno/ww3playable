import { _decorator, Component, UITransform, Vec3, view, screen, game } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Заполняет экран узлом с сохранением пропорций (background-size: cover)
 * с настраиваемым доп. увеличением и смещением под каждую ориентацию.
 *
 * Масштаб ВСЕГДА считается от базового размера, запомненного один раз,
 * поэтому при повторных ресайзах ничего не накапливается.
 *
 * Вешать на узел со Sprite (карта). Родитель — по центру экрана.
 */
@ccclass('CoverScreen')
export class CoverScreen extends Component {

    @property({ tooltip: 'Доп. увеличение в портрете (1 = точно под экран)' })
    portraitZoom: number = 1.0;
    @property({ tooltip: 'Смещение карты в портрете (X, Y)' })
    portraitOffset: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: 'Доп. увеличение в ландшафте (1 = точно под экран)' })
    landscapeZoom: number = 1.15;
    @property({ tooltip: 'Смещение карты в ландшафте (X, Y)' })
    landscapeOffset: Vec3 = new Vec3(0, 0, 0);

    // базовый размер карты, запомненный ОДИН раз (не меняется при ресайзах)
    private _baseW: number = 0;
    private _baseH: number = 0;
    private _ready: boolean = false;

    onLoad() {
        // запоминаем исходный размер карты до всех пересчётов
        const ui = this.getComponent(UITransform);
        if (ui && ui.contentSize.width > 0 && ui.contentSize.height > 0) {
            this._baseW = ui.contentSize.width;
            this._baseH = ui.contentSize.height;
            this._ready = true;
        }
    }

    onEnable() {
        screen.on('window-resize', this.fit, this);
        screen.on('orientation-change', this.fit, this);
        this.fit();
    }

    onDisable() {
        screen.off('window-resize', this.fit, this);
        screen.off('orientation-change', this.fit, this);
    }

    fit() {
        if (!this._ready) {
            // на случай, если onLoad не успел — пробуем ещё раз
            const ui = this.getComponent(UITransform);
            if (ui && ui.contentSize.width > 0) {
                this._baseW = ui.contentSize.width;
                this._baseH = ui.contentSize.height;
                this._ready = true;
            } else {
                return;
            }
        }

        const visible = view.getVisibleSize();
        const portrait = this.isPortrait();

        const zoom = portrait ? this.portraitZoom : this.landscapeZoom;
        const offset = portrait ? this.portraitOffset : this.landscapeOffset;

        // масштаб считается ТОЛЬКО от запомненной базы — накопления невозможны
        const base = Math.max(visible.width / this._baseW, visible.height / this._baseH);
        const scale = base * (zoom > 0 ? zoom : 1);

        this.node.setScale(scale, scale, 1);
        this.node.setPosition(offset.x, offset.y, 0);
    }

    private isPortrait(): boolean {
        const cv: any = (game as any) ? (game as any).canvas : null;
        if (cv && cv.clientWidth && cv.clientHeight) {
            return cv.clientHeight >= cv.clientWidth;
        }
        const w = screen.windowSize;
        return w.height >= w.width;
    }
}