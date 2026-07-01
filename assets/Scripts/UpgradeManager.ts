import { _decorator, Component, Node, Vec3, tween, Tween, instantiate, Prefab, UITransform, UIOpacity, Graphics, Color, Animation } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UpgradeManager')
export class UpgradeManager extends Component {

    // ----- Панель выбора -----
    @property(Node)
    upgradePanel: Node = null;
    @property(Node)
    btnAirForce: Node = null;

    // ----- Войска -----
    @property({ type: Node, tooltip: 'Узел самолёта' })
    fighterJet: Node = null;
    @property({ type: Animation, tooltip: 'Компонент Animation с клипом полёта. Если пусто — берётся с fighterJet' })
    jetAnimation: Animation = null;
    @property({ tooltip: 'Имя клипа полёта. Если пусто — проиграется дефолтный клип' })
    jetClipName: string = '';

    @property(Node)
    groundArmy: Node = null;
    @property(Node)
    enemyCapital: Node = null;

    // ----- Вражеская территория -----
    @property({ type: Node, tooltip: 'Красная версия (скрыть после удара)' })
    enemyTerritoryRed: Node = null;
    @property({ type: Node, tooltip: 'Синяя версия (показать после удара)' })
    enemyTerritoryBlue: Node = null;

    // ----- Эффекты -----
    @property({ type: Prefab, tooltip: 'Префаб взрыва (необязательно)' })
    explosionPrefab: Prefab = null;
    @property({ type: Node, tooltip: 'Что трясти при взрывах (необязательно)' })
    shakeTarget: Node = null;

    // ----- Финал -----
    @property({ type: Node, tooltip: 'Узел с компонентом EndcardManager' })
    endcardNode: Node = null;

    // ----- Туториал -----
    @property({ type: Node, tooltip: 'Узел с UnitController — чтобы спрятать руку-подсказку' })
    unitControllerNode: Node = null;

    // ----- Тайминги удара -----
    @property({ tooltip: 'Через сколько секунд после старта анимации сбросить бомбы (если НЕ используешь Animation Event)' })
    bombDelay: number = 0.8;
    @property({ tooltip: 'Прятать самолёт после конца клипа' })
    hideJetOnFinish: boolean = true;

    // ----- Настройки взрывов -----
    @property({ tooltip: 'Сколько взрывов по территории' })
    explosionCount: number = 6;
    @property({ tooltip: 'Интервал между взрывами, сек' })
    explosionInterval: number = 0.18;
    @property({ tooltip: 'Радиус нарисованного взрыва' })
    blastRadius: number = 60;
    @property({ tooltip: 'Сила тряски экрана' })
    shakeIntensity: number = 12;

    private _shakeOrigin: Vec3 = null;
    private _bombed: boolean = false;

    start() {
        if (this.btnAirForce) {
            this.btnAirForce.on(Node.EventType.TOUCH_END, this.onAirForceSelected, this);
        }
    }

    onAirForceSelected() {
        // прячем руку-подсказку, если она показана
        if (this.unitControllerNode) {
            const uc = this.unitControllerNode.getComponent('UnitController') as any;
            if (uc && typeof uc.hideTutorial === 'function') uc.hideTutorial();
        }

        if (this.upgradePanel) this.upgradePanel.active = false;
        this.launchAirStrike();
        this.moveGroundArmy();
    }

    // ===================== ВОЗДУШНЫЙ УДАР (через анимацию) =====================

    launchAirStrike() {
        if (!this.fighterJet) return;

        this._bombed = false;
        this.fighterJet.active = true;

        // берём компонент Animation: указанный или с самого самолёта
        const anim = this.jetAnimation || this.fighterJet.getComponent(Animation);
        if (!anim) {
            // анимации нет — на всякий случай просто бомбим по таймеру
            this.scheduleOnce(() => this.onBombDrop(), this.bombDelay);
            return;
        }

        // запускаем клип полёта
        if (this.jetClipName) anim.play(this.jetClipName);
        else anim.play();

        // Вариант 1: бомбы по таймеру (если в клипе НЕТ Animation Event)
        this.scheduleOnce(() => this.onBombDrop(), this.bombDelay);

        // когда клип долетел — прячем самолёт
        anim.once(Animation.EventType.FINISHED, () => {
            if (this.hideJetOnFinish) this.fighterJet.active = false;
        }, this);
    }

    /**
     * Сброс бомб. Вызывается двумя путями:
     *  - автоматически через bombDelay, ИЛИ
     *  - из клипа как Animation Event с именем функции "onBombDrop"
     * Защита от двойного вызова — флаг _bombed.
     */
    onBombDrop() {
        if (this._bombed) return;
        this._bombed = true;
        this.bombTerritory();
    }

