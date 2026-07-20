import { _decorator, Component, Node, Graphics, Label, Sprite, SpriteFrame, UITransform, Color, Vec3, tween, Tween, UIOpacity, view } from 'cc';
import { Nation } from './GameConfig';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

/**
 * Экран выбора страны в начале (как в прототипе):
 *   «CHOOSE YOUR SUPERPOWER — Tap a flag — fight as USA or China».
 *
 * Рисует к каждому флагу пульсирующее золотое кольцо и плашку с названием
 * страны (и, опционально, иконкой флага), водит руку-подсказку. По тапу
 * передаёт выбор в GameManager (beginWithNation) и уводит панель.
 */
@ccclass('CountrySelect')
export class CountrySelect extends Component {

    @property({ type: GameManager, tooltip: 'Ссылка на GameManager' })
    game: GameManager = null;

    @property({ type: Node, tooltip: 'Корень панели выбора (заголовок + подпись + флаги). Уходит после выбора' })
    panel: Node = null;

    @property({ type: Node, tooltip: 'Кликабельный флаг/зона США' })
    usaButton: Node = null;

    @property({ type: Node, tooltip: 'Кликабельный флаг/зона Китая' })
    chinaButton: Node = null;

    @property({ type: Node, tooltip: 'Рука-подсказка (необязательно). Покачивается над флагом США' })
    hand: Node = null;

    // ---------- Адаптация заголовка под ориентацию ----------
    @property({ type: Node, tooltip: 'Блок заголовка (CHOOSE YOUR SUPERPOWER + подпись). Двигается/масштабируется под ориентацию' })
    titleBlock: Node = null;
    @property({ tooltip: 'Позиция заголовка в ПОРТРЕТЕ (X, Y)' })
    portraitTitlePos: Vec3 = new Vec3(0, 0, 0);
    @property({ tooltip: 'Масштаб заголовка в портрете' })
    portraitTitleScale: number = 1;
    @property({ tooltip: 'Позиция заголовка в ЛАНДШАФТЕ (X, Y) — обычно выше, чтобы не налезал на флаги' })
    landscapeTitlePos: Vec3 = new Vec3(0, 210, 0);
    @property({ tooltip: 'Масштаб заголовка в ландшафте (меньше 1 — компактнее)' })
    landscapeTitleScale: number = 0.65;

    // ---------- Плашки с названием страны ----------
    @property({ tooltip: 'Рисовать плашки с названием страны над кольцами' })
    showNameTags: boolean = true;
    @property({ tooltip: 'Название страны слева' })
    usaName: string = 'USA';
    @property({ tooltip: 'Название страны справа' })
    chinaName: string = 'CHINA';
    @property({ type: SpriteFrame, tooltip: 'Иконка флага США (необязательно)' })
    usaFlag: SpriteFrame = null;
    @property({ type: SpriteFrame, tooltip: 'Иконка флага Китая (необязательно)' })
    chinaFlag: SpriteFrame = null;
    @property({ tooltip: 'Размер плашки (общий множитель). Меньше 1 — компактнее' })
    tagScale: number = 0.8;
    @property({ tooltip: 'Размер шрифта названия, px' })
    tagFontSize: number = 26;
    @property({ tooltip: 'Смещение плашки по Y над кольцом, px' })
    tagOffsetY: number = 96;
    @property({ type: Color, tooltip: 'Фон плашки' })
    tagBg: Color = new Color(18, 24, 36, 225);
    @property({ type: Color, tooltip: 'Цвет текста' })
    tagText: Color = new Color(238, 242, 250, 255);

    // ---------- Кольцо выбора ----------
    @property({ type: Color, tooltip: 'Цвет кольца выбора (золото)' })
    ringColor: Color = new Color(240, 200, 90, 255);
    @property({ tooltip: 'Радиус кольца вокруг флага, px' })
    ringRadius: number = 62;
    @property({ tooltip: 'Толщина кольца, px' })
    ringWidth: number = 4;
    @property({ tooltip: 'Смещение кольца по Y относительно флага, px' })
    ringOffsetY: number = -6;

    private _picked = false;
    private _handBase: Vec3 = new Vec3(1, 1, 1);
    private _oriLast = -1;   // -1 неизвестно, 0 ландшафт, 1 портрет
    private _oriHold = 0;

    start() {
        this.makeRing(this.usaButton);
        this.makeRing(this.chinaButton);

        if (this.showNameTags) {
            this.makeNameTag(this.usaButton, this.usaName, this.usaFlag);
            this.makeNameTag(this.chinaButton, this.chinaName, this.chinaFlag);
        }

        if (this.usaButton) this.usaButton.on(Node.EventType.TOUCH_END, this.pickUSA, this);
        if (this.chinaButton) this.chinaButton.on(Node.EventType.TOUCH_END, this.pickChina, this);

        this.startHand();
        this._oriLast = -1;   // применить заголовок в первом update()
    }

    /** Опрос ориентации по кадрам — надёжнее событий/screen.windowSize и
     *  перебивает Widget.updateAlignment() от AdaptiveLayout */
    update() {
        if (!this.titleBlock) return;
        const v = view.getVisibleSize();
        if (v.width <= 0 || v.height <= 0) return;
        const cur = v.height >= v.width ? 1 : 0;
        if (cur !== this._oriLast) { this._oriLast = cur; this._oriHold = 10; }
        if (this._oriHold > 0) { this._oriHold--; this.applyOrientation(cur === 1); }
    }

