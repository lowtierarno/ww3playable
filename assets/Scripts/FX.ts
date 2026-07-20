import { _decorator, Component, Node, Graphics, UIOpacity, Color, Vec3, tween } from 'cc';
const { ccclass } = _decorator;

/**
 * Fx — процедурные эффекты (без ассетов, всё рисуется через Graphics).
 *
 * Многослойные взрывы, ударные волны, искры, вспышки захвата. Каждый эффект —
 * временный узел, который сам себя уничтожает. Никаких префабов, безопасно
 * звать откуда угодно:
 *
 *   Fx.explosion(this.node, worldPos, 46);   // боевой взрыв (тёплый)
 *   Fx.capture(this.node, worldPos);          // синяя волна захвата
 *   Fx.shockwave(this.node, worldPos, color); // одиночное кольцо
 *
 * parent должен быть НЕ масштабированным слоем (обычно Canvas), иначе
 * радиусы «уедут» вместе с картой.
 */
@ccclass('Fx')
export class Fx extends Component {

    // ---------- низкоуровневый спавн ----------
    private static spawn(parent: Node, worldPos: Vec3): { node: Node, g: Graphics, op: UIOpacity } {
        const node = new Node('Fx');
        parent.addChild(node);
        node.setWorldPosition(worldPos);
        const g = node.addComponent(Graphics);
        const op = node.addComponent(UIOpacity);
        return { node, g, op };
    }

    private static kill(node: Node) {
        if (node && node.isValid) node.destroy();
    }

