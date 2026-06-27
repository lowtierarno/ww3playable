import { _decorator, Component, Node, EventTouch, Vec3, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UnitController')
export class UnitController extends Component {

    @property(Node)
    targetRedCountry: Node = null;

    @property(Node)
    targetBlueCountry: Node = null;

    @property({ type: [Node] })
    spawnedUnits: Node[] = [];

    private startPos: Vec3 = new Vec3();
    private isBusy: boolean = false; 

    start() {
        this.startPos = this.node.position.clone();

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onTouchStart(event: EventTouch) {
        if (this.isBusy) return;
    }

    onTouchMove(event: EventTouch) {
        if (this.isBusy) return;
        
        const delta = event.getUIDelta();
        const pos = this.node.position;
        this.node.setPosition(pos.x + delta.x, pos.y + delta.y, pos.z);
    }

    onTouchEnd(event: EventTouch) {
        if (this.isBusy) return;

        const distance = Vec3.distance(this.node.worldPosition, this.targetRedCountry.worldPosition);

        if (distance < 150) { 
            this.startCapture();
        } else {
            this.isBusy = true;
            tween(this.node)
                .to(0.3, { position: this.startPos })
                .call(() => { this.isBusy = false; })
                .start();
        }
    }

    startCapture() {
        this.isBusy = true;

        this.node.setPosition(this.startPos);
        const targetPos = this.targetRedCountry.worldPosition;

        tween(this.node)
            .to(1.5, { worldPosition: targetPos }) 
            .call(() => {
                this.scheduleOnce(() => {
                    
                    // Меняем цвет страны
                    if (this.targetRedCountry && this.targetBlueCountry) {
                        this.targetRedCountry.active = false;
                        this.targetBlueCountry.active = true;
                    }

                    // Анимируем появление новых юнитов
                    for (let i = 0; i < this.spawnedUnits.length; i++) {
                        const unit = this.spawnedUnits[i];
                        if (unit) {
                            // Запоминаем нормальный масштаб из редактора
                            const originalScale = unit.scale.clone();
                            
                            // Сжимаем юнит до размера 0
                            unit.setScale(new Vec3(0, 0, 0));
                            
                            // Включаем отображение (пока он нулевого размера)
                            unit.active = true;

                            // Плавно увеличиваем до оригинального размера с эффектом "пружинки"
                            // 0.4 - это длительность анимации появления (в секундах)
                            tween(unit)
                                .to(0.4, { scale: originalScale }, { easing: 'backOut' })
                                .start();
                        }
                    }

                }, 2.0); 
            })
            .start();
    }
}