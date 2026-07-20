import {
    _decorator, Component, Node, Label, Vec3, tween, Tween,
    UIOpacity, UITransform, Graphics, Color, Sprite, Enum, Prefab, instantiate, warn
} from 'cc';
import { Owner, Weapon, Nation, CFG, siegeSeconds } from './GameConfig';
import { Zone } from './Zone';
import { AbilityChip } from './AbilityChip';
import { SoundManager } from './SoundManager';
import { EndcardManager } from './EndcardManager';
import { FloatingText } from './FloatingText';
import { ZoneSelector } from './ZoneSelector';
import { TutorialHand } from './TutorialHand';
import { Fx } from './FX';
const { ccclass, property } = _decorator;

/**
 * GameManager — мозг пошаговой игры (заменяет UnitController + UpgradeManager).
 *
 * Цикл (A6): игрок тапает зону → осада → ход возвращается → «🔴 CHINA moves» →
 * враг делает РОВНО одно действие → ход снова у игрока. Способности бесплатны
 * и хода не тратят. Победа — взять вражескую столицу; поражение — потерять свою.
 *
 * Вешать на Canvas боевой сцены. Зоны — узлы с компонентом Zone внутри zonesRoot.
 */
@ccclass('GameManager')
export class GameManager extends Component {

    // ---------- Карта ----------
    @property({ type: Node, tooltip: 'Родитель всех зон. Пусто → ищем по всей сцене' })
    zonesRoot: Node = null;

    // ---------- Юниты ----------
    @property({ type: Node, tooltip: 'Ваш герой-танк (ездит и обстреливает зоны)' })
    heroTank: Node = null;
    @property({ type: Node, tooltip: 'Красный танк врага (выезжает на его ходу)' })
    enemyTank: Node = null;

    // ---------- Танк: прицеливание / заезд ----------
    @property({ tooltip: 'Поворачивать танк носом к цели перед выстрелом' })
    rotateTankToAim: boolean = true;
    @property({ tooltip: 'Калибровка направления спрайта танка, град. Спрайт носом ВВЕРХ → -90 (герой и враг одинаково)' })
    tankFacingOffsetDeg: number = -90;
    @property({ tooltip: 'Время поворота к цели, сек' })
    aimTurnTime: number = 0.25;
    @property({ tooltip: 'Калибровка направления спрайта самолёта/ракеты/корабля, град. Нос ВВЕРХ → -90' })
    weaponFacingOffsetDeg: number = -90;
    @property({ type: Prefab, tooltip: 'Префаб доп.танка для 🏭 (если пусто — клонируется герой-танк)' })
    factoryTankPrefab: Prefab = null;

    // ---------- Оружие (визуал, опционально) ----------
    @property({ type: Node, tooltip: 'Самолёт для ✈️ (в начале скрыт)' })
    jet: Node = null;
    @property({ type: Node, tooltip: 'Ракета для 🚀 (в начале скрыта)' })
    missile: Node = null;
    @property({ type: Node, tooltip: 'Корабль для ⚓ (в начале скрыт)' })
    warship: Node = null;

    // ---------- Способности ----------
    @property({ type: [AbilityChip], tooltip: 'Чипы способностей (✈️/🚀/⚓/🏭)' })
    chips: AbilityChip[] = [];

    // ---------- HUD ----------
    @property({ type: Label, tooltip: '⚔ ARMY — ваша мощь' })
    armyLabel: Label = null;
    @property({ type: Label, tooltip: 'RIVAL — мощь врага (eArmy)' })
    rivalLabel: Label = null;
    @property({ type: Label, tooltip: 'Баннер задачи / статуса хода' })
    objectiveLabel: Label = null;
    @property({ type: Node, tooltip: 'Всплывающая подсказка (тост). В начале скрыта' })
    toastNode: Node = null;
    @property({ type: Label, tooltip: 'Текст тоста' })
    toastLabel: Label = null;

    @property({ type: ZoneSelector, tooltip: 'Кольцо-локатор танка «⚔ N». Держится на герое-танке. Необязательно' })
    zoneSelector: ZoneSelector = null;

    @property({ type: TutorialHand, tooltip: 'Рука-подсказка. GameManager наводит её на рекомендуемый ход. Необязательно' })
    tutorialHand: TutorialHand = null;

    // ---------- Выбор страны (старт) ----------
    @property({ tooltip: 'Начинать с экрана выбора страны (CountrySelect вызовет beginWithNation). Если выкл — игра стартует сразу за defaultYouNation' })
    startWithCountrySelect: boolean = true;
    @property({ type: Enum(Nation), tooltip: 'Какой нацией размечена карта как ВАША (синяя) по умолчанию. Обычно США' })
    defaultYouNation: Nation = Nation.USA;
    @property({ type: [Node], tooltip: 'Узлы геймплея, скрытые на экране выбора и показанные после выбора (ARMY/RIVAL/баннер/танк и т.п.)' })
    hideDuringSelect: Node[] = [];

    // ---------- Финал ----------
    @property({ type: Node, tooltip: 'Узел с EndcardManager' })
    endcardNode: Node = null;

    // ---------- FX ----------
    @property({ type: Node, tooltip: 'Что трясти при взрывах (карта/мир)' })
    shakeTarget: Node = null;
    @property({ tooltip: 'Радиус нарисованного взрыва' })
    blastRadius: number = 46;
    @property({ type: Node, tooltip: 'Полноэкранный оверлей для вспышек (Sprite, в начале скрыт). Необязательно' })
    flashOverlay: Node = null;

