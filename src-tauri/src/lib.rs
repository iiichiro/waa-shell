use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// Rust側からフロントエンドへの挨拶を返すテスト用コマンド
#[tauri::command]
fn greet(name: &str) -> String {
    format!("こんにちは、{}! Rust側から挨拶が届きました！", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // プラグインの初期化
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // アプリケーションのセットアップ
        .setup(|app| {
            // トレイメニューの作成
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_hide_i =
                MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            let toggle_launcher_i = MenuItem::with_id(
                app,
                "toggle_launcher",
                "Toggle Launcher",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&toggle_launcher_i, &show_hide_i, &quit_i])?;

            // トレイアイコンの作成
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show_hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "toggle_launcher" => {
                        if let Some(window) = app.get_webview_window("launcher") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            // ランチャー起動用のグローバルショートカット (Ctrl+Alt+A) の登録
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyA);
            let handle = app.handle().clone();

            // ショートカット押下時のイベントハンドラ
            if let Err(e) =
                app.global_shortcut()
                    .on_shortcut(shortcut, move |_app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            if let Some(window) = handle.get_webview_window("launcher") {
                                // 表示状態に応じてトグル（表示 <-> 非表示）
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
            {
                eprintln!("グローバルショートカットの登録に失敗しました: {}", e);
                // エラーが発生してもアプリは続行する
            }

            Ok(())
        })
        // ウインドウイベントのハンドリング（閉じるボタンで非表示にする）
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // "launcher" は隠すだけ（既存動作）、"main" も隠すだけに変更
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        // フロントエンドから呼び出し可能なコマンドの登録
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("tauri アプリケーションの実行中にエラーが発生しました");
}
