import { _decorator, Component, AudioClip, AudioSource, director } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Простой менеджер звука.
 * Повесь на отдельный узел (например, Canvas или свой узел SoundManager).
 * Другие скрипты вызывают SoundManager.instance.playExplosion() и т.п.
 */
@ccclass('SoundManager')
export class SoundManager extends Component {

    public static instance: SoundManager = null;

    // ----- Клипы -----
    @property({ type: AudioClip, tooltip: 'Фоновая музыка (зациклена)' })
    bgm: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Звук взрыва' })
    explosion: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Звук взлёта самолёта' })
    jetTakeoff: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Звук повышения мощи армии (тик счётчика)' })
    powerTick: AudioClip = null;

    // ----- Громкость -----
    @property({ range: [0, 1], slide: true, tooltip: 'Громкость музыки' })
    bgmVolume: number = 0.5;

    @property({ range: [0, 1], slide: true, tooltip: 'Громкость эффектов' })
    sfxVolume: number = 1.0;

    // отдельный источник для музыки (чтобы эффекты её не перебивали)
    private _bgmSource: AudioSource = null;
    // источник для одноразовых эффектов
    private _sfxSource: AudioSource = null;

    onLoad() {
        SoundManager.instance = this;

        // два независимых AudioSource: один под музыку, второй под эффекты
        this._bgmSource = this.addComponent(AudioSource);
        this._sfxSource = this.addComponent(AudioSource);
    }

    start() {
        this.playBGM();
    }

    /** Запускает фоновую музыку в цикле */
    playBGM() {
        if (!this.bgm || !this._bgmSource) return;
        this._bgmSource.clip = this.bgm;
        this._bgmSource.loop = true;
        this._bgmSource.volume = this.bgmVolume;
        this._bgmSource.play();
    }

    stopBGM() {
        if (this._bgmSource) this._bgmSource.stop();
    }

    /** Одноразовый звук взрыва */
    playExplosion() {
        this.playSfx(this.explosion);
    }

    /** Звук взлёта самолёта */
    playJetTakeoff() {
        this.playSfx(this.jetTakeoff);
    }

    /** Звук повышения мощи армии */
    playPowerTick() {
        this.playSfx(this.powerTick);
    }

    /** Проигрывает разовый эффект поверх музыки */
    private playSfx(clip: AudioClip) {
        if (!clip || !this._sfxSource) return;
        // playOneShot позволяет накладывать эффекты друг на друга
        this._sfxSource.playOneShot(clip, this.sfxVolume);
    }
}