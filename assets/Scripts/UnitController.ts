import { _decorator, Component, Node, EventTouch, Vec3, tween, Tween, Label, UITransform, UIOpacity, Graphics, Color, instantiate, Prefab, Animation } from 'cc';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

@ccclass('UnitController')
export class UnitController extends Component {

    @property(Node)
    targetRedCountry: Node = null;

    @property(Node)
    targetBlueCountry: Node = null;

    @property({ type: [Node] })
    spawnedUnits: Node[] = [];

    // Вражеские юниты на территории — будут схлопываться при захвате
    @property({ type: [Node], tooltip: 'Вражеские юниты, которые пропадут при захвате' })
    enemyUnits: Node[] = [];

    @property(Node)
    upgradePanelNode: Node = null;

    // Рука туториала
    @property(Node)
    tutorialHand: Node = null;

    // ----- Подсказка на панели улучшений (рука качается у кнопки) -----
    @property({ type: Node, tooltip: 'Кнопка, к которой прилетит рука (напр. AirForce)' })
    upgradeHintButton: Node = null;
    @property({ tooltip: 'Смещение руки от кнопки (X, Y)' })
    handOffset: Vec3 = new Vec3(40, -60, 0);
    @property({ tooltip: 'Амплитуда покачивания, px' })
    handBobAmount: number = 25;
    @property({ tooltip: 'Период покачивания, сек' })
    handBobTime: number = 0.6;

    // Плашка "Drag To Attack"
    @property(Node)
    tutorialPanel: Node = null;

    @property(Node)
    armyPowerPanel: Node = null;

    @property(Label)
    armyPowerLabel: Label = null;

    // Пауза (сек) между исчезновением плашки ArmyPower и появлением UpgradePanel
    @property({ tooltip: 'Пауза между ArmyPower и UpgradePanel, сек' })
    pauseBeforeUpgrade: number = 0.4;

    // ----- Взрывы при захвате (послабее, чем удар по столице) -----
    @property({ type: Prefab, tooltip: 'Префаб взрыва (необязательно). Если пусто — взрыв рисуется кодом' })
    explosionPrefab: Prefab = null;
    @property({ type: Node, tooltip: 'Что трясти при взрывах (камера/карта). Необязательно' })
    shakeTarget: Node = null;
    @property({ tooltip: 'Длительность боя за территорию, сек' })
    battleDuration: number = 3.0;
    @property({ tooltip: 'Сколько взрывов за бой' })
    explosionCount: number = 6;
    @property({ tooltip: 'Радиус нарисованного взрыва' })
    blastRadius: number = 40;
    @property({ tooltip: 'Сила тряски экрана' })
    shakeIntensity: number = 7;

    private startPos: Vec3 = new Vec3();
    private isBusy: boolean = false;
    private tutorialHidden: boolean = false;
    private _shakeOrigin: Vec3 = null;
    private _handScale: Vec3 = new Vec3(1, 1, 1); // исходный масштаб руки

