import { _decorator, Component, Widget, view, sys } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Опускает верхний бар из-под чёлки/выреза по РЕАЛЬНОЙ безопасной зоне
 * устройства (sys.getSafeAreaRect() — то же, что использует встроенный
 * SafeArea). Никаких ручных чисел, подстраивается под любой телефон.
 *
 * В отличие от встроенного SafeArea опускает ТОЛЬКО сверху — бока не поджимает,
 * поэтому бар остаётся во всю ширину.
 *
 * Как работает: если у узла есть Widget с выравниванием по верху — увеличивает
 * его `top` на высоту выреза; иначе двигает узел по Y. Переприменяет каждый
 * кадр, так что Widget.updateAlignment() от AdaptiveLayout не вернёт бар назад.
 *
 * fallbackTop — запас на случай, когда система не отдаёт зону (некоторые превью
 * в браузере): тогда берётся это значение вместо реального выреза.
 */
@ccclass('SafeAreaTop')
export class SafeAreaTop extends Component {

    @property({ tooltip: 'Запасной отступ, если система не отдаёт safe area (превью), px' })
    fallbackTop: number = 44;

    @property({ tooltip: 'Доп. отступ сверху к системному, px (обычно 0)' })
    extraTop: number = 0;

    @property({ tooltip: 'Смещать только в портрете (в ландшафте вырез сбоку, не сверху)' })
    portraitOnly: boolean = true;

    private _w: Widget | null = null;
    private _baseTop = 0;
    private _baseY = 0;

    onLoad() {
        this._w = this.getComponent(Widget);
        if (this._w) this._baseTop = this._w.top;
        this._baseY = this.node.position.y;
    }

    update() {
        this.apply();
    }

    /** Высота выреза сверху в дизайн-единицах (0 — если нет) */
    private topInset(): number {
        const vs = view.getVisibleSize();
        if (vs.height <= 0) return 0;

        const anySys = sys as any;
        let inset = 0;
        if (typeof anySys.getSafeAreaRect === 'function') {
            const sa = anySys.getSafeAreaRect(); // Rect в дизайн-единицах, origin снизу-слева
            inset = vs.height - (sa.y + sa.height);
        }
        // подстраховка для превью/платформ без safe area
        if (inset <= 0) inset = this.fallbackTop;
        // защита от неадекватных значений (если единицы вдруг не те)
        const cap = vs.height * 0.2;
        if (inset > cap) inset = cap;
        return inset > 0 ? inset : 0;
    }

    private isPortrait(): boolean {
        const v = view.getVisibleSize();
        return v.width <= 0 || v.height <= 0 ? true : v.height >= v.width;
    }

    private apply() {
        const off = (this.portraitOnly && !this.isPortrait())
            ? 0
            : this.topInset() + this.extraTop;

        if (this._w && this._w.isAlignTop) {
            const target = this._baseTop + off;
            if (Math.abs(this._w.top - target) > 0.5) {
                this._w.top = target;
                this._w.updateAlignment();
            }
        } else {
            const target = this._baseY - off;
            const p = this.node.position;
            if (Math.abs(p.y - target) > 0.5) {
                this.node.setPosition(p.x, target, p.z);
            }
        }
    }
}