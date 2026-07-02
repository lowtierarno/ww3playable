import {
    _decorator,
    Component,
    UITransform,
    view,
    screen,
} from 'cc';

const { ccclass } = _decorator;

@ccclass('FitMap')
export class FitMap extends Component {

    onLoad() {

        this.updateScale();

        screen.on('window-resize', this.updateScale, this);
        screen.on('orientation-change', this.updateScale, this);
    }

    onDestroy() {

        screen.off('window-resize', this.updateScale, this);
        screen.off('orientation-change', this.updateScale, this);

    }

    updateScale() {

        const visible = view.getVisibleSize();

        const trans = this.getComponent(UITransform)!;

        const mapW = trans.width;
        const mapH = trans.height;

        const scale = Math.max(
            visible.width / mapW,
            visible.height / mapH
        );

        this.node.setScale(scale, scale, 1);

    }

}