    start() {
        this.startPos = this.node.position.clone();

        // запоминаем исходный масштаб руки, пока он не обнулился анимацией скрытия
        if (this.tutorialHand) {
            this._handScale = this.tutorialHand.scale.clone();
        }

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    /** Прячет руку и панель-подсказку туториала. Можно звать снаружи. */
    public hideTutorial() {
        if (this.tutorialHidden) return;
        this.tutorialHidden = true;

        if (this.tutorialHand) {
            Tween.stopAllByTarget(this.tutorialHand); // гасим бесконечное покачивание
            tween(this.tutorialHand)
                .to(0.2, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
                .call(() => { this.tutorialHand.active = false; })
                .start();
        }
        if (this.tutorialPanel) {
            tween(this.tutorialPanel)
                .to(0.2, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
                .call(() => { this.tutorialPanel.active = false; })
                .start();
        }
    }

    onTouchStart(event: EventTouch) {
        if (this.isBusy) return;
        this.hideTutorial();
    }

    onTouchMove(event: EventTouch) {
        if (this.isBusy) return;
        const delta = event.getUIDelta();
        const pos = this.node.position;
        this.node.setPosition(pos.x + delta.x, pos.y + delta.y, pos.z);
    }

    onTouchEnd(event: EventTouch) {
        if (this.isBusy) return;

        const distance = Vec3.distance(
            this.node.worldPosition,
            this.targetRedCountry.worldPosition
        );

        if (distance < 150) {
            this.startCapture();
        } else {
            this.isBusy = true;
            tween(this.node)
                .to(0.3, { position: this.startPos })
                .call(() => { this.isBusy = false; })
                .start();
        }
    }

    startCapture() {
        this.isBusy = true;

        this.node.setPosition(this.startPos);
        const targetPos = this.targetRedCountry.worldPosition;

        tween(this.node)
            .to(1.5, { worldPosition: targetPos })
            .call(() => {
                this.scheduleOnce(() => {
                    this.simulateBattle();
                }, 0.5);
            })
            .start();
    }

    /** Симуляция боя за территорию: взрывы + гибель врагов + постепенная перекраска */
    private simulateBattle() {
        const dur = this.battleDuration;

        // 1. Взрывы равномерно по всей длительности боя
        const interval = dur / this.explosionCount;
        for (let i = 0; i < this.explosionCount; i++) {
            this.scheduleOnce(() => {
                this.spawnBlast(this.randomPointInTerritory());
                this.shake(this.shakeIntensity, 0.15);
                if (SoundManager.instance) SoundManager.instance.playExplosion();
            }, i * interval);
        }

        // 2. Территория ПОСТЕПЕННО наливается синим в течение всего боя
        this.captureTerritory(dur);

        // 3. Вражеские юниты гибнут один за другим по ходу боя
        this.dismissEnemyUnits(dur);

        // 4. Свои войска заходят под конец боя, когда территория почти захвачена
        this.scheduleOnce(() => this.spawnUnits(), dur * 0.7);

        // 5. После боя — плашка силы армии и панель прокачки
        this.scheduleOnce(() => this.showArmyPower(), dur + 0.3);
    }

    // ===================== ВЗРЫВЫ =====================

    private randomPointInTerritory(): Vec3 {
        const node = this.targetRedCountry;
        const wp = node.worldPosition;
        let halfW = 80, halfH = 80;

        const ui = node.getComponent(UITransform);
        if (ui) {
            halfW = ui.width * node.worldScale.x * 0.5 * 0.5;
            halfH = ui.height * node.worldScale.y * 0.5 * 0.5;
        }
        return new Vec3(
            wp.x + (Math.random() * 2 - 1) * halfW,
            wp.y + (Math.random() * 2 - 1) * halfH,
            0
        );
    }

    private spawnBlast(worldPos: Vec3) {
        const parent = this.targetRedCountry.parent || this.node.parent;
        if (!parent) return;

        // Если задан префаб — используем его
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
            return;
        }

        // Иначе рисуем взрыв кодом
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
        tween(n).to(0.22, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' }).start();
        tween(op).delay(0.1).to(0.3, { opacity: 0 }).call(() => n.destroy()).start();
    }

    private shake(intensity: number, duration: number) {
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

    // ===================== ЮНИТЫ =====================

    /** Вражеские юниты гибнут один за другим в течение боя */
    private dismissEnemyUnits(dur: number) {
        const n = this.enemyUnits.length;
        if (n === 0) return;

        // распределяем гибель по бою (первый гибнет чуть позже старта, последний — почти в конце)
        const step = (dur * 0.8) / n;

        for (let i = 0; i < n; i++) {
            const u = this.enemyUnits[i];
            if (!u) continue;
            tween(u)
                .delay(dur * 0.1 + i * step)
                .to(0.3, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
                .call(() => { u.active = false; })
                .start();
        }
    }

    /** Свои войска появляются */
    private spawnUnits() {
        for (let i = 0; i < this.spawnedUnits.length; i++) {
            const unit = this.spawnedUnits[i];
            if (!unit) continue;

            const originalScale = unit.scale.clone();
            unit.setScale(new Vec3(0, 0, 0));
            unit.active = true;

            tween(unit)
                .delay(i * 0.1)
                .to(0.4, { scale: originalScale }, { easing: 'backOut' })
                .start();
        }
    }

    // ===================== ПЕРЕКРАСКА =====================

    /** Территория постепенно наливается синим в течение боя */
    private captureTerritory(dur: number) {
        if (this.targetBlueCountry) {
            const blue = this.targetBlueCountry;
            blue.active = true;

            let op = blue.getComponent(UIOpacity);
            if (!op) op = blue.addComponent(UIOpacity);
            op.opacity = 0;

            // проявляется медленно, весь бой; лёгкая задержка в начале, чтобы сперва пошли взрывы
            tween(op)
                .delay(dur * 0.15)
                .to(dur * 0.8, { opacity: 255 })
                .call(() => {
                    if (this.targetRedCountry) this.targetRedCountry.active = false;
                })
                .start();
        } else if (this.targetRedCountry) {
            this.targetRedCountry.active = false;
        }
    }

    // ===================== ARMY POWER + ПАНЕЛЬ =====================

    private showArmyPower() {
        if (!this.armyPowerPanel || !this.armyPowerLabel) {
            this.scheduleOnce(() => this.showUpgradePanel(), this.pauseBeforeUpgrade);
            return;
        }

        const targetScale = this.armyPowerPanel.scale.clone();

        this.armyPowerPanel.active = true;
        this.armyPowerPanel.setScale(new Vec3(0, 0, 0));
        this.armyPowerLabel.string = "12";

        tween(this.armyPowerPanel)
            .to(0.35, { scale: targetScale }, { easing: "backOut" })
            .start();

        const labelNode = this.armyPowerLabel.node;
        labelNode.setScale(new Vec3(1, 1, 1));

        let value = { power: 12 };
        let lastShown = 12;   // последнее показанное целое число
        tween(value)
            .to(0.8, { power: 24 }, {
                onUpdate: () => {
                    const current = Math.round(value.power);

                    // число сменилось — обновляем текст и играем звук повышения
                    if (current !== lastShown) {
                        lastShown = current;
                        if (SoundManager.instance) SoundManager.instance.playPowerTick();
                    }

                    this.armyPowerLabel.string = current.toString();
                    const pulse = 1 + (value.power - Math.floor(value.power)) * 0.25;
                    labelNode.setScale(new Vec3(pulse, pulse, 1));
                }
            })
            .call(() => {
                this.armyPowerLabel.string = "24";
                tween(labelNode)
                    .to(0.08, { scale: new Vec3(1.35, 1.35, 1) })
                    .to(0.12, { scale: new Vec3(1, 1, 1) })
                    .start();
            })
            .start();

        tween(this.armyPowerPanel)
            .delay(2.3)
            .to(0.25, { scale: new Vec3(0, 0, 0) }, { easing: "backIn" })
            .call(() => { this.armyPowerPanel.active = false; })
            .start();

        const showAt = 2.3 + 0.25 + this.pauseBeforeUpgrade;
        this.scheduleOnce(() => this.showUpgradePanel(), showAt);
    }

    private showUpgradePanel() {
        if (this.upgradePanelNode) {
            this.upgradePanelNode.active = true;
        }
        this.showUpgradeHint();
    }

    /** Ставит руку к кнопке улучшения и заставляет её плавно покачиваться */
    private showUpgradeHint() {
        if (!this.tutorialHand || !this.upgradeHintButton) return;

        // останавливаем твины руки, оставшиеся от скрытия
        Tween.stopAllByTarget(this.tutorialHand);

        // отключаем анимационный клип, чтобы он не мешал (если есть)
        const anim = this.tutorialHand.getComponent(Animation);
        if (anim) anim.stop();

        this.tutorialHidden = false;
        this.tutorialHand.active = true;
        this.tutorialHand.setScale(this._handScale);

        // ставим руку к кнопке (в мировых координатах + смещение)
        const btnWorld = this.upgradeHintButton.worldPosition;
        const base = new Vec3(
            btnWorld.x + this.handOffset.x,
            btnWorld.y + this.handOffset.y,
            0
        );
        this.tutorialHand.setWorldPosition(base);

        // берём локальную позицию как базу для покачивания
        const localBase = this.tutorialHand.position.clone();
        const down = new Vec3(localBase.x, localBase.y - this.handBobAmount, localBase.z);

        // плавное появление + бесконечное покачивание вверх-вниз
        this.tutorialHand.setScale(new Vec3(0, 0, 0));
        tween(this.tutorialHand)
            .to(0.25, { scale: this._handScale }, { easing: 'backOut' })
            .call(() => {
                tween(this.tutorialHand)
                    .repeatForever(
                        tween(this.tutorialHand)
                            .to(this.handBobTime, { position: down }, { easing: 'sineInOut' })
                            .to(this.handBobTime, { position: localBase }, { easing: 'sineInOut' })
                    )
                    .start();
            })
            .start();
    }
}