    /** Двигает/масштабирует блок заголовка под ориентацию */
    private applyOrientation(portrait: boolean) {
        if (!this.titleBlock) return;
        const pos = portrait ? this.portraitTitlePos : this.landscapeTitlePos;
        const s = portrait ? this.portraitTitleScale : this.landscapeTitleScale;
        this.titleBlock.setPosition(pos.x, pos.y, 0);
        this.titleBlock.setScale(s, s, 1);
    }

    onDestroy() {
        if (this.usaButton) this.usaButton.off(Node.EventType.TOUCH_END, this.pickUSA, this);
        if (this.chinaButton) this.chinaButton.off(Node.EventType.TOUCH_END, this.pickChina, this);
    }

    private pickUSA() { this.pick(Nation.USA); }
    private pickChina() { this.pick(Nation.China); }

    // ---------- золотое кольцо вокруг флага ----------
    private makeRing(flag: Node) {
        if (!flag) return;
        const ring = new Node('SelectRing');
        flag.addChild(ring);
        ring.setPosition(0, this.ringOffsetY, 0);

        const g = ring.addComponent(Graphics);
        g.lineWidth = this.ringWidth * 3;
        g.strokeColor = new Color(this.ringColor.r, this.ringColor.g, this.ringColor.b, 45);
        g.circle(0, 0, this.ringRadius); g.stroke();
        g.lineWidth = this.ringWidth;
        g.strokeColor = new Color(this.ringColor.r, this.ringColor.g, this.ringColor.b, 230);
        g.circle(0, 0, this.ringRadius); g.stroke();

        const base = ring.scale.clone();
        const up = new Vec3(base.x * 1.08, base.y * 1.08, 1);
        tween(ring)
            .repeatForever(
                tween(ring)
                    .to(0.7, { scale: up }, { easing: 'sineInOut' })
                    .to(0.7, { scale: base }, { easing: 'sineInOut' })
            )
            .start();
    }

    // ---------- плашка с названием страны (пилюля + флаг + текст) ----------
    private makeNameTag(flag: Node, text: string, frame: SpriteFrame | null) {
        if (!flag) return;

        const fontSize = this.tagFontSize;
        const padX = fontSize * 0.66, padY = fontSize * 0.34, gap = fontSize * 0.34;
        const flagW = frame ? fontSize * 1.25 : 0;
        const flagH = fontSize * 0.85;
        const textW = Math.max(1, text.length) * fontSize * 0.64;
        const w = padX * 2 + (frame ? flagW + gap : 0) + textW;
        const h = fontSize + padY * 2;

        const tag = new Node('NameTag');
        flag.addChild(tag);
        tag.setPosition(0, this.tagOffsetY, 0);
        tag.setScale(this.tagScale, this.tagScale, 1);   // общий размер плашки
        (tag.addComponent(UITransform)).setContentSize(w, h);

        // фон-пилюля + тонкая рамка
        const g = tag.addComponent(Graphics);
        g.fillColor = this.tagBg;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill();
        g.lineWidth = 2;
        g.strokeColor = new Color(255, 255, 255, 45);
        g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.stroke();

        // флаг слева (если задан) + сдвиг текста
        let textX = 0;
        if (frame) {
            const fn = new Node('Flag');
            tag.addChild(fn);
            (fn.addComponent(UITransform)).setContentSize(flagW, flagH);
            const sp = fn.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = frame;
            fn.setPosition(-w / 2 + padX + flagW / 2, 0, 0);
            textX = (flagW + gap) / 2;
        }

        // название
        const ln = new Node('Name');
        tag.addChild(ln);
        ln.addComponent(UITransform);
        const lbl = ln.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.lineHeight = fontSize + 2;
        lbl.color = this.tagText;
        lbl.enableBold = true;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        ln.setPosition(textX, 0, 0);
    }

    // ---------- рука-подсказка над флагом США ----------
    private startHand() {
        if (!this.hand) return;
        this._handBase = this.hand.scale.clone();
        const down = new Vec3(this._handBase.x * 0.86, this._handBase.y * 0.86, 1);
        tween(this.hand)
            .repeatForever(
                tween(this.hand)
                    .to(0.4, { scale: down }, { easing: 'sineIn' })
                    .to(0.4, { scale: this._handBase }, { easing: 'sineOut' })
                    .delay(0.2)
            )
            .start();
    }

    // ---------- выбор ----------
    private pick(nation: Nation) {
        if (this._picked) return;
        this._picked = true;

        if (SoundManager.instance) SoundManager.instance.playCapture();
        if (this.hand) Tween.stopAllByTarget(this.hand);

        const root = this.panel || this.node;
        let op = root.getComponent(UIOpacity);
        if (!op) op = root.addComponent(UIOpacity);
        tween(op)
            .to(0.35, { opacity: 0 })
            .call(() => {
                root.active = false;
                if (this.game) this.game.beginWithNation(nation);
            })
            .start();
    }
}