    // ---------- Состояние ----------
    private army = CFG.START_ARMY;
    private eArmy = CFG.ENEMY_START_ARMY;
    private busy = false;          // блокирует ввод, пока ход разрешается
    private eTurnN = 0;            // счётчик ходов врага (для чётности strike)
    private ended = false;
    private zones: Zone[] = [];
    private heroZone: Zone | null = null;   // где сейчас стоит герой-танк
    private enemyZone: Zone | null = null;  // где сейчас стоит вражеский танк
    private _shakeOrigin: Vec3 | null = null;
    private _watchdog = false;
    private _rivalName = 'CHINA';    // имя врага (зависит от выбора страны)
    private _begun = false;

    // =====================================================================
    //  ИНИЦИАЛИЗАЦИЯ
    // =====================================================================
    start() {
        this.collectZones();
        this.resolveNeighbors();
        for (const z of this.zones) z.initShield();   // превью-раскраска (США синие, Китай красные)

        // тап по зонам
        for (const z of this.zones) {
            z.node.on(Node.EventType.TOUCH_END, () => this.onTapZone(z), this);
        }
        // способности
        for (const c of this.chips) c.bind((w) => this.fireAbility(w));
        if (this.toastNode) this.toastNode.active = false;

        if (this.startWithCountrySelect) {
            // ждём выбор страны: ВЕСЬ геймплей-UI спрятан, ввод заблокирован,
            // CountrySelect вызовет beginWithNation() по тапу флага
            this.busy = true;
            this.hideGameplayForSelect();
        } else {
            this.beginWithNation(this.defaultYouNation);
        }
    }

    /** Прячет всю геймплейную мелочь на время экрана выбора страны */
    private hideGameplayForSelect() {
        for (const z of this.zones) z.setChromeVisible(false);   // щиты + структуры
        for (const c of this.chips) if (c && c.node) c.node.active = false;
        this.setPill(this.armyLabel, false);
        this.setPill(this.rivalLabel, false);
        this.setPill(this.objectiveLabel, false);
        if (this.toastNode) this.toastNode.active = false;
        if (this.heroTank) this.heroTank.active = false;
        if (this.enemyTank) this.enemyTank.active = false;
        for (const n of this.hideDuringSelect) if (n) n.active = false;
    }

    /** Возвращает геймплей-UI после выбора страны */
    private showGameplayForBegin() {
        for (const z of this.zones) z.setChromeVisible(true);    // щиты + структуры
        this.setPill(this.armyLabel, true);
        this.setPill(this.rivalLabel, true);
        this.setPill(this.objectiveLabel, true);
        for (const n of this.hideDuringSelect) if (n) n.active = true;
        // чипы включит syncArsenal() по владению; танки — beginWithNation()
    }

    /** Прячет/показывает плашку-пилюлю (родитель лейбла), не трогая Canvas/корень */
    private setPill(label: Label | null, on: boolean) {
        if (!label) return;
        const p = label.node.parent;
        if (p && p !== this.node && p.parent) p.active = on;
        else label.node.active = on;
    }

    /**
     * Старт партии за выбранную страну. Карта размечена как игра за
     * defaultYouNation (синий = You). Если выбрали ДРУГУЮ нацию — меняем
     * владельцев You<->Enemy местами (столицы/провинции перекрашиваются),
     * флаги на столицах статичны и остаются за своей нацией.
     */
    beginWithNation(picked: Nation) {
        if (this._begun) return;
        this._begun = true;

        const flip = picked !== this.defaultYouNation;
        if (flip) {
            for (const z of this.zones) {
                if (z.startOwner === Owner.You) z.startOwner = Owner.Enemy;
                else if (z.startOwner === Owner.Enemy) z.startOwner = Owner.You;
            }
        }
        for (const z of this.zones) z.initShield();

        this._rivalName = picked === Nation.USA ? 'CHINA' : 'USA';

        // вернуть геймплей-UI (щиты/структуры/пилюли/список)
        this.showGameplayForBegin();

        // герой-танк на вашу столицу
        this.heroZone = this.zones.find(z => z.owner === Owner.You && z.isCapital) || null;
        if (this.heroTank) {
            this.heroTank.active = true;
            if (this.heroZone) this.heroTank.setWorldPosition(this.heroZone.firePoint());
        }
        // вражеский танк на его столицу
        const eCap = this.zones.find(z => z.owner === Owner.Enemy && z.isCapital) || null;
        this.enemyZone = eCap;
        if (this.enemyTank) {
            this.enemyTank.active = true;
            if (eCap) this.enemyTank.setWorldPosition(eCap.firePoint());
        }

        // начальная поза: оба танка смотрят на столицу врага (через тот же оффсет).
        // Не зависит от ручных углов в редакторе и корректна даже после флипа.
        if (this.rotateTankToAim) {
            if (this.heroTank && eCap) {
                this.heroTank.angle = this.dirAngle(this.heroTank.worldPosition, eCap.firePoint()) + this.tankFacingOffsetDeg;
            }
            if (this.enemyTank && this.heroZone) {
                this.enemyTank.angle = this.dirAngle(this.enemyTank.worldPosition, this.heroZone.firePoint()) + this.tankFacingOffsetDeg;
            }
        }

        // кольцо-локатор прилипает к танку
        if (this.zoneSelector && this.heroTank) {
            this.zoneSelector.setFollow(this.heroTank, this.army);
        }

        this.busy = false;
        this.syncArsenal();
        this.refreshHUD();
        this.setObjective(`Your move — tap a grey zone to expand (then ${this._rivalName} moves)`);
    }

