import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Node) mapLayer: Node = null;         // Твой слой MapLayer
    @property(Node) gameplayLayer: Node = null;    // Твой GameplayLayer с танком
    @property([Node]) countryButtons: Node[] = []; // Массив из 4 стран

    // Стартовые элементы, которые можно просто скрыть (руки/стрелочки), не меняя их текст
    @property([Node]) startTutorialElements: Node[] = []; 

    start() {
        // На старте геймплейный слой (танк, стрелка атаки) скрыт
        if (this.gameplayLayer) {
            this.gameplayLayer.active = false;
        }

        // Вешаем клики на страны
        this.countryButtons.forEach(btn => {
            btn.on(Node.EventType.TOUCH_END, () => this.onCountrySelected(btn), this);
        });
    }

    private onCountrySelected(selectedCountry: Node) {
        console.log("Выбрана страна: " + selectedCountry.name);

        // Блокируем повторные нажатия на страны
        this.countryButtons.forEach(btn => btn.off(Node.EventType.TOUCH_END));

        // Просто выключаем стартовые стрелочки/руки, чтобы они не мешали геймплею
        this.startTutorialElements.forEach(elem => {
            if (elem) elem.active = false;
        });

        // Запускаем только увеличение и центрирование карты
        this.zoomWorldToCountry(selectedCountry);
    }

    private zoomWorldToCountry(targetNode: Node) {
        if (!this.mapLayer) return;

        // Получаем координаты выбранной страны
        const targetPos = targetNode.getPosition();
        
        // Коэффициент увеличения карты (поставь 1.4 или 1.5, если нужно чуть ближе/дальше)
        const targetScale = 1.5;

        // Вычисляем позицию так, чтобы выбранная страна оказалась ровно по центру экрана
        const targetX = -targetPos.x * targetScale;
        const targetY = -targetPos.y * targetScale;

        // Плавно увеличиваем саму карту
        tween(this.mapLayer)
            .to(0.8, { 
                scale: new Vec3(targetScale, targetScale, 1),
                position: new Vec3(targetX, targetY, 0)
            }, { easing: 'quadInOut' })
            .call(() => {
                this.onZoomComplete();
            })
            .start();
    }

    private onZoomComplete() {
        if (this.gameplayLayer) {
            // Включаем слой с танком
            this.gameplayLayer.active = true;
            
            // Синхронизируем геймплейный слой с новым масштабом и позицией карты
            this.gameplayLayer.setPosition(this.mapLayer.getPosition());
            this.gameplayLayer.setScale(this.mapLayer.getScale());
        }
    }
}