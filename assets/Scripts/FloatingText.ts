import { _decorator, Component, Node, Label, UIOpacity, UITransform, Vec3, Color, tween } from 'cc';
const { ccclass } = _decorator;

/**
 * Всплывающий текст «+N» / «-N» над точкой карты (GDD §7 «+N floats»).
 *
 * Префаб НЕ нужен: Label строится в рантайме, делает пружинистый «поп»,
 * всплывает по дуге со случайным сносом, гаснет и уничтожается.
 * Обводка + тень для читаемости на любой карте. Никогда не виснет.
 *
 * FloatingText.spawn(this.node, worldPos, '+8', new Color(120,220,140,255));
 *
 * parent — НЕ масштабированный слой (обычно Canvas), иначе шрифт «уедет».
 */
@ccclass('FloatingText')
export class FloatingText extends Component {

    static spawn(
        parent: Node,
        worldPos: Vec3,
        text: string,
        color: Color = new Color(255, 255, 255, 255),
        fontSize = 46,
        rise = 96,
        life = 0.95,
    ) {
        if (!parent || !parent.isValid) return;

        const n = new Node('FloatText');
        parent.addChild(n);
        n.addComponent(UITransform);

        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.lineHeight = fontSize + 4;
        lbl.color = color;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.isBold = true;
        // обводка — контраст
        lbl.enableOutline = true;
        lbl.outlineColor = new Color(0, 0, 0, 230);
        lbl.outlineWidth = 3;
        // тень — глубина
        lbl.enableShadow = true;
        lbl.shadowColor = new Color(0, 0, 0, 160);
        lbl.shadowOffset = new Vec3(0, -3, 0) as any;
        lbl.shadowBlur = 2;

        n.setWorldPosition(worldPos);
        n.setScale(0.5, 0.5, 1);

        const op = n.addComponent(UIOpacity);
        op.opacity = 0;

        const start = n.worldPosition.clone();
        const drift = (Math.random() * 2 - 1) * 26;
        const end = new Vec3(start.x + drift, start.y + rise, start.z);

        // пружинистый «поп»: 0.5 → 1.18 → 1.0
        tween(n)
            .to(0.16, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();

        // всплытие по дуге
        tween(n)
            .to(life, { worldPosition: end }, { easing: 'quadOut' })
            .start();

        // проявление → пауза → затухание → уничтожение (гарантированный финал)
        tween(op)
            .to(0.14, { opacity: 255 })
            .delay(Math.max(0, life - 0.5))
            .to(0.32, { opacity: 0 })
            .call(() => { if (n.isValid) n.destroy(); })
            .start();
    }
}