    private collectZones() {
        const root = this.zonesRoot || this.node.scene!;
        this.zones = root.getComponentsInChildren(Zone);
    }

    private resolveNeighbors() {
        const byNode = new Map<Node, Zone>();
        for (const z of this.zones) byNode.set(z.node, z);
        for (const z of this.zones) {
            z.neighbors = [];
            for (const n of z.neighborNodes) {
                const nz = n ? byNode.get(n) : null;
                if (nz) z.neighbors.push(nz);
            }
        }
    }

    // =====================================================================
    //  ХОД ИГРОКА (A4)
    // =====================================================================
    private onTapZone(z: Zone) {
        if (this.busy || this.ended) return;

        // должна граничить с вашей землёй
        if (!this.bordersYou(z)) {
            this.toast('NOT REACHABLE');
            return;
        }
        // и быть по зубам
        if (!this.canTake(z)) {
            if (z.isCapital) {
                this.toast(`🛡 SHIELD ${z.shield} — grow past it or lower with ✈️ / 🚀`);
            } else {
                this.toast(`DEF ${z.shield} — too strong`);
            }
            return;
        }

        // осада — это ХОД
        this.busy = true;
        this.clearReachable();
        const neu = z.owner === Owner.Neutral;
        const startShield = z.shield;
        const dur = siegeSeconds(neu, startShield);

        // 1) повернуться к цели → 2) обстрелять ИЗ СВОЕЙ зоны → 3) захватить → 4) заехать
        this.aimTankAt(this.heroTank, z, () => {
            this.siegeZone(z, startShield, dur, () => {
                this.onPlayerCapture(z, neu);
            });
        });
    }

    /** Поворот танка носом к цели, не сходя с места */
    private aimTankAt(tank: Node | null, z: Zone, done: () => void) {
        if (!tank || !this.rotateTankToAim) { done(); return; }
        const from = tank.worldPosition;
        const to = z.firePoint();
        if (Math.hypot(to.x - from.x, to.y - from.y) < 1) { done(); return; }

        const targetAngle = this.dirAngle(from, to) + this.tankFacingOffsetDeg;
        const cur = tank.angle;
        const end = cur + this.shortestDelta(cur, targetAngle);

        const guard = { fired: false };
        const fin = () => { if (guard.fired) return; guard.fired = true; done(); };
        // числовой прокси — надёжно крутит angle и не конфликтует с твином позиции
        const data = { a: cur };
        Tween.stopAllByTarget(data);
        tween(data)
            .to(this.aimTurnTime, { a: end }, {
                easing: 'quadInOut',
                onUpdate: () => { if (tank.isValid) tank.angle = data.a; },
            })
            .call(fin)
            .start();
        this.scheduleOnce(fin, this.aimTurnTime + 0.25); // страховка — не виснет
    }

    /** Угол направления from→to в градусах (CCW от +X) */
    private dirAngle(from: Vec3, to: Vec3): number {
        return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    }

    /** Кратчайшая разница углов в диапазоне (-180, 180] */
    private shortestDelta(from: number, to: number): number {
        return ((to - from) % 360 + 540) % 360 - 180;
    }

    /** Можно ли ВАМ взять зону (A4: you→false, neu→true, иначе army≥def) */
    private canTake(z: Zone): boolean {
        if (z.owner === Owner.You) return false;
        if (z.owner === Owner.Neutral) return true;
        return this.army >= z.shield;
    }

    private bordersYou(z: Zone): boolean {
        return z.neighbors.some(n => n.owner === Owner.You);
    }

    private bordersEnemy(z: Zone): boolean {
        return z.neighbors.some(n => n.owner === Owner.Enemy);
    }

    /** Танк подъезжает к зоне */
    private driveTankTo(tank: Node | null, z: Zone, done: () => void) {
        if (!tank) { done(); return; }
        const guard = { fired: false };
        const fire = () => { if (guard.fired) return; guard.fired = true; done(); };

        const dist = Vec3.distance(tank.worldPosition, z.firePoint());
        const t = Math.max(0.25, Math.min(1.2, dist / 900));
        Tween.stopAllByTarget(tank);
        tween(tank)
            .to(t, { worldPosition: z.firePoint() })
            .call(fire)
            .start();
        // страховка: если tween зависнет, всё равно продолжим (ровно один раз)
        this.scheduleOnce(fire, t + 0.3);
    }

    /** Обстрел: щит тикает к 0, взрывы, тряска; затем переворот */
    private siegeZone(z: Zone, from: number, dur: number, done: () => void) {
        const blasts = Math.max(2, Math.round(dur / 0.4));
        for (let i = 0; i < blasts; i++) {
            this.scheduleOnce(() => {
                this.blast(this.randomPointIn(z));
                this.shake(9, 0.14);
                if (SoundManager.instance) SoundManager.instance.playExplosion();
            }, (dur / blasts) * i);
        }

        if (from > 0 && z.shieldLabel) {
            const v = { s: from };
            tween(v)
                .to(dur * 0.85, { s: 0 }, {
                    onUpdate: () => {
                        z.shield = Math.max(0, Math.round(v.s));
                        z.refreshShield();
                    }
                })
                .start();
        }

        const guard = { fired: false };
        const finish = () => { if (guard.fired) return; guard.fired = true; done(); };
        this.scheduleOnce(finish, dur);
        this.scheduleOnce(finish, dur + 0.5); // fallback — осада никогда не виснет
    }

