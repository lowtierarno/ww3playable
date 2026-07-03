import { _decorator, Component, Node, Vec3, tween, Tween, director, UIOpacity, Sprite, Color, EventTouch, BlockInputEvents } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Стартовый экран выбора региона.
 * Вешать на общий узел (например, Canvas сцены WorldMap).
 * Каждый регион — кликабельный узел (со Sprite/коллайдером кликов),
 * при нажатии проигрывается эффект и грузится сцена по имени.
 */
@ccclass('RegionSelect')
export class RegionSelect extends Component {

    // ----- Регион 1 -----
    @property({ type: Node, tooltip: 'Кликабельная зона первого региона (Европа)' })
    regionA: Node = null;
    @property({ tooltip: 'Имя сцены для региона A' })
    sceneA: string = 'Europe';

    // ----- Регион 2 -----
    @property({ type: Node, tooltip: 'Кликабельная зона второго региона (США)' })
    regionB: Node = null;
    @property({ tooltip: 'Имя сцены для региона B' })
    sceneB: string = 'USA';

    // ----- Затемнение перехода (полноэкранный чёрный спрайт, сверху всего) -----
    @property({ type: Node, tooltip: 'Чёрный оверлей на весь экран для перехода (в начале скрыт)' })
    fadeOverlay: Node = null;

    // ----- Подсказка -----
    @property({ tooltip: 'Пульсация регионов как подсказка «нажми»' })
    pulseHint: boolean = true;
    @property({ tooltip: 'Длительность затемнения перед переходом, сек' })
    fadeDuration: number = 0.5;

    private _busy: boolean = false;

    // исходные масштабы регионов: твины считаются от них, а не от (1,1,1),
    // иначе первая же пульсация затирает авторский масштаб хит-зоны
    private _baseScale: Map<Node, Vec3> = new Map();

    start() {
        // подготавливаем оверлей — прозрачный и не ловит клики, пока не нужен
        if (this.fadeOverlay) {
            this.fadeOverlay.active = true;
            const op = this.getOpacity(this.fadeOverlay);
            op.opacity = 0;
            // блокер кликов включим только на момент перехода
            const blocker = this.fadeOverlay.getComponent(BlockInputEvents);
            if (blocker) blocker.enabled = false;
        }

        this.setupRegion(this.regionA, this.sceneA);
        this.setupRegion(this.regionB, this.sceneB);

        if (this.pulseHint) {
            this.startPulse(this.regionA);
            this.startPulse(this.regionB);
        }
    }

    private setupRegion(region: Node, sceneName: string) {
        if (!region) return;

        this._baseScale.set(region, region.scale.clone());

        // наведение — подсветка и лёгкое увеличение
        region.on(Node.EventType.MOUSE_ENTER, () => this.onHover(region, true), this);
        region.on(Node.EventType.MOUSE_LEAVE, () => this.onHover(region, false), this);

        // клик — эффект нажатия и переход
        region.on(Node.EventType.TOUCH_END, () => this.onRegionClick(region, sceneName), this);
    }

    // ----- Наведение -----
    private onHover(region: Node, hovered: boolean) {
        if (this._busy) return;

        Tween.stopAllByTarget(region);

        if (hovered) {
            tween(region)
                .to(0.15, { scale: this.scaled(region, 1.06) }, { easing: 'sineOut' })
                .start();
        } else {
            // вернуть нормальный масштаб и снова запустить пульс-подсказку
            tween(region)
                .to(0.15, { scale: this.scaled(region, 1) }, { easing: 'sineOut' })
                .call(() => { if (this.pulseHint && !this._busy) this.startPulse(region); })
                .start();
        }

        const sp = region.getComponent(Sprite);
        if (sp) {
            const c = hovered ? new Color(255, 255, 255, 255) : new Color(210, 210, 210, 255);
            tween(sp).to(0.15, { color: c }).start();
        }
    }

    // ----- Пульсация-подсказка -----
    private startPulse(region: Node) {
        if (!region) return;
        const up = this.scaled(region, 1.03);
        const norm = this.scaled(region, 1);
        tween(region)
            .repeatForever(
                tween(region)
                    .to(0.7, { scale: up }, { easing: 'sineInOut' })
                    .to(0.7, { scale: norm }, { easing: 'sineInOut' })
            )
            .start();
    }

    // ----- Клик по региону -----
    private onRegionClick(region: Node, sceneName: string) {
        if (this._busy) return;
        this._busy = true;

        // останавливаем пульс/ховер
        Tween.stopAllByTarget(this.regionA);
        Tween.stopAllByTarget(this.regionB);

        // короткий «отклик»: выбранный регион чуть подпрыгивает, затем переход
        tween(region)
            .to(0.12, { scale: this.scaled(region, 1.12) }, { easing: 'backOut' })
            .to(0.1, { scale: this.scaled(region, 1.05) })
            .call(() => this.goToScene(sceneName))
            .start();
    }

    // ----- Переход на сцену с затемнением -----
    private goToScene(sceneName: string) {
        if (this.fadeOverlay) {
            const blocker = this.fadeOverlay.getComponent(BlockInputEvents);
            if (blocker) blocker.enabled = true;

            const op = this.getOpacity(this.fadeOverlay);
            tween(op)
                .to(this.fadeDuration, { opacity: 255 })
                .call(() => director.loadScene(sceneName))
                .start();
        } else {
            // без оверлея — грузим сразу
            director.loadScene(sceneName);
        }
    }

    private scaled(region: Node, factor: number): Vec3 {
        const b = this._baseScale.get(region) ?? region.scale.clone();
        return new Vec3(b.x * factor, b.y * factor, b.z);
    }

    private getOpacity(node: Node): UIOpacity {
        let op = node.getComponent(UIOpacity);
        if (!op) op = node.addComponent(UIOpacity);
        return op;
    }
}