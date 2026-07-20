import { _decorator, Component, Node, Graphics, UITransform, Color, Vec3, view } from 'cc';
import { Zone } from './Zone';
import { Owner } from './GameConfig';
const { ccclass, property } = _decorator;

/**
 * «Горящий фронт» (GDD §3 «fiery frontline» / §7 «burning-frontline flicker»).
 *
 * Там, где ВАША земля граничит с ВРАЖЬЕЙ, горит оранжевая линия: три слоя
 * (широкое свечение + тело + яркое ядро) с неровным мерцанием — у каждого
 * сегмента своя фаза, поэтому весь фронт «дышит» органично, как пламя.
 *
 * АВТОНОМЕН — ничего не требует от GameManager. Повесь на пустой узел поверх
 * карты; компонент сам найдёт зоны, использует граф соседей и перерисует
 * фронт при каждом захвате.
 */
@ccclass('FrontlineGlow')
export class FrontlineGlow extends Component {

    @property({ type: Node, tooltip: 'Родитель зон. Пусто → ищем зоны по всей сцене' })
    zonesRoot: Node = null;

    @property({ type: Color, tooltip: 'Цвет пламени фронта' })
    color: Color = new Color(255, 120, 20, 255);

    @property({ tooltip: 'Базовая толщина ядра линии, px' })
    lineWidth: number = 8;

    @property({ tooltip: 'Скорость мерцания' })
    flickerSpeed: number = 7.0;

    @property({ tooltip: 'Как часто пересканировать владельцев зон, сек' })
    rescanEvery: number = 0.35;

    @property({ tooltip: 'Максимальная длина штриха фронта на ребре, px' })
    maxStroke: number = 120;

    private _g: Graphics = null;
    private _zones: Zone[] = [];
    private _segs: { p1: Vec3, p2: Vec3, ph: number }[] = [];
    private _t = 0;
    private _scan = 0;

    onLoad() {
        this._g = this.getComponent(Graphics) || this.addComponent(Graphics);
        const ui = this.getComponent(UITransform) || this.addComponent(UITransform);
        const v = view.getVisibleSize();
        if (ui.contentSize.width < v.width || ui.contentSize.height < v.height) {
            ui.setContentSize(v.width, v.height);
        }
    }

    start() {
        this.collect();
        this.rebuild();
    }

    private collect() {
        const root = this.zonesRoot || this.node.scene;
        this._zones = root ? root.getComponentsInChildren(Zone) : [];
    }

    /** Пересобрать сегменты фронта You↔Enemy (в ЛОКАЛЬНЫХ координатах узла) */
    private rebuild() {
        this._segs.length = 0;
        const ui = this.getComponent(UITransform);
        if (!ui) return;

        const seen = new Set<string>();
        for (const z of this._zones) {
            if (!z || !z.node.isValid || z.owner !== Owner.You) continue;
            for (const nb of z.neighbors) {
                if (!nb || nb.owner !== Owner.Enemy) continue;

                const a = z.node.uuid, b = nb.node.uuid;
                const key = a < b ? a + '|' + b : b + '|' + a;
                if (seen.has(key)) continue;
                seen.add(key);

                const aW = z.node.worldPosition;
                const bW = nb.node.worldPosition;
                const mx = (aW.x + bW.x) / 2, my = (aW.y + bW.y) / 2;
                const dx = bW.x - aW.x, dy = bW.y - aW.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len, ny = dx / len;
                const half = Math.min(len * 0.35, this.maxStroke);

                const p1 = ui.convertToNodeSpaceAR(new Vec3(mx + nx * half, my + ny * half, 0));
                const p2 = ui.convertToNodeSpaceAR(new Vec3(mx - nx * half, my - ny * half, 0));
                this._segs.push({ p1, p2, ph: Math.random() * Math.PI * 2 });
            }
        }
    }

    update(dt: number) {
        this._t += dt;
        this._scan += dt;
        if (this._scan >= this.rescanEvery) {
            this._scan = 0;
            this.rebuild();
        }
        this.draw();
    }

    private draw() {
        const g = this._g;
        g.clear();
        if (this._segs.length === 0) return;

        const c = this.color;
        // три слоя: свечение → тело → ядро. Для каждого — свой проход,
        // мерцание считаем на сегмент (у каждого своя фаза ph).
        const layers = [
            { mul: 3.4, aBase: 40, aAmp: 30 },   // широкое свечение
            { mul: 1.8, aBase: 110, aAmp: 60 },  // тело
            { mul: 1.0, aBase: 200, aAmp: 55 },  // яркое ядро
        ];

        for (const L of layers) {
            for (const s of this._segs) {
                const fl = 0.5 + 0.5 * Math.sin(this._t * this.flickerSpeed + s.ph);
                const a = Math.min(255, Math.round(L.aBase + L.aAmp * fl));
                g.lineWidth = this.lineWidth * L.mul * (0.85 + 0.3 * fl);
                g.strokeColor = new Color(c.r, c.g, c.b, a);
                g.moveTo(s.p1.x, s.p1.y);
                g.lineTo(s.p2.x, s.p2.y);
                g.stroke();
            }
        }
    }
}