    /** Итог захвата игроком (A4) */
    private onPlayerCapture(z: Zone, wasNeutral: boolean) {
        // вражеская столица → победа сразу
        if (z.isCapital && z.owner === Owner.Enemy) {
            z.setOwner(Owner.You, CFG.OWN_CAPITAL_HP, true);
            this.win(false);
            return;
        }

        // 3) территория захвачена (перекраска приливом) — танк ещё в своей зоне
        z.setOwner(Owner.You, CFG.OWN_CAPTURED_HP, true);
        Fx.capture(this.node, z.firePoint());   // синяя волна захвата

        const gain = wasNeutral ? CFG.GAIN_NEUTRAL : CFG.GAIN_ENEMY;
        this.addArmy(gain);
        this.floatAt(z.firePoint(), '+' + gain, new Color(120, 220, 140, 255));
        if (SoundManager.instance) SoundManager.instance.playCapture();
        this.syncArsenal();

        // 4) танк заезжает на захваченную зону и занимает позицию → затем ход врага
        this.driveTankTo(this.heroTank, z, () => {
            this.heroZone = z;
            this.endPlayerMove();
        });
    }

    // =====================================================================
    //  ПЕРЕДАЧА ХОДА (A6)
    // =====================================================================
    private endPlayerMove() {
        this.busy = true;
        this._watchdog = false;
        this.setChipsLocked(true);   // способности недоступны, пока ходит враг (визуально)
        this.setObjective(`🔴 ${this._rivalName} is moving...`);
        if (SoundManager.instance) SoundManager.instance.playRivalTurn();

        this.scheduleOnce(() => this.enemyTurn(() => this.handBack()), CFG.HANDOFF_MS / 1000);
        // вотчдог: если враг завис — вернуть ход игроку (A9)
        this.scheduleOnce(() => this.handBack(), CFG.WATCHDOG_MS / 1000);
    }

    private handBack() {
        if (this._watchdog) return; // уже вернули
        this._watchdog = true;
        if (this.ended) return;
        this.busy = false;
        this.setChipsLocked(false);  // ход снова у игрока → способности активны
        this.setObjective(`Your move — tap a grey zone (then ${this._rivalName} moves)`);
        this.refreshHUD();
    }

    private enemyTurn(done: () => void) {
        if (this.ended) { done(); return; }
        this.eTurnN += 1;

        if (this.enemyOwnsAnyWeapon() && this.eTurnN % 2 === 0) {
            this.enemyStrike(done);
        } else {
            this.enemyGroundMove(done);
        }
    }

    // =====================================================================
    //  СПОСОБНОСТИ (A5) — БЕСПЛАТНЫ, НЕ передают ход
    // =====================================================================
    private fireAbility(w: Weapon) {
        if (this.busy || this.ended) return; // во время хода врага не стреляем
        switch (w) {
            case Weapon.Air: this.abilityStrike(CFG.DMG_AIR, this.jet); break;
            case Weapon.Missile: this.abilityStrike(CFG.DMG_MISSILE, this.missile); break;
            case Weapon.Navy: this.abilityNavy(); break;
            case Weapon.Factory: this.abilityFactory(); break;
        }
    }

    /** ✈️/🚀 — бьют по вражеской столице (иначе по сильнейшей вражеской зоне) */
    private abilityStrike(dmg: number, fx: Node | null) {
        const cap = this.zones.find(z => z.owner === Owner.Enemy && z.isCapital);
        const target = cap || this.strongestEnemyZone();
        if (!target) return;

        const hit = () => {
            for (let i = 0; i < 4; i++)
                this.scheduleOnce(() => {
                    this.blast(this.randomPointIn(target));
                    this.shake(12, 0.16);
                    if (SoundManager.instance) SoundManager.instance.playExplosion();
                }, i * 0.12);

            target.shield = Math.max(0, target.shield - dmg);
            target.refreshShield();
            this.floatAt(target.firePoint(), '-' + dmg, new Color(255, 210, 90, 255));

            if (target.isCapital) {
                if (target.shield <= 0 || this.army >= target.shield) {
                    target.setOwner(Owner.You, CFG.OWN_CAPITAL_HP, true);
                    this.win(false);
                    return;
                }
                this.toast(`SHIELD ${target.shield}`);
            } else if (target.shield <= 0 || this.army >= target.shield) {
                this.seize(target, CFG.GAIN_ENEMY);
            } else {
                this.toast(`DEF ${target.shield}`);
            }
            this.refreshHUD();
        };

        this.flyWeapon(fx, target, dmg === CFG.DMG_MISSILE, hit);
    }

    /** ⚓ — захват сильнейшей прибрежной вражеской провинции (не столицы) */
    private abilityNavy() {
        const targets = this.zones.filter(z =>
            z.owner === Owner.Enemy && !z.isCapital && z.coastal);
        if (targets.length === 0) { this.toast('NO COASTAL TARGET'); return; }
        targets.sort((a, b) => b.shield - a.shield);
        const t = targets[0];

        const from = (t.seaLaunchPoint || t.node).worldPosition.clone();
        if (this.warship) {
            this.warship.active = true;
            this.warship.setWorldPosition(from);
            this.warship.angle = this.dirAngle(from, t.firePoint()) + this.weaponFacingOffsetDeg; // носом по курсу
            tween(this.warship)
                .to(0.6, { worldPosition: t.firePoint() })
                .call(() => {
                    if (SoundManager.instance) SoundManager.instance.playNavy();
                    this.blast(this.randomPointIn(t));
                    this.shake(10, 0.15);
                    this.seize(t, CFG.GAIN_NAVY);
                    this.warship!.active = false;
                    this.refreshHUD();
                })
                .start();
        } else {
            if (SoundManager.instance) SoundManager.instance.playNavy();
            this.seize(t, CFG.GAIN_NAVY);
            this.refreshHUD();
        }
    }

