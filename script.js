class ProgrammerTimer {
    constructor() {
        this.timeLeft = 25 * 60; // 25分
        this.totalTime = 25 * 60;
        this.isRunning = false;
        this.interval = null;
        this.currentMode = 'pomodoro';
        this.sessionCount = 1;
        this.totalSessions = 4;
        this.completedSessions = 0;
        this.todayFocusTime = 0;
        
        this.modes = {
            pomodoro: { time: 25 * 60, color: '#4CAF50', text: '集中時間' },
            'short-break': { time: 5 * 60, color: '#2196F3', text: '短い休憩' },
            'long-break': { time: 15 * 60, color: '#9C27B0', text: '長い休憩' },
            custom: { time: 25 * 60, color: '#FF9800', text: 'カスタム' }
        };
        
        this.programmingTips = [
            "25分集中して、5分休憩。これを繰り返すことで効率的にコーディングできます。",
            "休憩時間には目を休ませ、軽いストレッチをしましょう。",
            "難しい問題は小さく分割して、一つずつ解決していきましょう。",
            "コードレビューは休憩時間に行うと、新鮮な視点で見直せます。",
            "デバッグは集中時間の最後に行い、休憩時間に解決策を考えましょう。",
            "定期的な休憩で集中力を維持し、バグを減らしましょう。",
            "コメントは休憩時間に書くと、より分かりやすくなります。",
            "テストコードは集中時間の途中で書くことで、品質が向上します。"
        ];
        
        this.initializeElements();
        this.bindEvents();
        this.loadStats();
        this.updateDisplay();
        this.updateTip();
    }

    initializeElements() {
        this.minutesDisplay = document.getElementById('minutes');
        this.secondsDisplay = document.getElementById('seconds');
        this.minuteInput = document.getElementById('minuteInput');
        this.secondInput = document.getElementById('secondInput');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.skipBtn = document.getElementById('skipBtn');
        this.progressCircle = document.getElementById('progress');
        this.sessionCountElement = document.getElementById('sessionCount');
        this.totalSessionsElement = document.getElementById('totalSessions');
        this.phaseTextElement = document.getElementById('phaseText');
        this.currentTipElement = document.getElementById('currentTip');
        this.todayFocusElement = document.getElementById('todayFocus');
        this.completedSessionsElement = document.getElementById('completedSessions');
        this.customTimeInput = document.getElementById('customTimeInput');
        
        this.modeButtons = document.querySelectorAll('.mode-btn');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.skipBtn.addEventListener('click', () => this.skip());
        
        this.minuteInput.addEventListener('input', () => this.updateCustomTime());
        this.secondInput.addEventListener('input', () => this.updateCustomTime());
        
        this.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        this.modeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            }
        });

        if (mode === 'custom') {
            this.customTimeInput.style.display = 'flex';
            this.timeLeft = parseInt(this.minuteInput.value) * 60 + parseInt(this.secondInput.value);
        } else {
            this.customTimeInput.style.display = 'none';
            this.timeLeft = this.modes[mode].time;
        }

        this.totalTime = this.timeLeft;
        this.updatePhaseText();
        this.updateProgressColor();
        this.updateDisplay();
        this.reset();
    }

    updateCustomTime() {
        if (this.currentMode === 'custom') {
            const minutes = parseInt(this.minuteInput.value) || 0;
            const seconds = parseInt(this.secondInput.value) || 0;
            this.timeLeft = minutes * 60 + seconds;
            this.totalTime = this.timeLeft;
            this.updateDisplay();
        }
    }

    updatePhaseText() {
        this.phaseTextElement.textContent = this.modes[this.currentMode].text;
    }

    updateProgressColor() {
        this.progressCircle.style.stroke = this.modes[this.currentMode].color;
    }

    start() {
        if (this.timeLeft <= 0) return;

        this.isRunning = true;
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.skipBtn.disabled = false;
        this.minuteInput.disabled = true;
        this.secondInput.disabled = true;

        this.interval = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            
            if (this.timeLeft <= 0) {
                this.completeSession();
            }
        }, 1000);
    }

    pause() {
        this.isRunning = false;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.skipBtn.disabled = true;
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
        this.skipBtn.disabled = true;
        this.minuteInput.disabled = false;
        this.secondInput.disabled = false;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    reset() {
        this.stop();
        if (this.currentMode === 'custom') {
            this.timeLeft = parseInt(this.minuteInput.value) * 60 + parseInt(this.secondInput.value);
        } else {
            this.timeLeft = this.modes[this.currentMode].time;
        }
        this.totalTime = this.timeLeft;
        this.updateDisplay();
    }

    skip() {
        this.completeSession();
    }

    completeSession() {
        this.stop();
        this.showNotification();
        
        if (this.currentMode === 'pomodoro') {
            this.completedSessions++;
            this.todayFocusTime += this.modes.pomodoro.time;
            this.saveStats();
            this.updateStats();
            
            if (this.completedSessions % 4 === 0) {
                this.setMode('long-break');
            } else {
                this.setMode('short-break');
            }
        } else {
            this.setMode('pomodoro');
            this.sessionCount++;
        }
        
        this.updateTip();
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

    updateStats() {
        this.sessionCountElement.textContent = this.sessionCount;
        this.totalSessionsElement.textContent = this.totalSessions;
        this.completedSessionsElement.textContent = this.completedSessions;
        this.todayFocusElement.textContent = Math.floor(this.todayFocusTime / 60) + '分';
    }

    updateTip() {
        const randomIndex = Math.floor(Math.random() * this.programmingTips.length);
        this.currentTipElement.textContent = this.programmingTips[randomIndex];
    }

    saveStats() {
        const today = new Date().toDateString();
        const stats = {
            date: today,
            focusTime: this.todayFocusTime,
            completedSessions: this.completedSessions
        };
        localStorage.setItem('programmerTimerStats', JSON.stringify(stats));
    }

    loadStats() {
        const savedStats = localStorage.getItem('programmerTimerStats');
        if (savedStats) {
            const stats = JSON.parse(savedStats);
            const today = new Date().toDateString();
            
            if (stats.date === today) {
                this.todayFocusTime = stats.focusTime;
                this.completedSessions = stats.completedSessions;
            }
        }
        this.updateStats();
    }

    showNotification() {
        const mode = this.modes[this.currentMode];
        const message = this.currentMode === 'pomodoro' 
            ? '集中時間が終了しました！休憩を取りましょう。'
            : '休憩時間が終了しました！次のセッションを開始しましょう。';

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('プログラマータイマー', {
                body: message,
                icon: '/favicon.ico'
            });
        }
        
        this.playSound();
    }

    playSound() {
        try {
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
        } catch (error) {
            console.log('音声再生に失敗しました:', error);
        }
    }
}

// ページ読み込み時にタイマーを初期化
document.addEventListener('DOMContentLoaded', () => {
    new ProgrammerTimer();
    
    // 通知の許可を求める
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});