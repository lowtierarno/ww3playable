import { _decorator, Component, view, ResolutionPolicy, screen } from 'cc';
const { ccclass } = _decorator;

@ccclass('ScreenAdapter')
export class ScreenAdapter extends Component {

    onLoad() {
        // Первичная настройка при загрузке
        this.adaptScreen();

        // Подписываемся на изменение размера окна современным методом
        screen.on('window-resize', this.adaptScreen, this);
    }

    onDestroy() {
        // Не забываем отписываться от событий при удалении компонента, чтобы избежать утечек памяти
        screen.off('window-resize', this.adaptScreen, this);
    }

    adaptScreen() {
        // Используем актуальный API для получения размера окна
        const windowSize = screen.windowSize;
        // Получаем базовое разрешение из настроек проекта
        const designSize = view.getDesignResolutionSize();

        const frameRatio = windowSize.width / windowSize.height;
        const designRatio = designSize.width / designSize.height;

        // Определяем стратегию адаптации
        if (frameRatio <= designRatio) {
            // Устройство более "квадратное" или узкое
            view.setDesignResolutionSize(designSize.width, designSize.height, ResolutionPolicy.FIXED_WIDTH);
        } else {
            // Устройство более вытянутое (широкоформатное)
            view.setDesignResolutionSize(designSize.width, designSize.height, ResolutionPolicy.FIXED_HEIGHT);
        }
    }
}