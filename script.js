class Timer {
    constructor() {
        this.timeLeft = 0;
        this.totalTime = 0;
        this.isRunning = false;
        this.interval = null;
        
        this.initializeElements();
        this.bindEvents();
        this.updateDisplay();
    }

    initializeElements() {
        this.minutesDisplay = document.getElementById('minutes');
        this.secondsDisplay = document.getElementById('seconds');
        this.minuteInput = document.getElementById('minuteInput');
        this.secondInput = document.getElementById('secondInput');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.progressCircle = document.getElementById('progress');
        
        this.presetButtons = document.querySelectorAll('.preset-btn');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.resetBtn.addEventListener('click', () => this.reset());
        
        this.minuteInput.addEventListener('input', () => this.updateTimeFromInput());
        this.secondInput.addEventListener('input', () => this.updateTimeFromInput());
        
        this.presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const minutes = parseInt(btn.dataset.minutes);
                this.setTime(minutes * 60);
            });
        });
    }

    updateTimeFromInput() {
        const minutes = parseInt(this.minuteInput.value) || 0;
        const seconds = parseInt(this.secondInput.value) || 0;
        this.timeLeft = minutes * 60 + seconds;
        this.totalTime = this.timeLeft;
        this.updateDisplay();
    }

    setTime(seconds) {
        this.timeLeft = seconds;
        this.totalTime = seconds;
        this.minuteInput.value = Math.floor(seconds / 60);
        this.secondInput.value = seconds % 60;
        this.updateDisplay();
    }

    start() {
        if (this.timeLeft <= 0) {
            const minutes = parseInt(this.minuteInput.value) || 0;
            const seconds = parseInt(this.secondInput.value) || 0;
            this.timeLeft = minutes * 60 + seconds;
            this.totalTime = this.timeLeft;
        }

        if (this.timeLeft <= 0) return;

        this.isRunning = true;
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.minuteInput.disabled = true;
        this.secondInput.disabled = true;

        this.interval = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            
            if (this.timeLeft <= 0) {
                this.stop();
                this.showNotification();
            }
        }, 1000);
    }

    pause() {
        this.isRunning = false;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.minuteInput.disabled = false;
        this.secondInput.disabled = false;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    stop() {
        this.isRunning = false;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.minuteInput.disabled = false;
        this.secondInput.disabled = false;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    reset() {
        this.stop();
        this.timeLeft = 0;
        this.totalTime = 0;
        this.minuteInput.value = '';
        this.secondInput.value = '';
        this.updateDisplay();
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        
        this.minutesDisplay.textContent = minutes.toString().padStart(2, '0');
        this.secondsDisplay.textContent = seconds.toString().padStart(2, '0');
        
        this.updateProgressRing();
    }

    updateProgressRing() {
        if (this.totalTime <= 0) {
            this.progressCircle.style.strokeDashoffset = '565.48';
            return;
        }
        
        const progress = this.timeLeft / this.totalTime;
        const circumference = 2 * Math.PI * 90; // r = 90
        const offset = circumference - (progress * circumference);
        this.progressCircle.style.strokeDashoffset = offset;
    }

    showNotification() {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('タイマー完了', {
                body: '設定した時間が経過しました！',
                icon: '/favicon.ico'
            });
        }
        
        // ブラウザ通知が許可されていない場合の代替手段
        this.playSound();
    }

    playSound() {
        // 簡単な音を鳴らす（オプション）
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

// ページ読み込み時にタイマーを初期化
document.addEventListener('DOMContentLoaded', () => {
    new Timer();
    
    // 通知の許可を求める
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});