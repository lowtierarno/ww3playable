import { _decorator, Component, Vec3, view } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Позиционирование узла под ориентацию экрана.
 *
 * Вешать на ЛЮБОЙ узел (заголовок, флаг, плашку, кнопку…). Задаёшь позицию и
 * (по желанию) масштаб отдельно для портрета и ландшафта — компонент сам
 * применяет их при повороте.
 *
 * Ориентация определяется ОПРОСОМ view.getVisibleSize() каждый кадр (надёжно
 * и после смены дизайн-разрешения в AdaptiveLayout), а не по screen.windowSize
 * и не по событиям — так значения не «слетают» после первого поворота. После
 * смены ориентации позиция применяется несколько кадров подряд, чтобы перебить
 * Widget.updateAlignment(), который AdaptiveLayout вызывает с задержкой.
 *
 * Совет: расставь узел как надо в портрете → впиши X/Y в Portrait Pos; разверни
 * превью в ландшафт, поправь → впиши в Landscape Pos.
 */
@ccclass('OrientationPlacer')
export class OrientationPlacer extends Component {

    @property({ tooltip: 'Задавать позицию по ориентации' })
    usePosition: boolean = true;
    @property({ tooltip: 'Позиция в ПОРТРЕТЕ (X, Y)' })
    portraitPos: Vec3 = new Vec3(0, 0, 0);
    @property({ tooltip: 'Позиция в ЛАНДШАФТЕ (X, Y)' })
    landscapePos: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: 'Задавать масштаб по ориентации' })
    useScale: boolean = false;
    @property({ tooltip: 'Масштаб в портрете' })
    portraitScale: number = 1;
    @property({ tooltip: 'Масштаб в ландшафте' })
    landscapeScale: number = 1;

    private _last = -1;   // -1 неизвестно, 0 ландшафт, 1 портрет
    private _hold = 0;    // сколько кадров ещё применять (перебиваем updateAlignment)

    onEnable() {
        this._last = -1;  // заставить применить заново при включении
        this._hold = 0;
    }

    update() {
        const portrait = this.isPortrait();
        const cur = portrait ? 1 : 0;
        if (cur !== this._last) {
            this._last = cur;
            this._hold = 10; // применяем ~10 кадров, чтобы перебить Widget.updateAlignment
        }
        if (this._hold > 0) {
            this._hold--;
            this.apply(portrait);
        }
    }

    private isPortrait(): boolean {
        const v = view.getVisibleSize();
        if (v.width <= 0 || v.height <= 0) return true;
        return v.height >= v.width;
    }

    /** Применить позицию/масштаб под ориентацию */
    apply(portrait?: boolean) {
        if (portrait === undefined) portrait = this.isPortrait();
        if (this.usePosition) {
            const p = portrait ? this.portraitPos : this.landscapePos;
            this.node.setPosition(p.x, p.y, this.node.position.z);
        }
        if (this.useScale) {
            const s = portrait ? this.portraitScale : this.landscapeScale;
            this.node.setScale(s, s, 1);
        }
    }
}