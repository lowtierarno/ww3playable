import { _decorator, Component, Node, Enum, UIOpacity, Vec3, tween, Tween } from 'cc';
import { Weapon, CFG } from './GameConfig';
const { ccclass, property } = _decorator;

/**
 * Чип способности в нижней панели (✈️/🚀/⚓/🏭).
 *
 * Правила (A5):
 *  - Чип виден, ТОЛЬКО пока вы владеете его оружейной зоной (setOwned).
 *  - Способности БЕСПЛАТНЫ: тап в любой момент, ход не тратится.
 *  - После выстрела чип уходит в перезарядку ~5 с: заполняется «maturing»-метр,
 *    затем чип мигает (ready-blink).
 *
 * GameManager подписывается на onFire и сам решает, что делает способность.
 */
@ccclass('AbilityChip')
export class AbilityChip extends Component {

    @property({ type: Enum(Weapon), tooltip: 'Какая способность у этого чипа' })
    weapon: Weapon = Weapon.Air;

    @property({ type: Node, tooltip: 'Заполняющийся меметр перезарядки (масштабируется по X 0→1)' })
    fillMeter: Node = null;

    @property({ type: Node, tooltip: 'Свечение/рамка «готово» — мигает, когда чип заряжен (необязательно)' })
    readyGlow: Node = null;

    @property({ tooltip: 'Перезарядка, мс (по умолчанию из GameConfig)' })
    rechargeMs: number = CFG.RECHARGE_MS;

    private _owned = false;
    private _ready = true;
    private _locked = false;
    private _base: Vec3 = new Vec3(1, 1, 1);
    private _fireCb: ((w: Weapon) => void) | null = null;

    onLoad() {
        this._base = this.node.scale.clone();
        this.node.on(Node.EventType.TOUCH_END, this.onTap, this);
    }

    /** GameManager передаёт колбэк «выстрелить» */
    bind(cb: (w: Weapon) => void) {
        this._fireCb = cb;
    }

    /** Владеем ли мы зоной этой способности (управляет видимостью чипа) */
    setOwned(owned: boolean) {
        if (this._owned === owned) return;
        this._owned = owned;
        this.node.active = owned;
        if (owned) {
            this._ready = true;
            this.setFill(0);      // готов → перекрытие ПУСТОЕ (никакого висящего блока)
            this.startBlink();
        } else {
            Tween.stopAllByTarget(this.node);
            this.node.setScale(this._base);
        }
    }

    /** Блокировка на время хода врага / чужой осады (способности недоступны) */
    setLocked(locked: boolean) {
        this._locked = locked;
        let op = this.node.getComponent(UIOpacity);
        if (!op) op = this.node.addComponent(UIOpacity);
        op.opacity = locked ? 110 : 255; // затемняем, чтобы было видно, что нельзя
    }

    isReady(): boolean {
        return this._owned && this._ready && !this._locked;
    }

    private onTap() {
        if (this._locked || !this.isReady()) return;
        this._ready = false;
        this.stopBlink();
        if (this._fireCb) this._fireCb(this.weapon);
        this.recharge();
    }

    // ---------- Перезарядка (перекрытие-«кулдаун»: полное → пустое) ----------
    private recharge() {
        this.setFill(1); // сразу после выстрела перекрытие ПОЛНОЕ
        const sec = this.rechargeMs / 1000;
        const data = { k: 1 };
        tween(data)
            .to(sec, { k: 0 }, { onUpdate: () => this.setFill(data.k) })
            .call(() => {
                this._ready = true;
                this.setFill(0); // готов → перекрытие исчезает полностью
                if (!this._locked) this.startBlink();
            })
            .start();
    }

    private setFill(k: number) {
        if (!this.fillMeter) return;
        const kk = Math.max(0, Math.min(1, k));
        // при нуле прячем узел целиком — никакого полупрозрачного блока не остаётся
        this.fillMeter.active = kk > 0.001;
        this.fillMeter.setScale(kk, 1, 1);
    }

    // ---------- Blink готовности ----------
    private startBlink() {
        const target = this.readyGlow || this.node;
        let op = target.getComponent(UIOpacity);
        if (!op && target === this.readyGlow) op = target.addComponent(UIOpacity);

        if (this.readyGlow) {
            this.readyGlow.active = true;
            const o = op!;
            o.opacity = 120;
            tween(o)
                .repeatForever(
                    tween(o).to(0.5, { opacity: 255 }).to(0.5, { opacity: 120 })
                )
                .start();
        } else {
            // без отдельного свечения — лёгкая пульсация самого чипа
            const up = new Vec3(this._base.x * 1.08, this._base.y * 1.08, 1);
            tween(this.node)
                .repeatForever(
                    tween(this.node)
                        .to(0.5, { scale: up }, { easing: 'sineInOut' })
                        .to(0.5, { scale: this._base }, { easing: 'sineInOut' })
                )
                .start();
        }
    }

    private stopBlink() {
        if (this.readyGlow) {
            Tween.stopAllByTarget(this.readyGlow.getComponent(UIOpacity) as any);
            this.readyGlow.active = false;
        } else {
            Tween.stopAllByTarget(this.node);
            this.node.setScale(this._base);
        }
    }
}