    /** 🏭 — 2 танка ВЫЕЗЖАЮТ из героя и захватывают 2 лучшие пограничные зоны; если некуда → +8 army */
    private abilityFactory() {
        const picks = this.factoryTargets();
        if (picks.length === 0) {
            this.addArmy(CFG.GAIN_ENEMY); // +8
            this.refreshHUD();
            return;
        }
        const origin = this.heroTank ? this.heroTank.worldPosition.clone()
            : (this.heroZone ? this.heroZone.firePoint() : picks[0].firePoint());

        for (let i = 0; i < picks.length; i++) {
            const z = picks[i];
            const neu = z.owner === Owner.Neutral;
            this.rollOutTank(origin, z, i * 0.18, () => {
                this.blast(this.randomPointIn(z));
                this.shake(9, 0.14);
                this.seize(z, neu ? CFG.GAIN_NEUTRAL : CFG.GAIN_ENEMY);
                this.refreshHUD();
            });
        }
    }

    /** Визуальный доп-танк: выезжает из героя, едет к зоне, бьёт (onArrive), затем тает */
    private rollOutTank(fromPos: Vec3, z: Zone, delay: number, onArrive: () => void) {
        let tank: Node | null = null;
        if (this.factoryTankPrefab) tank = instantiate(this.factoryTankPrefab);
        else if (this.heroTank) tank = instantiate(this.heroTank);
        if (!tank) { this.scheduleOnce(onArrive, delay + 0.3); return; } // без визуала — просто эффект

        const parent = (this.heroTank && this.heroTank.parent) ? this.heroTank.parent : this.node;
        parent.addChild(tank);
        tank.active = true;
        tank.setWorldPosition(fromPos);

        const to = z.firePoint();
        if (this.rotateTankToAim) tank.angle = this.dirAngle(fromPos, to) + this.tankFacingOffsetDeg;

        // «выезд» из основного танка: поп масштаба
        const base = tank.scale.clone();
        tank.setScale(base.x * 0.45, base.y * 0.45, 1);
        tween(tank).to(0.16, { scale: base }, { easing: 'backOut' }).start();

        const guard = { done: false };
        const arrive = () => {
            if (guard.done) return; guard.done = true;
            onArrive();
            const t2 = tank!;
            let op = t2.getComponent(UIOpacity) || t2.addComponent(UIOpacity);
            tween(op).delay(0.25).to(0.3, { opacity: 0 })
                .call(() => { if (t2.isValid) t2.destroy(); }).start();
        };

        const dist = Vec3.distance(fromPos, to);
        const t = Math.max(0.3, Math.min(1.0, dist / 800));
        tween(tank)
            .delay(delay)
            .to(t, { worldPosition: to }, { easing: 'quadOut' })
            .call(arrive)
            .start();
        this.scheduleOnce(arrive, delay + t + 0.5); // страховка — эффект не потеряется
    }

    /** До 2 пограничных зон, которые можно взять: сперва нейтралы, затем слабейшие враги */
    private factoryTargets(): Zone[] {
        const cand = this.zones.filter(z => this.bordersYou(z) && this.canTake(z) && !z.isCapital);
        cand.sort((a, b) => {
            const an = a.owner === Owner.Neutral ? 0 : 1;
            const bn = b.owner === Owner.Neutral ? 0 : 1;
            if (an !== bn) return an - bn;      // нейтралы первыми
            return a.shield - b.shield;          // затем самые слабые
        });
        return cand.slice(0, 2);
    }

    /** Захват зоны вами через способность */
    private seize(z: Zone, gain: number) {
        if (z.isCapital && z.owner === Owner.Enemy) {
            z.setOwner(Owner.You, CFG.OWN_CAPITAL_HP, true);
            this.win(false);
            return;
        }
        z.setOwner(Owner.You, CFG.OWN_CAPTURED_HP, true);
        this.addArmy(gain);
        this.floatAt(z.firePoint(), '+' + gain, new Color(120, 220, 140, 255));
        Fx.capture(this.node, z.firePoint());   // синяя волна захвата
        if (SoundManager.instance) SoundManager.instance.playCapture();
        this.syncArsenal();
    }

    /** Полёт самолёта/ракеты к цели (или мгновенно, если узла нет) */
    private flyWeapon(fx: Node | null, target: Zone, isMissile: boolean, onHit: () => void) {
        if (SoundManager.instance) {
            isMissile ? SoundManager.instance.playMissile() : SoundManager.instance.playJetTakeoff();
        }
        if (!fx) { onHit(); return; }

        const visible = this.node.getComponent(UITransform);
        const reach = visible ? visible.height : 1200;
        const to = target.firePoint();
        // ракета заходит почти отвесно, самолёт — по диагонали (читаемый пролёт)
        const side = isMissile ? 0.12 : 0.5;
        const from = new Vec3(to.x - reach * side, to.y + reach * 0.7, to.z);

        fx.active = true;
        fx.setWorldPosition(from);
        // РАЗВОРОТ носом по направлению полёта (иначе летит «задом»)
        fx.angle = this.dirAngle(from, to) + this.weaponFacingOffsetDeg;

        const t = 0.55;
        Tween.stopAllByTarget(fx);
        tween(fx)
            .to(t, { worldPosition: to }, { easing: 'quadIn' })
            .call(() => { fx.active = false; onHit(); })
            .start();
        this.scheduleOnce(() => { if (fx.active) { fx.active = false; onHit(); } }, t + 0.4);
    }

