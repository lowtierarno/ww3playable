import { _decorator, Component, UITransform, Vec3, view, screen, Canvas, warn } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Вписывает узел с картой в экран.
 *
 * Режимы (отдельно для каждой ориентации):
 *  - cover     — заполнить экран целиком с сохранением пропорций
 *                (background-size: cover), края обрезаются;
 *  - fit width — растянуть точно по ширине экрана (высота может
 *                не заполнить экран — фон виден сверху/снизу).
 *
 * Масштаб ВСЕГДА считается от базового размера, запомненного один раз,
 * поэтому при повторных ресайзах ничего не накапливается.
 *
 * Вешать ТОЛЬКО на узел карты (со Sprite). НЕ на Canvas: компонент
 * сам отключится, чтобы не масштабировать весь интерфейс.
 */
@ccclass('CoverScreen')
export class CoverScreen extends Component {

    @property({ tooltip: 'Портрет: растягивать по ширине экрана (иначе cover)' })
    portraitFitWidth: boolean = false;

    @property({ tooltip: 'Доп. увеличение в портрете (1 = точно под экран)' })
    portraitZoom: number = 1.0;
    @property({ tooltip: 'Смещение карты в портрете (X, Y)' })
    portraitOffset: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: 'Ландшафт: растягивать по ширине экрана (иначе cover)' })
    landscapeFitWidth: boolean = false;

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
        if (this.getComponent(Canvas)) {
            // на Canvas компонент масштабировал бы ВЕСЬ UI и дрался бы
            // с cc.Canvas за позицию узла — запрещено
            warn('[CoverScreen] нельзя вешать на Canvas — компонент отключён. Повесьте на узел карты.');
            this.enabled = false;
            return;
        }
        screen.on('window-resize', this.onResize, this);
        screen.on('orientation-change', this.onResize, this);
        this.fit();
    }

    onDisable() {
        screen.off('window-resize', this.onResize, this);
        screen.off('orientation-change', this.onResize, this);
    }

    private onResize() {
        // ждём кадр: AdaptiveLayout сначала должен переключить
        // дизайн-разрешение, иначе масштаб посчитается от старого
        this.scheduleOnce(() => this.fit(), 0);
    }

    fit() {
        if (this.getComponent(Canvas)) return;

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
        if (visible.width <= 0 || visible.height <= 0) return;

        const portrait = this.isPortrait();

        const fitWidth = portrait ? this.portraitFitWidth : this.landscapeFitWidth;
        const zoom = portrait ? this.portraitZoom : this.landscapeZoom;
        const offset = portrait ? this.portraitOffset : this.landscapeOffset;

        // масштаб считается ТОЛЬКО от запомненной базы — накопления невозможны
        const base = fitWidth
            ? visible.width / this._baseW
            : Math.max(visible.width / this._baseW, visible.height / this._baseH);
        const scale = base * (zoom > 0 ? zoom : 1);

        this.node.setScale(scale, scale, 1);
        this.node.setPosition(offset.x, offset.y, 0);
    }

    private isPortrait(): boolean {
        const w = screen.windowSize;
        return w.height >= w.width;
    }
}
