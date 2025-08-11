package com.example.voiceime

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class SpeechController(
  context: Context,
  private val onPartial: (String) -> Unit,
  private val onFinal: (String) -> Unit,
  private val onError: (String) -> Unit,
) {
  private val recognizer: SpeechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
  private val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP")
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
  }

  init {
    recognizer.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) { }
      override fun onBeginningOfSpeech() { }
      override fun onRmsChanged(rmsdB: Float) { }
      override fun onBufferReceived(buffer: ByteArray?) { }
      override fun onEndOfSpeech() { }
      override fun onError(error: Int) { onError("$error") }
      override fun onResults(results: Bundle) {
        val list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = list?.firstOrNull().orEmpty()
        onFinal(text)
      }
      override fun onPartialResults(partialResults: Bundle) {
        val list = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = list?.firstOrNull().orEmpty()
        if (text.isNotEmpty()) onPartial(text)
      }
      override fun onEvent(eventType: Int, params: Bundle?) { }
    })
  }

  fun start() { recognizer.startListening(intent) }
  fun stop() { recognizer.stopListening() }
  fun destroy() { recognizer.destroy() }
}