import { _decorator, Component, Node, Label, Enum, Sprite, Color, UIOpacity, Vec3, tween, Tween } from 'cc';
import { Owner, Weapon, CFG } from './GameConfig';
const { ccclass, property } = _decorator;

/**
 * Зона карты. Вешать на КАЖДЫЙ узел-территорию (столица / провинция / нейтрал).
 *
 * ЦВЕТ ВЛАДЕЛЬЦА — гибридная схема (по GDD §3/§7):
 *  - На зоне лежит ОДИН полупрозрачный оверлей-спрайт (белая маска формы зоны),
 *    поверх painterly-terrain. Его тинт задаёт принадлежность:
 *    синий = ваша, красный = вражья, прозрачный/тан = нейтрал.
 *  - Захват = «blue-tide»: новый цвет вливается с нулевой прозрачности (tween).
 *  - Painterly-фактура карты просвечивает снизу, отдельных RED/BLUE-картинок
 *    территории НЕ требуется.
 *
 * Оверлей-маска красится тинтом, поэтому её текстура должна быть БЕЛОЙ/СЕРОЙ
 * (tint = цвет × белый). Цветной запечённый PNG тинтом не перекрасить.
 *
 * skinYou/skinEnemy/skinNeutral оставлены для СТОЛИЦ и СТРУКТУР — это отдельные
 * спрайты по фракциям (capital_blue/red/neutral, здания с флагом), которые
 * тинтом красить нельзя. Для обычных территорий их можно не заполнять.
 */
@ccclass('Zone')
export class Zone extends Component {

    @property({ tooltip: 'ID зоны (us, cn, n1..n9) — для отладки и логов' })
    id: string = '';

    @property({ type: Enum(Owner), tooltip: 'Стартовый владелец' })
    startOwner: Owner = Owner.Neutral;

    @property({ tooltip: 'Это столица (цель победы / поражения)?' })
    isCapital: boolean = false;

    @property({ type: Enum(Weapon), tooltip: 'Оружейная структура на зоне (даёт способность владельцу)' })
    weapon: Weapon = Weapon.None;

    @property({ tooltip: 'Прибрежная зона — по ней бьёт/высаживается флот' })
    coastal: boolean = false;

    @property({ type: [Node], tooltip: 'Соседние зоны (двусторонний граф — впиши соседей с обеих сторон)' })
    neighborNodes: Node[] = [];

    // ---------- Оверлей-заливка (основной механизм цвета владельца) ----------
    @property({ type: Sprite, tooltip: 'Оверлей-маска зоны (БЕЛЫЙ спрайт формы территории). Тинтуется по владельцу' })
    colorOverlay: Sprite = null;

    @property({ type: Color, tooltip: 'Цвет вашей территории (синий). Alpha = насыщенность заливки' })
    colorYou: Color = new Color(60, 130, 255, 165);

    @property({ type: Color, tooltip: 'Цвет вражьей территории (красный)' })
    colorEnemy: Color = new Color(228, 62, 58, 165);

    @property({ type: Color, tooltip: 'Цвет нейтрала (тан). Если под зоной есть painterly-terrain и хочешь его показать — снизь alpha к 0' })
    colorNeutral: Color = new Color(202, 186, 148, 120);

    @property({ tooltip: 'Длительность «прилива» цвета при захвате, сек' })
    tideSeconds: number = 0.55;

    // ---------- Отдельные скины по фракциям (столицы / структуры) ----------
    @property({ type: Node, tooltip: 'Синий скин-спрайт (столица/структура). Для обычных зон не нужен' })
    skinYou: Node = null;
    @property({ type: Node, tooltip: 'Красный скин-спрайт (столица/структура)' })
    skinEnemy: Node = null;
    @property({ type: Node, tooltip: 'Нейтральный скин-спрайт (столица/структура)' })
    skinNeutral: Node = null;

    @property({ type: Label, tooltip: 'Число-щит на зоне' })
    shieldLabel: Label = null;

    @property({ type: Node, tooltip: 'Иконка структуры (аэродром/порт/шахта/завод) — видна на оружейной зоне' })
    structureIcon: Node = null;

    @property({ type: Node, tooltip: 'Куда встаёт танк, стоящий на зоне' })
    unitAnchor: Node = null;

    @property({ type: Node, tooltip: 'Точка запуска флота из моря (для прибрежных зон)' })
    seaLaunchPoint: Node = null;

    @property({ type: Node, tooltip: 'Подсветка «сюда можно ходить» (в начале скрыта)' })
    reachableGlow: Node = null;

    // ---------- Рантайм ----------
    owner: Owner = Owner.Neutral;
    shield: number = 0;
    neighbors: Zone[] = []; // резолвится GameManager-ом из neighborNodes
    private _glowBase: Vec3 | null = null; // базовый масштаб подсветки (без накопления)

