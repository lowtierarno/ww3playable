import { _decorator, Component, Node, Sprite, Color, UIOpacity, Vec3, tween, Tween } from 'cc';
import { Zone } from './Zone';
import { Owner } from './GameConfig';
const { ccclass, property } = _decorator;

/**
 * Значок-щит на зоне.
 *
 * Вешать на узел щита (напр. «Shield»), который лежит ВНУТРИ узла зоны —
 * компонент сам найдёт Zone у родителя и будет следить за владельцем:
 *   • нейтральная зона  → щит скрыт;
 *   • захвачена вами    → щит проявляется и красится в синий;
 *   • захвачена врагом  → щит проявляется и красится в красный.
 *
 * Число щита по-прежнему рисует Zone.shieldLabel — этот компонент управляет
 * только ИКОНКОЙ (видимость + цвет), поэтому менять Zone.ts не нужно.
 *
 * Видимостью управляем через UIOpacity (а не node.active), чтобы update()
 * продолжал работать и щит мог снова появиться после скрытия.
 */
@ccclass('ShieldBadge')
export class ShieldBadge extends Component {

    @property({ type: Sprite, tooltip: 'Спрайт-щит для перекраски. Пусто → берётся Sprite с этого узла' })
    icon: Sprite = null;

    @property({ type: Color, tooltip: 'Цвет щита, когда зона ваша' })
    tintYou: Color = new Color(74, 144, 255, 255);

    @property({ type: Color, tooltip: 'Цвет щита, когда зона вражья' })
    tintEnemy: Color = new Color(228, 62, 58, 255);

    @property({ tooltip: 'Прятать щит на нейтральной зоне (показывать только после захвата)' })
    hideOnNeutral: boolean = true;

    @property({ tooltip: 'Пружинистое «появление» при захвате' })
    popOnCapture: boolean = true;

    private _zone: Zone = null;
    private _op: UIOpacity = null;
    private _last: number = -999; // последний показанный владелец (для реакции только на смену)
    private _base: Vec3 = new Vec3(1, 1, 1);

    onLoad() {
        this._zone = this.findZoneInParents();
        if (!this.icon) this.icon = this.getComponent(Sprite);
        this._op = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this._base = this.node.scale.clone();
    }

    /** Ищем Zone вверх по иерархии (в Cocos 3.8.8 нет getComponentInParent) */
    private findZoneInParents(): Zone | null {
        let n: Node | null = this.node;
        while (n) {
            const z = n.getComponent(Zone);
            if (z) return z;
            n = n.parent;
        }
        return null;
    }

    update() {
        if (!this._zone) return;
        const o = this._zone.owner;
        if (o === this._last) return;      // владелец не менялся — ничего не делаем
        const firstFrame = this._last === -999;
        this._last = o;

        const shown = !this.hideOnNeutral || o !== Owner.Neutral;
        this._op.opacity = shown ? 255 : 0;

        if (shown && this.icon) {
            this.icon.color = (o === Owner.You) ? this.tintYou : this.tintEnemy;
        }
        // «появление» — только при реальном захвате, не на кадре инициализации
        if (shown && this.popOnCapture && !firstFrame) this.pop();
    }

    private pop() {
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._base.x * 0.6, this._base.y * 0.6, 1);
        tween(this.node).to(0.25, { scale: this._base }, { easing: 'backOut' }).start();
    }
}