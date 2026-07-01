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

const { ccclass, property } = _decorator;


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

        // обновляем все Widget после смены разрешения
        this.scheduleOnce(() => {

            const widgets = this.node.scene!.getComponentsInChildren(Widget);

            for (const w of widgets)
                w.updateAlignment();

        }, 0);
    }
}