    /** Стартовый щит по роли (A3). Вызывает GameManager при инициализации. */
    initShield() {
        this.owner = this.startOwner;
        if (this.owner === Owner.You) {
            this.shield = this.isCapital ? CFG.OWN_CAPITAL_HP : CFG.OWN_PROVINCE_HP;
        } else if (this.owner === Owner.Enemy) {
            this.shield = this.isCapital ? CFG.ENEMY_CAPITAL_DEF : CFG.ENEMY_PROVINCE_DEF;
        } else {
            this.shield = CFG.NEUTRAL_DEF;
        }
        this.repaint(false); // мгновенно, без прилива
    }

    /** Сколько ARMY нужно врагу, чтобы отнять эту зону (ownDef, только когда зона ваша) */
    ownDef(): number {
        return this.shield;
    }

    /** Меняет владельца; при fade — цвет «вливается» приливом */
    setOwner(owner: Owner, shield: number, fade: boolean = true) {
        this.owner = owner;
        this.shield = shield;
        this.repaint(fade);
    }

    /** Обновляет текст щита без смены владельца */
    refreshShield() {
        if (!this.shieldLabel) return;
        const hide = this.owner === Owner.Neutral || this.shield <= 0;
        this.shieldLabel.string = hide ? '' : String(this.shield);
    }

    /** Перерисовать под текущего владельца: оверлей-тинт + скины + иконка + щит */
    repaint(fade: boolean) {
        this.tintOverlay(fade);

        // отдельные скины (столицы/структуры) — переключаем с лёгким проявлением
        const set = (n: Node | null, on: boolean) => {
            if (!n) return;
            if (on && fade && !n.active) {
                n.active = true;
                let op = n.getComponent(UIOpacity);
                if (!op) op = n.addComponent(UIOpacity);
                op.opacity = 0;
                tween(op).to(this.tideSeconds, { opacity: 255 }).start();
            } else {
                n.active = on;
            }
        };
        set(this.skinYou, this.owner === Owner.You);
        set(this.skinEnemy, this.owner === Owner.Enemy);
        set(this.skinNeutral, this.owner === Owner.Neutral);

        if (this.structureIcon) this.structureIcon.active = this.weapon !== Weapon.None;
        this.refreshShield();
    }

    /** Заливка территории: тинт оверлея по владельцу. При fade — «прилив» нового цвета. */
    private tintOverlay(fade: boolean) {
        if (!this.colorOverlay) return;
        const sp = this.colorOverlay;
        const target = this.overlayColorFor(this.owner);

        sp.node.active = true;
        Tween.stopAllByTarget(sp);

        if (fade) {
            // новый цвет вливается с нулевой прозрачности — чистый «tide», без грязного
            // промежуточного смешивания красного с синим
            sp.color = new Color(target.r, target.g, target.b, 0);
            tween(sp).to(this.tideSeconds, { color: target.clone() }).start();
        } else {
            sp.color = target.clone();
        }
    }

    private overlayColorFor(o: Owner): Color {
        if (o === Owner.You) return this.colorYou;
        if (o === Owner.Enemy) return this.colorEnemy;
        return this.colorNeutral;
    }

    /** Мировая точка, куда едет танк, чтобы обстрелять/встать на зону */
    firePoint() {
        return (this.unitAnchor || this.node).worldPosition.clone();
    }

    /**
     * Подсветка «сюда можно ходить»: зелёная обводка зоны пульсирует (как в
     * прототипе). reachableGlow — узел с зелёным контуром/маской зоны.
     * Масштаб пульса считается от базового, запомненного один раз.
     */
    setReachable(on: boolean) {
        const g = this.reachableGlow;
        if (!g) return;
        if (this._glowBase === null) this._glowBase = g.scale.clone();
        const b = this._glowBase;

        if (on) {
            if (g.active) return;          // уже подсвечена и пульсирует
            g.active = true;
            Tween.stopAllByTarget(g);
            g.setScale(b);
            const up = new Vec3(b.x * 1.05, b.y * 1.05, 1);
            tween(g)
                .repeatForever(
                    tween(g)
                        .to(0.6, { scale: up }, { easing: 'sineInOut' })
                        .to(0.6, { scale: b }, { easing: 'sineInOut' })
                )
                .start();
        } else {
            Tween.stopAllByTarget(g);
            g.setScale(b);
            g.active = false;
        }
    }

    /**
     * Прячет/показывает «геймплейную» мелочь зоны — щит и иконку структуры.
     * Цвет территории (оверлей) остаётся, чтобы на экране выбора карта была
     * раскрашена (превью), но без цифр щитов и построек.
     */
    setChromeVisible(on: boolean) {
        if (this.shieldLabel) this.shieldLabel.node.active = on;
        if (this.structureIcon) this.structureIcon.active = on && this.weapon !== Weapon.None;
        if (!on) this.setReachable(false);
    }
}