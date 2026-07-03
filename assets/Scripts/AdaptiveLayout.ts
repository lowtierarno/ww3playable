import {
    _decorator,
    Component,
    Node,
    Widget,
    view,
    screen,
    ResolutionPolicy,
    UITransform,
} from 'cc';
import { CoverScreen } from './CoverScreen';

const { ccclass, property } = _decorator;

/**
 * Переключает дизайн-разрешение и наборы UI под текущую ориентацию.
 *
 * Портрет:   FIXED_WIDTH  — видимая ширина всегда = portraitWidth.
 * Ландшафт:  FIXED_HEIGHT — видимая высота всегда = landscapeHeight.
 *
 * HUD-панели нарисованы под фиксированную ширину (1080 / 2944 px),
 * поэтому их масштаб подгоняется под ФАКТИЧЕСКУЮ видимую ширину экрана —
 * так они никогда не обрезаются по краям и не оставляют щелей
 * на любом соотношении сторон.
 */
@ccclass('AdaptiveLayout')
export class AdaptiveLayout extends Component {

    @property(Node)
    portraitTop: Node = null!;

    @property(Node)
    portraitBottom: Node = null!;

    @property(Node)
    landscapeUI: Node = null!;

    @property
    portraitWidth = 720;

    @property
    portraitHeight = 1280;

    @property
    landscapeWidth = 1280;

    @property
    landscapeHeight = 720;

    onLoad() {

        this.apply();

        screen.on('window-resize', this.onResize, this);
        screen.on('orientation-change', this.onResize, this);

        // после первого кадра Cocos уже знает настоящий размер Canvas
        this.scheduleOnce(() => {
            this.apply();
        }, 0);
    }

    onDestroy() {
        screen.off('window-resize', this.onResize, this);
        screen.off('orientation-change', this.onResize, this);
    }

    private onResize() {
        this.scheduleOnce(() => {
            this.apply();
        }, 0);
    }

    private apply() {

        const size = screen.windowSize;
        if (size.width <= 0 || size.height <= 0) return;

        const portrait = size.height >= size.width;

        if (portrait) {
            view.setDesignResolutionSize(
                this.portraitWidth,
                this.portraitHeight,
                ResolutionPolicy.FIXED_WIDTH
            );
        } else {
            view.setDesignResolutionSize(
                this.landscapeWidth,
                this.landscapeHeight,
                ResolutionPolicy.FIXED_HEIGHT
            );
        }

        if (this.portraitTop)
            this.portraitTop.active = portrait;

        if (this.portraitBottom)
            this.portraitBottom.active = portrait;

        if (this.landscapeUI)
            this.landscapeUI.active = !portrait;

        // HUD подгоняется по фактической видимой ширине
        const visibleWidth = view.getVisibleSize().width;
        if (portrait) {
            this.fitToWidth(this.portraitTop, visibleWidth);
            this.fitToWidth(this.portraitBottom, visibleWidth);
        } else {
            this.fitToWidth(this.landscapeUI, visibleWidth);
        }

        // карта пересчитывается ПОСЛЕ смены дизайн-разрешения:
        // порядок событий resize у отдельных компонентов не гарантирован
        const covers = this.node.scene?.getComponentsInChildren(CoverScreen);
        if (covers)
            for (const c of covers)
                c.fit();

        // обновляем все Widget после смены разрешения
        this.scheduleOnce(() => {

            const widgets = this.node.scene!.getComponentsInChildren(Widget);

            for (const w of widgets)
                w.updateAlignment();

        }, 0);
    }

    private fitToWidth(ui: Node | null, width: number) {
        if (!ui) return;

        const trans = ui.getComponent(UITransform);
        if (!trans || trans.width <= 0) return;

        const s = width / trans.width;
        ui.setScale(s, s, 1);
    }
}
