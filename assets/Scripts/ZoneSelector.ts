import { _decorator, Component, Node, Graphics, Label, Color, Vec3, tween, Tween, UIOpacity, UITransform } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Кольцо-локатор танка — вращающийся ретикул + бейдж «⚔ N», который ВСЕГДА
 * держится на герое-танке, чтобы игрок легко находил его на карте.
 *
 * Кольцо рисуется через Graphics (арт не нужен). Позиция каждый кадр берётся
 * из follow-узла, поэтому кольцо плавно едет вместе с танком во время его
 * перемещения. Управление из GameManager:
 *   selector.setFollow(heroTank, army);  // прилипнуть к танку и показать
 *   selector.setArmy(army);              // обновить число «⚔ N»
 *   selector.hide();                     // спрятать (финал)
 *
 * Вешать на узел ПОД Canvas (без масштаба карты), слоем ПОВЕРХ зон/танка.
 */
@ccclass('ZoneSelector')
export class ZoneSelector extends Component {

    @property({ type: Node, tooltip: 'За кем следить (танк игрока). Обычно ставит GameManager' })
    follow: Node = null;

    @property({ type: Label, tooltip: 'Число армии в бейдже «⚔ N». Необязательно' })
    armyLabel: Label = null;

    @property({ type: Node, tooltip: 'Узел-бейдж «⚔ N» (тёмная плашка). Ставится под кольцо' })
    armyBadge: Node = null;

    @property({ type: Color, tooltip: 'Цвет кольца' })
    ringColor: Color = new Color(90, 170, 255, 255);

    @property({ tooltip: 'Радиус кольца, px' })
    radius: number = 72;

    @property({ tooltip: 'Толщина линий, px' })
    ringWidth: number = 4;

    @property({ tooltip: 'Скорость вращения точек, об/сек' })
    spin: number = 0.5;

    @property({ tooltip: 'Смещение бейджа «⚔ N» по Y от центра, px' })
    badgeOffsetY: number = -64;

    private _g: Graphics = null;
    private _op: UIOpacity = null;
    private _base: Vec3 = new Vec3(1, 1, 1);
    private _shown = false;
    private _angle = 0;

    onLoad() {
        this._g = this.getComponent(Graphics) || this.addComponent(Graphics);
        if (!this.getComponent(UITransform)) this.addComponent(UITransform);
        this._op = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this._base = this.node.scale.clone();
        if (this.armyBadge) this.armyBadge.setPosition(0, this.badgeOffsetY, 0);
        this.drawReticle();

        // если follow задан прямо в редакторе — показываемся сразу
        if (this.follow) {
            this.node.active = true;
            this._op.opacity = 255;
            this._shown = true;
            this.startPulse();
        } else {
            this._op.opacity = 0;
            this.node.active = false;
        }
    }

    update(dt: number) {
        this._angle += dt * this.spin * Math.PI * 2;
        // прилипаем к танку (позиция берётся каждый кадр → плавно едет с ним)
        if (this.follow && this.follow.isValid && this.follow.activeInHierarchy) {
            this.node.setWorldPosition(this.follow.worldPosition);
        }
        this.drawReticle();
    }

    private col(a: number): Color {
        return new Color(this.ringColor.r, this.ringColor.g, this.ringColor.b, a);
    }

    private drawReticle() {
        const g = this._g;
        const r = this.radius;
        g.clear();

        // мягкое внешнее свечение
        g.lineWidth = this.ringWidth * 3.2;
        g.strokeColor = this.col(50);
        g.circle(0, 0, r); g.stroke();

        // основное кольцо
        g.lineWidth = this.ringWidth;
        g.strokeColor = this.col(190);
        g.circle(0, 0, r); g.stroke();

        // орбитальные точки (вращаются)
        const dots = 10;
        g.fillColor = this.col(255);
        for (let i = 0; i < dots; i++) {
            const a = this._angle + i * (Math.PI * 2 / dots);
            g.circle(Math.cos(a) * r, Math.sin(a) * r, this.ringWidth * 0.9);
        }
        g.fill();

        // 4 тик-метки (статичные)
        g.lineWidth = this.ringWidth * 0.9;
        g.strokeColor = this.col(220);
        const marks = [0, 90, 180, 270];
        for (const m of marks) {
            const a = m * Math.PI / 180;
            g.moveTo(Math.cos(a) * (r * 0.78), Math.sin(a) * (r * 0.78));
            g.lineTo(Math.cos(a) * (r * 0.96), Math.sin(a) * (r * 0.96));
        }
        g.stroke();
    }

    /** Прилипнуть к узлу (танку), показать кольцо, задать «⚔ N» */
    setFollow(target: Node, army: number) {
        this.follow = target;
        if (this.armyLabel) this.armyLabel.string = String(army);
        this.node.active = true;
        if (target) this.node.setWorldPosition(target.worldPosition);

        if (!this._shown) {
            this._shown = true;
            Tween.stopAllByTarget(this._op);
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
            this.startPulse();
        }
    }

    /** Обновить число армии в бейдже */
    setArmy(n: number) {
        if (this.armyLabel) this.armyLabel.string = String(n);
    }

    /** Точечно поставить кольцо в мировую точку (старый режим; follow при этом сбрасывается) */
    moveTo(worldPos: Vec3, army: number) {
        this.follow = null;
        this.node.active = true;
        this.node.setWorldPosition(worldPos);
        if (this.armyLabel) this.armyLabel.string = String(army);
        if (!this._shown) {
            this._shown = true;
            Tween.stopAllByTarget(this._op);
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
            this.startPulse();
        }
    }

    hide() {
        if (!this._shown) { this.node.active = false; return; }
        this._shown = false;
        Tween.stopAllByTarget(this.node);
        Tween.stopAllByTarget(this._op);
        tween(this._op)
            .to(0.15, { opacity: 0 })
            .call(() => { this.node.active = false; this.node.setScale(this._base); })
            .start();
    }

    private startPulse() {
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._base);
        const up = new Vec3(this._base.x * 1.07, this._base.y * 1.07, 1);
        tween(this.node)
            .repeatForever(
                tween(this.node)
                    .to(0.7, { scale: up }, { easing: 'sineInOut' })
                    .to(0.7, { scale: this._base }, { easing: 'sineInOut' })
            )
            .start();
    }
}