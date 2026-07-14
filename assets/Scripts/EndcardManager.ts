import { _decorator, Component, Node, Camera, UIOpacity, UITransform, Vec3, tween, sys, view, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EndcardManager')
export class EndcardManager extends Component {

    @property({ type: Camera, tooltip: 'Камера карты — только если у карты ОТДЕЛЬНАЯ камера от UI' })
    gameplayCamera: Camera = null;

    @property({ type: Node, tooltip: 'Корень мира/карты (если всё на одном Canvas)' })
    worldRoot: Node = null;

    @property({ type: Node, tooltip: 'Узел спрайта карты — по нему считается край и центр' })
    mapNode: Node = null;

    @property({ type: [Node], tooltip: 'UI, который плавно исчезнет' })
    uiToFade: Node[] = [];

    @property({ type: Node, tooltip: 'Баннер CTA целиком (BG + кнопка). В начале скрыт' })
    ctaBanner: Node = null;

    @property({ type: Node, tooltip: 'Кликабельная кнопка. Если пусто — кликом служит весь баннер' })
    ctaButton: Node = null;

    // ----- Заголовок исхода -----
    @property({ type: Label, tooltip: 'Заголовок финала (TOTAL DOMINATION / DON\'T LOSE WORLD WAR 3)' })
    headlineLabel: Label = null;
    @property({ tooltip: 'Текст при победе' })
    winText: string = 'TOTAL DOMINATION';
    @property({ tooltip: 'Текст при мягком поражении' })
    loseText: string = "DON'T LOSE WORLD WAR 3";
    @property({ type: Label, tooltip: 'Надпись на кнопке CTA (необязательно)' })
    ctaLabel: Label = null;
    @property({ tooltip: 'Текст CTA при победе' })
    ctaWinText: string = 'LEAD WORLD WAR 3';
    @property({ tooltip: 'Текст CTA при поражении' })
    ctaLoseText: string = 'PLAY NOW';

    @property({ tooltip: 'Во сколько раз отдалить (1.3-1.5 = лёгкий зум)' })
    zoomOutFactor: number = 1.4;
    @property({ tooltip: 'Длительность отдаления, сек' })
    zoomDuration: number = 1.6;
    @property({ tooltip: 'Не отдалять за край карты (если есть фон — выключи)' })
    keepMapCovered: boolean = true;
    @property({ tooltip: 'Запас покрытия: карта заходит за края с излишком (1 = впритык, 1.1 = +10%)' })
    coverPadding: number = 1.05;
    @property({ tooltip: 'Куда сместить карту при отъезде (X, Y в мировых px). + вправо/вверх' })
    focusOffset: Vec3 = new Vec3(0, 0, 0);
    @property({ tooltip: 'Ссылка на стор (fallback)' })
    storeUrl: string = '';

    private _played = false;
    private _ctaWired = false;

    start() {
        if (this._played) return;
        if (this.ctaBanner) this.ctaBanner.active = false;
    }

    /** Финал: победа */
    playWin() {
        if (this.headlineLabel) this.headlineLabel.string = this.winText;
        if (this.ctaLabel) this.ctaLabel.string = this.ctaWinText;
        this.play();
    }

    /** Финал: мягкое поражение (тоже ведёт на PLAY NOW) */
    playLose() {
        if (this.headlineLabel) this.headlineLabel.string = this.loseText;
        if (this.ctaLabel) this.ctaLabel.string = this.ctaLoseText;
        this.play();
    }

    play() {
        if (this._played) return;
        this._played = true;
        this.fadeOutUI();
        this.zoomOut(() => this.showCta());
    }

    fadeOutUI() {
        const dur = this.zoomDuration * 0.8;
        for (const n of this.uiToFade) {
            if (!n) continue;
            let op = n.getComponent(UIOpacity);
            if (!op) op = n.addComponent(UIOpacity);
            tween(op).to(dur, { opacity: 0 }).call(() => { n.active = false; }).start();
        }
    }

    zoomOut(onDone: () => void) {
        if (this.gameplayCamera) {
            const cam = this.gameplayCamera;
            const data = { h: cam.orthoHeight };
            tween(data)
                .to(this.zoomDuration, { h: cam.orthoHeight * this.zoomOutFactor }, {
                    easing: 'cubicInOut',
                    onUpdate: () => { cam.orthoHeight = data.h; }
                })
                .call(onDone).start();
            return;
        }

        if (this.worldRoot) {
            const wr = this.worldRoot;
            const map = this.mapNode || wr;

            const startS = wr.worldScale.x || 1;
            let endS = 1 / this.zoomOutFactor;

            if (this.keepMapCovered) {
                const ui = map.getComponent(UITransform);
                if (ui && ui.width > 0 && ui.height > 0) {
                    const visible = view.getVisibleSize();
                    const mapW = ui.width * map.worldScale.x;
                    const mapH = ui.height * map.worldScale.y;
                    const pad = this.coverPadding > 0 ? this.coverPadding : 1;
                    const minS = startS * Math.max(visible.width / mapW, visible.height / mapH) * pad;
                    if (endS < minS) endS = minS;
                }
            }

            const c = map.worldPosition.clone();
            const wp0 = wr.worldPosition.clone();
            const dx = c.x - wp0.x;
            const dy = c.y - wp0.y;
            const off = this.focusOffset;

            const d = { k: 0 };
            tween(d)
                .to(this.zoomDuration, { k: 1 }, {
                    easing: 'cubicInOut',
                    onUpdate: () => {
                        const cs = startS + (endS - startS) * d.k;
                        const f = cs / startS;
                        const ox = off.x * d.k;
                        const oy = off.y * d.k;
                        wr.setScale(cs, cs, 1);
                        wr.setWorldPosition(c.x - dx * f - ox, c.y - dy * f - oy, wp0.z);
                    }
                })
                .call(onDone).start();
            return;
        }

        onDone();
    }

    showCta() {
        const banner = this.ctaBanner || this.ctaButton;
        if (!banner) return;
        banner.active = true;

        const click = this.ctaButton || banner;
        if (click && !this._ctaWired) {
            click.on(Node.EventType.TOUCH_END, this.onCtaClick, this);
            this._ctaWired = true;
        }

        let op = banner.getComponent(UIOpacity);
        if (!op) op = banner.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op)
            .to(0.4, { opacity: 255 })
            .call(() => this.pulseButton())
            .start();
    }

    pulseButton() {
        if (!this.ctaButton) return;
        const base = this.ctaButton.scale.clone();
        const up = new Vec3(base.x * 1.08, base.y * 1.08, 1);
        tween(this.ctaButton)
            .repeatForever(
                tween(this.ctaButton)
                    .to(0.7, { scale: up }, { easing: 'sineInOut' })
                    .to(0.7, { scale: base }, { easing: 'sineInOut' })
            )
            .start();
    }

    onCtaClick() {
        const w = (typeof window !== 'undefined') ? (window as any) : null;
        if (w && w.mraid && typeof w.mraid.open === 'function') {
            w.mraid.open(this.storeUrl);
        } else if (w && w.FbPlayableAd && w.FbPlayableAd.onCTAClick) {
            w.FbPlayableAd.onCTAClick();
        } else if (w && typeof w.install === 'function') {
            w.install();
        } else if (this.storeUrl) {
            sys.openURL(this.storeUrl);
        }
    }
}