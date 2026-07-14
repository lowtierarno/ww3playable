import {
    _decorator, Component, Node, Label, Vec3, tween, Tween,
    UIOpacity, UITransform, Graphics, Color, warn
} from 'cc';
import { Owner, Weapon, CFG, siegeSeconds } from './GameConfig';
import { Zone } from './Zone';
import { AbilityChip } from './AbilityChip';
import { SoundManager } from './SoundManager';
import { EndcardManager } from './EndcardManager';
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

    // ---------- Финал ----------
    @property({ type: Node, tooltip: 'Узел с EndcardManager' })
    endcardNode: Node = null;

    // ---------- FX ----------
    @property({ type: Node, tooltip: 'Что трясти при взрывах (карта/мир)' })
    shakeTarget: Node = null;
    @property({ tooltip: 'Радиус нарисованного взрыва' })
    blastRadius: number = 46;

    // ---------- Состояние ----------
    private army = CFG.START_ARMY;
    private eArmy = CFG.ENEMY_START_ARMY;
    private busy = false;          // блокирует ввод, пока ход разрешается
    private eTurnN = 0;            // счётчик ходов врага (для чётности strike)
    private ended = false;
    private zones: Zone[] = [];
    private heroZone: Zone | null = null;   // где сейчас стоит герой-танк
    private _shakeOrigin: Vec3 | null = null;
    private _watchdog = false;

    // =====================================================================
    //  ИНИЦИАЛИЗАЦИЯ
    // =====================================================================
    start() {
        this.collectZones();
        this.resolveNeighbors();
        for (const z of this.zones) z.initShield();

        // герой-танк на вашу столицу
        this.heroZone = this.zones.find(z => z.owner === Owner.You && z.isCapital) || null;
        if (this.heroTank && this.heroZone) {
            this.heroTank.setWorldPosition(this.heroZone.firePoint());
        }

        // тап по зонам
        for (const z of this.zones) {
            z.node.on(Node.EventType.TOUCH_END, () => this.onTapZone(z), this);
        }

        // способности
        for (const c of this.chips) c.bind((w) => this.fireAbility(w));

        if (this.toastNode) this.toastNode.active = false;

        this.syncArsenal();
        this.refreshHUD();
        this.setObjective('CAPTURE, EXPAND, OUT-GUN CHINA');
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

        this.driveHeroTo(z, () => {
            this.siegeZone(z, startShield, dur, () => {
                this.onPlayerCapture(z, neu);
            });
        });
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
    private driveHeroTo(z: Zone, done: () => void) {
        if (!this.heroTank) { done(); return; }
        const guard = { fired: false };
        const fire = () => { if (guard.fired) return; guard.fired = true; done(); };

        const dist = Vec3.distance(this.heroTank.worldPosition, z.firePoint());
        const t = Math.max(0.25, Math.min(1.2, dist / 900));
        Tween.stopAllByTarget(this.heroTank);
        tween(this.heroTank)
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

        z.setOwner(Owner.You, CFG.OWN_CAPTURED_HP, true);
        this.heroZone = z;
        if (this.heroTank) this.heroTank.setWorldPosition(z.firePoint());

        this.addArmy(wasNeutral ? CFG.GAIN_NEUTRAL : CFG.GAIN_ENEMY);
        if (SoundManager.instance) SoundManager.instance.playCapture();
        this.syncArsenal();

        this.endPlayerMove();
    }

    // =====================================================================
    //  ПЕРЕДАЧА ХОДА (A6)
    // =====================================================================
    private endPlayerMove() {
        this.busy = true;
        this._watchdog = false;
        this.setObjective('🔴 CHINA is moving...');
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
        this.setObjective('YOUR MOVE — take a zone');
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

    /** 🏭 — 2 танка захватывают 2 лучшие пограничные зоны; если некуда → +8 army */
    private abilityFactory() {
        const picks = this.factoryTargets();
        if (picks.length === 0) {
            this.addArmy(CFG.GAIN_ENEMY); // +8
            this.refreshHUD();
            return;
        }
        for (let i = 0; i < picks.length; i++) {
            const z = picks[i];
            const neu = z.owner === Owner.Neutral;
            this.scheduleOnce(() => {
                this.blast(this.randomPointIn(z));
                this.shake(9, 0.14);
                this.seize(z, neu ? CFG.GAIN_NEUTRAL : CFG.GAIN_ENEMY);
                this.refreshHUD();
            }, i * 0.25);
        }
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
        const startY = visible ? visible.height : 1200;
        const to = target.firePoint();
        const from = new Vec3(to.x, to.y + startY * 0.7, to.z);

        fx.active = true;
        fx.setWorldPosition(from);
        tween(fx)
            .to(0.5, { worldPosition: to }, { easing: 'quadIn' })
            .call(() => { fx.active = false; onHit(); })
            .start();
        this.scheduleOnce(() => { if (fx.active) { fx.active = false; onHit(); } }, 0.9);
    }

    // =====================================================================
    //  ВРАЖЕСКИЙ ИИ (A7) — ровно одно действие за ход
    // =====================================================================
    private enemyGroundMove(done: () => void) {
        const pick = this.enemyPickTarget();
        if (!pick) { done(); return; }
        const { zone, bounce } = pick;

        const guard = { ran: false };
        const drive = () => {
            if (guard.ran) return;
            guard.ran = true;
            for (let i = 0; i < 3; i++)
                this.scheduleOnce(() => {
                    this.blast(this.randomPointIn(zone));
                    this.shake(8, 0.13);
                    if (SoundManager.instance) SoundManager.instance.playExplosion();
                }, i * 0.15);
            this.scheduleOnce(() => { this.enemyResolve(zone, bounce); done(); }, 0.6);
        };

        if (this.enemyTank) {
            const from = this.enemyLaunchPoint(zone);
            this.enemyTank.active = true;
            this.enemyTank.setWorldPosition(from);
            tween(this.enemyTank)
                .to(0.7, { worldPosition: zone.firePoint() })
                .call(drive)
                .start();
            this.scheduleOnce(drive, 1.1); // fallback — ровно один раз
        } else {
            drive();
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

    private addArmy(delta: number) {
        const from = this.army;
        this.army += delta;
        if (!this.armyLabel) return;
        const v = { a: from };
        tween(v)
            .to(0.5, { a: this.army }, {
                onUpdate: () => {
                    this.armyLabel.string = String(Math.round(v.a));
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
    }
    private clearReachable() {
        for (const z of this.zones) z.setReachable(false);
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
        this.setObjective('TOTAL DOMINATION');
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
        this.setObjective("DON'T LOSE WORLD WAR 3");
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
        const parent = this.node;
        const n = new Node('Blast');
        parent.addChild(n);
        n.setWorldPosition(worldPos);

        const g = n.addComponent(Graphics);
        const op = n.addComponent(UIOpacity);
        const r = this.blastRadius;
        g.fillColor = new Color(255, 150, 40, 255);
        g.circle(0, 0, r); g.fill();
        g.fillColor = new Color(255, 240, 180, 255);
        g.circle(0, 0, r * 0.5); g.fill();

        n.setScale(0.2, 0.2, 1);
        tween(n).to(0.22, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'quadOut' }).start();
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
}