package com.example.voiceime

import android.inputmethodservice.InputMethodService
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.TextView

class VoiceKeyboardService : InputMethodService() {
  private lateinit var speech: SpeechController
  private lateinit var preview: TextView
  private lateinit var btnMic: Button

  override fun onCreateInputView(): View {
    val v = layoutInflater.inflate(R.layout.keyboard_view, null)
    preview = v.findViewById(R.id.preview)
    btnMic = v.findViewById(R.id.btnMic)

    speech = SpeechController(
      context = this,
      onPartial = { text -> preview.text = text },
      onFinal = { text ->
        preview.text = text
        currentInputConnection?.commitText(text, 1)
      },
      onError = { msg -> preview.text = "エラー: $msg" }
    )

    btnMic.setOnTouchListener { _, ev ->
      when (ev.action) {
        MotionEvent.ACTION_DOWN -> speech.start()
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> speech.stop()
      }
      true
    }

    return v
  }

  override fun onDestroy() {
    super.onDestroy()
    if (this::speech.isInitialized) speech.destroy()
  }
}