    // ---------- боевой взрыв (тёплый, многослойный) ----------
    static explosion(parent: Node, worldPos: Vec3, radius = 46) {
        if (!parent || !parent.isValid) return;

        // 1) тёплая ударная волна
        Fx.shockwave(parent, worldPos, new Color(255, 185, 90, 255), radius * 3.0, 0.5, 6);

        // 2) огненный шар (оранжевое тело + светлое ядро)
        const fb = Fx.spawn(parent, worldPos);
        fb.g.fillColor = new Color(255, 140, 40, 255);
        fb.g.circle(0, 0, radius); fb.g.fill();
        fb.g.fillColor = new Color(255, 232, 155, 255);
        fb.g.circle(0, 0, radius * 0.55); fb.g.fill();
        fb.node.setScale(0.25, 0.25, 1);
        tween(fb.node)
            .to(0.14, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.2, { scale: new Vec3(0.85, 0.85, 1) })
            .start();
        tween(fb.op).delay(0.09).to(0.32, { opacity: 0 }).call(() => Fx.kill(fb.node)).start();

        // 3) яркая вспышка-ядро (быстрая)
        const fl = Fx.spawn(parent, worldPos);
        fl.g.fillColor = new Color(255, 255, 242, 255);
        fl.g.circle(0, 0, radius * 0.7); fl.g.fill();
        fl.node.setScale(0.3, 0.3, 1);
        tween(fl.node).to(0.09, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' }).start();
        tween(fl.op).to(0.16, { opacity: 0 }).call(() => Fx.kill(fl.node)).start();

        // 4) искры
        Fx.sparks(parent, worldPos, 8, new Color(255, 214, 130, 255), radius * 2.4, 0.5);

        // 5) лёгкий дым
        Fx.smoke(parent, worldPos, radius * 0.9);
    }

    // ---------- синяя вспышка захвата зоны ----------
    static capture(parent: Node, worldPos: Vec3) {
        if (!parent || !parent.isValid) return;
        Fx.shockwave(parent, worldPos, new Color(90, 160, 255, 255), 175, 0.6, 7);
        Fx.shockwave(parent, worldPos, new Color(165, 205, 255, 255), 110, 0.45, 5);
        Fx.sparks(parent, worldPos, 10, new Color(160, 210, 255, 255), 135, 0.6);

        // мягкая заливка-вспышка
        const fl = Fx.spawn(parent, worldPos);
        fl.g.fillColor = new Color(120, 180, 255, 170);
        fl.g.circle(0, 0, 70); fl.g.fill();
        fl.node.setScale(0.4, 0.4, 1);
        tween(fl.node).to(0.35, { scale: new Vec3(1.6, 1.6, 1) }, { easing: 'quadOut' }).start();
        tween(fl.op).to(0.4, { opacity: 0 }).call(() => Fx.kill(fl.node)).start();
    }

    // ---------- одиночное расширяющееся кольцо ----------
    static shockwave(parent: Node, worldPos: Vec3, color: Color, maxR = 140, life = 0.45, width = 6) {
        if (!parent || !parent.isValid) return;
        const { node, g } = Fx.spawn(parent, worldPos);
        const data = { k: 0 };
        tween(data)
            .to(life, { k: 1 }, {
                easing: 'quadOut',
                onUpdate: () => {
                    if (!node.isValid) return;
                    g.clear();
                    const r = Math.max(1, maxR * data.k);
                    const a = Math.round(210 * (1 - data.k));
                    g.lineWidth = width * (1 - 0.6 * data.k);
                    g.strokeColor = new Color(color.r, color.g, color.b, a);
                    g.circle(0, 0, r); g.stroke();
                },
            })
            .call(() => Fx.kill(node))
            .start();
    }

    // ---------- искры (один узел, перерисовка по прогрессу) ----------
    static sparks(parent: Node, worldPos: Vec3, count = 8, color: Color = new Color(255, 220, 140, 255), spread = 90, life = 0.5) {
        if (!parent || !parent.isValid) return;
        const { node, g } = Fx.spawn(parent, worldPos);

        const dirs: { a: number, d: number, s: number }[] = [];
        for (let i = 0; i < count; i++) {
            dirs.push({
                a: Math.random() * Math.PI * 2,
                d: spread * (0.5 + Math.random() * 0.6),
                s: 2 + Math.random() * 2.5,
            });
        }

        const data = { k: 0 };
        tween(data)
            .to(life, { k: 1 }, {
                onUpdate: () => {
                    if (!node.isValid) return;
                    g.clear();
                    const ease = 1 - (1 - data.k) * (1 - data.k); // quadOut
                    const alpha = Math.round(255 * (1 - data.k));
                    g.fillColor = new Color(color.r, color.g, color.b, alpha);
                    for (const dr of dirs) {
                        const dist = dr.d * ease;
                        const x = Math.cos(dr.a) * dist;
                        const y = Math.sin(dr.a) * dist;
                        g.circle(x, y, dr.s * (1 - 0.5 * data.k));
                    }
                    g.fill();
                },
            })
            .call(() => Fx.kill(node))
            .start();
    }

    // ---------- лёгкий дым (серый, всплывает и тает) ----------
    static smoke(parent: Node, worldPos: Vec3, radius = 40) {
        if (!parent || !parent.isValid) return;
        const puffs = 3;
        for (let i = 0; i < puffs; i++) {
            const { node, g, op } = Fx.spawn(parent, worldPos);
            const gray = 90 + Math.floor(Math.random() * 40);
            g.fillColor = new Color(gray, gray, gray, 120);
            g.circle(0, 0, radius * (0.6 + Math.random() * 0.4)); g.fill();

            const ox = (Math.random() * 2 - 1) * radius * 0.5;
            const start = node.worldPosition.clone();
            node.setScale(0.4, 0.4, 1);
            op.opacity = 100;
            tween(node)
                .delay(i * 0.05)
                .to(0.7, {
                    worldPosition: new Vec3(start.x + ox, start.y + radius * 1.1, start.z),
                    scale: new Vec3(1.3, 1.3, 1),
                }, { easing: 'quadOut' })
                .start();
            tween(op).delay(i * 0.05 + 0.15).to(0.6, { opacity: 0 }).call(() => Fx.kill(node)).start();
        }
    }
}