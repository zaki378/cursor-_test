package com.example.voiceime

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionsActivity: Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32,32,32,32) }
    val info = TextView(this).apply { text = "音声入力のためにマイク権限が必要です。また、キーボードの有効化と切替を行ってください。" }
    val btnPerm = Button(this).apply { text = "マイク権限を許可" }
    val btnEnable = Button(this).apply { text = "キーボードを有効化" }
    val btnSwitch = Button(this).apply { text = "キーボードを切替" }

    btnPerm.setOnClickListener {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 100)
      }
    }
    btnEnable.setOnClickListener { startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)) }
    btnSwitch.setOnClickListener { getSystemService(android.view.inputmethod.InputMethodManager::class.java).showInputMethodPicker() }

    root.addView(info); root.addView(btnPerm); root.addView(btnEnable); root.addView(btnSwitch)
    setContentView(root)
  }
}