    // =====================================================================
    //  ВРАЖЕСКИЙ ИИ (A7) — ровно одно действие за ход
    // =====================================================================
    private enemyGroundMove(done: () => void) {
        const pick = this.enemyPickTarget();
        if (!pick) { done(); return; }
        const { zone, bounce } = pick;

        const guard = { ran: false };
        const attack = () => {
            if (guard.ran) return;
            guard.ran = true;

            // 2) обстрел цели ИЗ СВОЕЙ зоны (танк на месте)
            for (let i = 0; i < 3; i++)
                this.scheduleOnce(() => {
                    this.blast(this.randomPointIn(zone));
                    this.shake(8, 0.13);
                    if (SoundManager.instance) SoundManager.instance.playExplosion();
                }, i * 0.15);

            // 3) резолв (перекраска) → 4) заезд на зону, если враг её взял
            this.scheduleOnce(() => {
                this.enemyResolve(zone, bounce);
                if (this.ended) { done(); return; }
                if (zone.owner === Owner.Enemy) {
                    this.driveTankTo(this.enemyTank, zone, () => { this.enemyZone = zone; done(); });
                } else {
                    done(); // не взял (HELD) — танк остаётся в своей зоне
                }
            }, 0.6);
        };

        if (this.enemyTank) {
            // старт из своей зоны: текущая enemyZone, иначе ближайшая вражеская к цели
            const fromZone = (this.enemyZone && this.enemyZone.owner === Owner.Enemy) ? this.enemyZone : null;
            this.enemyTank.active = true;
            if (!fromZone) this.enemyTank.setWorldPosition(this.enemyLaunchPoint(zone));
            // 1) поворот к цели, затем атака ИЗ СВОЕЙ зоны
            this.aimTankAt(this.enemyTank, zone, attack);
            this.scheduleOnce(attack, this.aimTurnTime + 1.1); // fallback — ровно один раз
        } else {
            attack();
        }
    }

    /** Выбор цели врага по приоритету (A7) */
    private enemyPickTarget(): { zone: Zone, bounce: boolean } | null {
        const cand = this.zones.filter(z => z.owner !== Owner.Enemy && this.bordersEnemy(z));
        if (cand.length === 0) return null;

        // 1) нейтральная оружейная зона
        const weaponNeu = cand.filter(z => z.owner === Owner.Neutral && z.weapon !== Weapon.None);
        if (weaponNeu.length) return { zone: weaponNeu[0], bounce: false };

        // 2) ваша зона, которую враг осилит (не столица → столица)
        const beatable = cand.filter(z => z.owner === Owner.You && this.eArmy >= z.ownDef());
        beatable.sort((a, b) => (a.isCapital ? 1 : 0) - (b.isCapital ? 1 : 0));
        if (beatable.length) return { zone: beatable[0], bounce: false };

        // 3) ближайший нейтрал
        const neutrals = cand.filter(z => z.owner === Owner.Neutral);
        if (neutrals.length) {
            neutrals.sort((a, b) => this.distToEnemy(a) - this.distToEnemy(b));
            return { zone: neutrals[0], bounce: false };
        }

        // 4) давим на границу, даже если отскочит
        return { zone: cand[0], bounce: true };
    }

    /** Разрешение атаки врага (A7) */
    private enemyResolve(z: Zone, _bounce: boolean) {
        if (this.ended) return;

        if (z.owner === Owner.You) {
            if (this.eArmy >= z.ownDef()) {
                // захват вашей зоны
                const wasCapital = z.isCapital;
                z.setOwner(Owner.Enemy, CFG.ENEMY_RETAKEN_DEF, true);
                this.syncArsenal();
                if (this.heroZone === z) this.fallBack();   // танк отступает
                if (wasCapital) { this.lose(); return; }
                this.toast('CHINA BREAKS YOUR LINE');
                // захват вашей зоны eArmy НЕ растит
            } else {
                this.toast('HELD');
            }
        } else {
            // нейтрал / оружейная зона → врагу
            z.setOwner(Owner.Enemy, CFG.ENEMY_NEUTRAL_DEF, true);
            this.eArmy += z.weapon === Weapon.Factory ? CFG.E_GAIN_FACTORY
                : z.weapon !== Weapon.None ? CFG.E_GAIN_WEAPON
                    : CFG.E_GAIN_NEUTRAL;
        }
        this.refreshHUD();
    }

