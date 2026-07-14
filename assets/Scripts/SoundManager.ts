import { _decorator, Component, AudioClip, AudioSource } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Простой менеджер звука.
 * Повесь на отдельный узел. Другие скрипты зовут SoundManager.instance.playX().
 */
@ccclass('SoundManager')
export class SoundManager extends Component {

    public static instance: SoundManager = null;

    // ----- Клипы -----
    @property({ type: AudioClip, tooltip: 'Фоновая музыка (зациклена)' })
    bgm: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Звук взрыва' })
    explosion: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Звук взлёта самолёта (✈️)' })
    jetTakeoff: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Пуск ракеты (🚀)' })
    missileLaunch: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Залп/подход корабля (⚓)' })
    navy: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Захват зоны (перекраска в синий)' })
    capture: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Начало хода врага (🔴 CHINA moves)' })
    rivalTurn: AudioClip = null;

    @property({ type: AudioClip, tooltip: 'Тик счётчика армии' })
    powerTick: AudioClip = null;

    // ----- Громкость -----
    @property({ range: [0, 1], slide: true, tooltip: 'Громкость музыки' })
    bgmVolume: number = 0.5;

    @property({ range: [0, 1], slide: true, tooltip: 'Громкость эффектов' })
    sfxVolume: number = 1.0;

    private _bgmSource: AudioSource = null;
    private _sfxSource: AudioSource = null;

    onLoad() {
        SoundManager.instance = this;
        this._bgmSource = this.addComponent(AudioSource);
        this._sfxSource = this.addComponent(AudioSource);
    }

    start() {
        this.playBGM();
    }

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

    playExplosion() { this.playSfx(this.explosion); }
    playJetTakeoff() { this.playSfx(this.jetTakeoff); }
    playMissile() { this.playSfx(this.missileLaunch); }
    playNavy() { this.playSfx(this.navy); }
    playCapture() { this.playSfx(this.capture); }
    playRivalTurn() { this.playSfx(this.rivalTurn); }
    playPowerTick() { this.playSfx(this.powerTick); }

    private playSfx(clip: AudioClip) {
        if (!clip || !this._sfxSource) return;
        this._sfxSource.playOneShot(clip, this.sfxVolume);
    }
}