    bombTerritory() {
        for (let i = 0; i < this.explosionCount; i++) {
            this.scheduleOnce(() => {
                this.spawnExplosion(this.randomPointInTerritory());
                this.shake(this.shakeIntensity, 0.18);
            }, i * this.explosionInterval);
        }
        const total = this.explosionCount * this.explosionInterval + 0.35;
        this.scheduleOnce(() => this.captureTerritory(), total);
    }

    randomPointInTerritory(): Vec3 {
        const node = this.enemyTerritoryRed || this.enemyCapital;
        const wp = node.worldPosition;
        let halfW = 120, halfH = 120;

        const ui = node.getComponent(UITransform);
        if (ui) {
            halfW = ui.width * node.worldScale.x * 0.5 * 0.55;
            halfH = ui.height * node.worldScale.y * 0.5 * 0.55;
        }
        return new Vec3(
            wp.x + (Math.random() * 2 - 1) * halfW,
            wp.y + (Math.random() * 2 - 1) * halfH,
            0
        );
    }

    spawnExplosion(worldPos: Vec3) {
        const parent = (this.enemyTerritoryRed && this.enemyTerritoryRed.parent)
            ? this.enemyTerritoryRed.parent
            : this.node.parent;
        if (!parent) return;

        if (this.explosionPrefab) {
            const fx = instantiate(this.explosionPrefab);
            parent.addChild(fx);
            fx.setWorldPosition(worldPos);
            fx.active = true;

            const s = fx.scale.clone();
            fx.setScale(0.2, 0.2, 1);
            tween(fx)
                .to(0.15, { scale: s }, { easing: 'backOut' })
                .delay(0.4)
                .to(0.25, { scale: new Vec3(0, 0, 1) })
                .call(() => fx.destroy())
                .start();
        } else {
            this.spawnProceduralBlast(parent, worldPos);
        }
    }

    spawnProceduralBlast(parent: Node, worldPos: Vec3) {
        const n = new Node('Blast');
        parent.addChild(n);
        n.setWorldPosition(worldPos);

        const g = n.addComponent(Graphics);
        const op = n.addComponent(UIOpacity);

        const r = this.blastRadius;
        g.fillColor = new Color(255, 150, 40, 255);
        g.circle(0, 0, r);
        g.fill();
        g.fillColor = new Color(255, 240, 180, 255);
        g.circle(0, 0, r * 0.5);
        g.fill();

        n.setScale(0.2, 0.2, 1);
        tween(n).to(0.25, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'quadOut' }).start();
        tween(op).delay(0.1).to(0.3, { opacity: 0 }).call(() => n.destroy()).start();
    }

    shake(intensity: number, duration: number) {
        const target = this.shakeTarget;
        if (!target) return;

        if (!this._shakeOrigin) this._shakeOrigin = target.position.clone();
        const o = this._shakeOrigin;
        Tween.stopAllByTarget(target);

        const steps = 6;
        let tw = tween(target);
        for (let i = 0; i < steps; i++) {
            const ox = (Math.random() * 2 - 1) * intensity;
            const oy = (Math.random() * 2 - 1) * intensity;
            tw = tw.to(duration / steps, { position: new Vec3(o.x + ox, o.y + oy, o.z) });
        }
        tw.to(duration / steps, { position: o.clone() }).start();
    }

    captureTerritory() {
        if (this.enemyTerritoryBlue) {
            const blue = this.enemyTerritoryBlue;
            blue.active = true;

            let op = blue.getComponent(UIOpacity);
            if (!op) op = blue.addComponent(UIOpacity);
            op.opacity = 0;

            tween(op)
                .to(0.6, { opacity: 255 })
                .call(() => {
                    if (this.enemyTerritoryRed) this.enemyTerritoryRed.active = false;
                    this.playEndcard();
                })
                .start();
        } else {
            if (this.enemyTerritoryRed) this.enemyTerritoryRed.active = false;
            this.playEndcard();
        }
    }

    private playEndcard() {
        if (!this.endcardNode) return;
        const ec = this.endcardNode.getComponent('EndcardManager') as any;
        if (ec && typeof ec.play === 'function') ec.play();
    }

    // ===================== НАЗЕМНЫЕ ВОЙСКА =====================

    moveGroundArmy() {
        if (!this.groundArmy || !this.enemyCapital) return;
        this.groundArmy.active = true;
        tween(this.groundArmy)
            .to(2.5, { position: this.enemyCapital.position })
            .start();
    }
}