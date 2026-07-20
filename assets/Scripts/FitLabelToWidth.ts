import { _decorator, Component, Label, UITransform, view } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Ужимает Label под ширину экрана, чтобы текст не обрезался на других
 * соотношениях сторон (напр. большой «TOTAL DOMINATION» на эндкарде).
 *
 * Вешать на узел с Label. Компонент:
 *  - включает Overflow.SHRINK (шрифт уменьшается, если не влезает),
 *  - держит ширину узла = доля от видимой ширины экрана,
 *  - опрашивает размер каждый кадр (надёжно при повороте/разных экранах).
 *
 * Шрифт НЕ растёт выше заданного в Label — только ужимается при нехватке
 * места. Так на узких экранах текст влезает, на широких остаётся крупным.
 */
@ccclass('FitLabelToWidth')
export class FitLabelToWidth extends Component {

    @property({ tooltip: 'Какую долю ширины экрана может занимать текст (0.9 = 90%)' })
    widthRatio: number = 0.9;

    @property({ tooltip: 'Абсолютный потолок ширины, px (0 = без потолка)' })
    maxWidth: number = 0;

    @property({ tooltip: 'Одна строка (ужимать по ширине). Выкл — разрешить перенос' })
    singleLine: boolean = true;

    private _label: Label = null;
    private _ui: UITransform = null;

    onLoad() {
        this._label = this.getComponent(Label);
        this._ui = this.getComponent(UITransform) || this.addComponent(UITransform);
        if (this._label) {
            this._label.overflow = Label.Overflow.SHRINK;
            this._label.enableWrapText = !this.singleLine;
        }
    }

    update() {
        if (!this._label || !this._ui) return;
        const v = view.getVisibleSize();
        if (v.width <= 0) return;

        let w = v.width * this.widthRatio;
        if (this.maxWidth > 0) w = Math.min(w, this.maxWidth);

        // обновляем ширину только при заметном изменении (без лишней работы)
        if (Math.abs(this._ui.width - w) > 0.5) {
            this._ui.setContentSize(w, this._ui.height);
        }
    }
}