    /** Удар врага оружием (A7) — каждый 2-й ход, если владеет оружием */
    private enemyStrike(done: () => void) {
        // выбираем оружие: ракета > авиация > флот
        let dmg = 0;
        let navy = false;
        if (this.enemyOwnsWeapon(Weapon.Missile)) dmg = CFG.DMG_MISSILE;
        else if (this.enemyOwnsWeapon(Weapon.Air)) dmg = CFG.DMG_AIR;
        else if (this.enemyOwnsWeapon(Weapon.Navy)) navy = true;

        // владеет лишь заводом (нет боевого оружия) → обычный наземный ход
        if (dmg === 0 && !navy) { this.enemyGroundMove(done); return; }

        let target: Zone | null;
        if (navy) {
            target = this.weakestYourZone(true);   // прибрежная
        } else {
            target = this.weakestYourZone(false);
        }
        if (!target) { this.enemyGroundMove(done); return; }

        const t = target;
        for (let i = 0; i < 3; i++)
            this.scheduleOnce(() => {
                this.blast(this.randomPointIn(t));
                this.shake(11, 0.15);
                if (SoundManager.instance) SoundManager.instance.playExplosion();
            }, i * 0.14);

        this.scheduleOnce(() => {
            if (navy) {
                // флот врага высаживается и захватывает прибрежную зону
                t.setOwner(Owner.Enemy, CFG.ENEMY_RETAKEN_DEF, true);
                this.syncArsenal();
                if (this.heroZone === t) this.fallBack();
                if (t.isCapital) { this.lose(); return; }
            } else {
                t.shield = Math.max(0, t.shield - dmg);
                t.refreshShield();
                this.floatAt(t.firePoint(), '-' + dmg, new Color(255, 90, 80, 255));
                if (t.shield <= 0) {
                    const wasCapital = t.isCapital;
                    t.setOwner(Owner.Enemy, CFG.ENEMY_RETAKEN_DEF, true);
                    this.syncArsenal();
                    if (this.heroZone === t) this.fallBack();
                    if (wasCapital) { this.lose(); return; }
                }
            }
            this.refreshHUD();
            done();
        }, 0.5);
    }

    /** Танк отступает к вашей столице (A9) */
    private fallBack() {
        this.toast('FALL BACK!');
        const cap = this.zones.find(z => z.owner === Owner.You && z.isCapital);
        this.heroZone = cap || null;
        if (this.heroTank && cap) {
            Tween.stopAllByTarget(this.heroTank);
            tween(this.heroTank).to(0.6, { worldPosition: cap.firePoint() }).start();
        }
    }

    // =====================================================================
    //  ХЕЛПЕРЫ ВЫБОРА
    // =====================================================================
    private strongestEnemyZone(): Zone | null {
        const e = this.zones.filter(z => z.owner === Owner.Enemy);
        if (!e.length) return null;
        e.sort((a, b) => b.shield - a.shield);
        return e[0];
    }

    private weakestYourZone(coastalOnly: boolean): Zone | null {
        let y = this.zones.filter(z => z.owner === Owner.You && !z.isCapital);
        if (coastalOnly) y = y.filter(z => z.coastal);
        if (!y.length) return null;
        y.sort((a, b) => a.shield - b.shield);
        return y[0];
    }

    private enemyOwnsAnyWeapon(): boolean {
        return this.zones.some(z => z.owner === Owner.Enemy && z.weapon !== Weapon.None);
    }
    private enemyOwnsWeapon(w: Weapon): boolean {
        return this.zones.some(z => z.owner === Owner.Enemy && z.weapon === w);
    }
    private youOwnWeapon(w: Weapon): boolean {
        return this.zones.some(z => z.owner === Owner.You && z.weapon === w);
    }

    private distToEnemy(z: Zone): number {
        let best = Number.MAX_VALUE;
        for (const e of this.zones) {
            if (e.owner !== Owner.Enemy) continue;
            best = Math.min(best, Vec3.distance(z.node.worldPosition, e.node.worldPosition));
        }
        return best;
    }

    private enemyLaunchPoint(z: Zone): Vec3 {
        // ближайшая вражеская зона к цели
        let src: Zone | null = null; let d = Number.MAX_VALUE;
        for (const e of this.zones) {
            if (e.owner !== Owner.Enemy) continue;
            const dd = Vec3.distance(e.node.worldPosition, z.node.worldPosition);
            if (dd < d) { d = dd; src = e; }
        }
        return (src || z).firePoint();
    }

    // =====================================================================
    //  АРСЕНАЛ / HUD
    // =====================================================================
    /** Показывает/прячет чипы: способность есть, пока владеешь её зоной (A5) */
    private syncArsenal() {
        for (const c of this.chips) c.setOwned(this.youOwnWeapon(c.weapon));
    }

    /** Затемняет/включает все чипы (на время хода врага) */
    private setChipsLocked(locked: boolean) {
        for (const c of this.chips) c.setLocked(locked);
    }

    /** Всплывающий «+N» / «-N» над точкой карты (GDD §7). Родитель — Canvas (this.node) */
    private floatAt(worldPos: Vec3, text: string, color: Color) {
        FloatingText.spawn(this.node, worldPos, text, color);
    }

