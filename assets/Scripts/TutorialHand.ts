import { _decorator, Component, Node, Vec3, tween, Tween, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Рука-подсказка для playable.
 *
 * Логика «по бездействию»:
 *   • появляется спустя idleDelay секунд БЕЗ действий игрока;
 *   • указывает на РЕКОМЕНДУЕМЫЙ ХОД — целевую зону, которую задаёт
 *     GameManager через setHint() (обычно = лучший доступный захват);
 *   • любой тап игрока прячет руку и сбрасывает таймер бездействия;
 *   • после нового простоя рука появляется снова.
 *
 * Пока ход у врага / нет доступного хода (hint снят) — руки нет.
 *
 * ВАЖНО: узел НИКОГДА не выключается через node.active — иначе движок
 * перестанет вызывать update() и таймер бездействия не пойдёт (как в
 * ShieldBadge). Видимость — только через UIOpacity.
 */
@ccclass('TutorialHand')
export class TutorialHand extends Component {

    @property({ type: Node, tooltip: 'Запасная статичная цель, если GameManager не задаёт hint. Необязательно' })
    pointAt: Node = null;

    @property({ type: Node, tooltip: 'Где ловить активность игрока (обычно Canvas). Пусто → вся сцена' })
    listenRoot: Node = null;

    @property({ tooltip: 'Секунд бездействия до появления руки' })
    idleDelay: number = 2.0;

    @property({ tooltip: 'Смещение руки относительно цели (X, Y), px. Кончик пальца указывает на зону, а кисть уходит в сторону' })
    offset: Vec3 = new Vec3(70, -80, 0);

    private _base: Vec3 = new Vec3(1, 1, 1);
    private _op: UIOpacity = null;
    private _root: Node = null;
    private _hint: Node | null = null;   // рекомендуемая цель от GameManager
    private _idle = 0;
    private _visible = false;
    private _off = false;

    onLoad() {
        this._base = this.node.scale.clone();
        // узел ОСТАЁТСЯ активным → update() работает; прячем через прозрачность
        this._op = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        this._op.opacity = 0;
    }

    start() {
        this._root = this.listenRoot || this.node.scene;
        if (this._root) {
            this._root.on(Node.EventType.TOUCH_END, this.onUserAction, this, true);
        }
    }

    onDestroy() {
        if (this._root) this._root.off(Node.EventType.TOUCH_END, this.onUserAction, this, true);
    }

    /** GameManager задаёт цель-подсказку (узел зоны) или null, чтобы убрать руку */
    setHint(node: Node | null) {
        this._hint = node;
    }

    update(dt: number) {
        if (this._off) return;

        const target = this.currentTarget();

        // нет цели (ход врага/нет доступного хода) → прячем, таймер в 0
        if (!target) {
            if (this._visible) this.hide();
            this._idle = 0;
            return;
        }

        if (this._visible) {
            this.follow(target);
            return;
        }

        this._idle += dt;
        if (this._idle >= this.idleDelay) this.show(target);
    }

    /** Цель = hint от GameManager, иначе статичный pointAt, иначе null */
    private currentTarget(): Vec3 | null {
        const t = this._hint || this.pointAt;
        if (t && t.isValid && t.activeInHierarchy) return t.worldPosition.clone();
        return null;
    }

    private follow(targetWp: Vec3) {
        // защита от «руки по центру»: если смещение ~0 — уводим в сторону,
        // чтобы кисть не перекрывала зону, на которую указываем
        let ox = this.offset.x, oy = this.offset.y;
        if (Math.abs(ox) < 6 && Math.abs(oy) < 6) { ox = 70; oy = -80; }
        this.node.setWorldPosition(targetWp.x + ox, targetWp.y + oy, targetWp.z);
    }

    private show(targetWp: Vec3) {
        this._visible = true;
        this.follow(targetWp);

        Tween.stopAllByTarget(this._op);
        tween(this._op).to(0.25, { opacity: 255 }).start();

        const down = new Vec3(this._base.x * 0.86, this._base.y * 0.86, 1);
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._base);
        tween(this.node)
            .repeatForever(
                tween(this.node)
                    .to(0.35, { scale: down }, { easing: 'sineIn' })
                    .to(0.35, { scale: this._base }, { easing: 'sineOut' })
                    .delay(0.15)
            )
            .start();
    }

    private hide() {
        if (!this._visible) return;
        this._visible = false;
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._base);
        Tween.stopAllByTarget(this._op);
        tween(this._op).to(0.15, { opacity: 0 }).start();
    }

    private onUserAction() {
        this._idle = 0;
        if (this._visible) this.hide();
    }

    stopForever() {
        this._off = true;
        this.hide();
    }
}