    /** Полноэкранная вспышка (GDD §7). Никогда не залипает — гаснет тем же tween-ом */
    private flash(color: Color, peak = 170, dur = 0.45) {
        const ov = this.flashOverlay;
        if (!ov) return;
        ov.active = true;
        const sp = ov.getComponent(Sprite);
        if (sp) sp.color = new Color(color.r, color.g, color.b, 255);
        let op = ov.getComponent(UIOpacity);
        if (!op) op = ov.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op)
            .to(dur * 0.35, { opacity: peak })
            .to(dur * 0.65, { opacity: 0 })
            .call(() => { ov.active = false; })
            .start();
    }

    private addArmy(delta: number) {
        const from = this.army;
        this.army += delta;
        if (!this.armyLabel) return;
        const v = { a: from };
        tween(v)
            .to(0.5, { a: this.army }, {
                onUpdate: () => {
                    this.armyLabel.string = String(Math.round(v.a));
                    if (this.zoneSelector) this.zoneSelector.setArmy(Math.round(v.a));
                    if (SoundManager.instance) SoundManager.instance.playPowerTick();
                }
            })
            .start();
        // пульс счётчика
        const ln = this.armyLabel.node;
        tween(ln).to(0.1, { scale: new Vec3(1.15, 1.15, 1) }).to(0.15, { scale: new Vec3(1, 1, 1) }).start();
    }

    private refreshHUD() {
        if (this.armyLabel) this.armyLabel.string = String(this.army);
        if (this.rivalLabel) this.rivalLabel.string = String(this.eArmy);
        this.refreshReachable();
    }

    private refreshReachable() {
        for (const z of this.zones) {
            const ok = !this.busy && !this.ended && this.bordersYou(z) && this.canTake(z);
            z.setReachable(ok);
        }
        // рука-подсказка наводится на лучший следующий ход (кольцо теперь на танке)
        if (this.tutorialHand) {
            const t = (!this.busy && !this.ended) ? this.suggestedTarget() : null;
            this.tutorialHand.setHint(t ? t.node : null);
        }
    }
    private clearReachable() {
        for (const z of this.zones) z.setReachable(false);
        if (this.tutorialHand) this.tutorialHand.setHint(null);
    }

    /** Лучшая доступная цель для прицела/подсказки (нейтр. оружие → столица по зубам → нейтрал → слабейшая) */
    private suggestedTarget(): Zone | null {
        const cand = this.zones.filter(z => this.bordersYou(z) && this.canTake(z));
        if (!cand.length) return null;
        const score = (z: Zone) => {
            if (z.owner === Owner.Neutral && z.weapon !== Weapon.None) return 0;
            if (z.isCapital && z.owner === Owner.Enemy) return 1;
            if (z.owner === Owner.Neutral) return 2;
            return 3;
        };
        cand.sort((a, b) => {
            const s = score(a) - score(b);
            return s !== 0 ? s : a.shield - b.shield;
        });
        return cand[0];
    }

    private setObjective(text: string) {
        if (this.objectiveLabel) this.objectiveLabel.string = text;
    }

    private toast(text: string) {
        if (!this.toastLabel || !this.toastNode) return;
        this.toastLabel.string = text;
        this.toastNode.active = true;
        let op = this.toastNode.getComponent(UIOpacity);
        if (!op) op = this.toastNode.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 255;
        tween(op).delay(1.1).to(0.4, { opacity: 0 })
            .call(() => { this.toastNode.active = false; }).start();
    }

    // =====================================================================
    //  ФИНАЛ (A8)
    // =====================================================================
    private win(soft: boolean) {
        if (this.ended) return;
        this.ended = true;
        this.busy = true;
        this.clearReachable();
        if (this.zoneSelector) this.zoneSelector.hide();
        this.setObjective('TOTAL DOMINATION');
        this.flash(new Color(60, 130, 255, 255));
        this.floodBlue();
        const ec: any = this.getEndcard();
        this.scheduleOnce(() => {
            if (!ec) return;
            if (typeof ec.playWin === 'function') ec.playWin();
            else if (typeof ec.play === 'function') ec.play();
        }, 0.8);
    }

    private lose() {
        if (this.ended) return;
        this.ended = true;
        this.busy = true;
        this.clearReachable();
        if (this.zoneSelector) this.zoneSelector.hide();
        this.setObjective("DON'T LOSE WORLD WAR 3");
        this.flash(new Color(228, 62, 58, 255));
        const ec: any = this.getEndcard();
        this.scheduleOnce(() => {
            if (!ec) return;
            if (typeof ec.playLose === 'function') ec.playLose();
            else if (typeof ec.play === 'function') ec.play();
        }, 0.6);
    }

    /**
     * Ищет EndcardManager: сначала на назначенном endcardNode, затем — по всей
     * сцене (компонент часто оказывается на другом узле, напр. на Canvas, а поле
     * указывает на пустой «Endcard» — тогда getComponent на нём вернул бы null).
     */
    private getEndcard(): EndcardManager | null {
        let ec = this.endcardNode ? this.endcardNode.getComponent(EndcardManager) : null;
        if (!ec) {
            const scene = this.node.scene;
            ec = scene ? scene.getComponentInChildren(EndcardManager) : null;
        }
        if (!ec) warn('[GameManager] EndcardManager не найден: назначь endcardNode или проверь, что компонент есть в сцене');
        return ec;
    }

    /** Победная «заливка» карты синим */
    private floodBlue() {
        const reds = this.zones;
        for (let i = 0; i < reds.length; i++) {
            const z = reds[i];
            this.scheduleOnce(() => z.setOwner(Owner.You, CFG.OWN_CAPTURED_HP, true), i * 0.12);
        }
    }

    // =====================================================================
    //  FX: взрывы + тряска (стиль из текущего проекта)
    // =====================================================================
    private randomPointIn(z: Zone): Vec3 {
        const wp = z.node.worldPosition;
        let halfW = 90, halfH = 90;
        const ui = z.node.getComponent(UITransform);
        if (ui) {
            halfW = ui.width * z.node.worldScale.x * 0.5 * 0.55;
            halfH = ui.height * z.node.worldScale.y * 0.5 * 0.55;
        }
        return new Vec3(
            wp.x + (Math.random() * 2 - 1) * halfW,
            wp.y + (Math.random() * 2 - 1) * halfH,
            0
        );
    }

    private blast(worldPos: Vec3) {
        // многослойный взрыв (ударная волна + огонь + вспышка + искры + дым)
        Fx.explosion(this.node, worldPos, this.blastRadius);
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
}