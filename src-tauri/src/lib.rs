//! SysRadio desktop shell: window, tray, autostart and the commands the web frontend calls.
//! Playback itself happens in the web view (`<audio>`), fed by the local stream proxy.

mod mixer;

use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use streamproxy::directory::{Directory, Search, Station};
use streamproxy::proxy::{self, ProxyInfo, TitleEvent};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_window_state::StateFlags;

const USER_AGENT: &str = concat!("SysRadio/", env!("CARGO_PKG_VERSION"));
const TRAY_ID: &str = "main";
/// Passed by the autostart entry: start in the tray without showing the window.
const MINIMIZED_ARG: &str = "--minimized";
/// Windows limits tray tooltips to 127 characters.
const TOOLTIP_MAX: usize = 120;

struct AppState {
    directory: Directory,
    proxy: ProxyInfo,
    close_to_tray: AtomicBool,
}

#[tauri::command]
fn proxy_info(state: State<'_, Arc<AppState>>) -> ProxyInfo {
    state.proxy.clone()
}

#[tauri::command]
async fn search_stations(
    state: State<'_, Arc<AppState>>,
    search: Search,
) -> Result<Vec<Station>, String> {
    state
        .directory
        .search(&search)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stations_by_id(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<Vec<Station>, String> {
    state
        .directory
        .by_ids(&ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn count_click(state: State<'_, Arc<AppState>>, id: String) {
    let state = state.inner().clone();
    tauri::async_runtime::spawn(async move { state.directory.click(&id).await });
}

/// Playback started: give our WebView2 audio session the app's name and icon (Windows mixer).
#[tauri::command]
fn audio_started() {
    mixer::brand_audio_sessions();
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, Arc<AppState>>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

/// Tray texts come from the frontend, which owns the translations.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayState {
    tooltip: String,
    playing: bool,
    favorites: Vec<TrayFavorite>,
    labels: TrayLabels,
}

#[derive(Debug, Deserialize)]
struct TrayFavorite {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct TrayLabels {
    play: String,
    stop: String,
    favorites: String,
    show: String,
    quit: String,
}

#[tauri::command]
fn update_tray(app: AppHandle, tray: TrayState) -> Result<(), String> {
    let Some(icon) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = tray_menu(&app, &tray).map_err(|e| e.to_string())?;
    icon.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let tooltip: String = tray.tooltip.chars().take(TOOLTIP_MAX).collect();
    icon.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    Ok(())
}

fn tray_menu(app: &AppHandle, tray: &TrayState) -> tauri::Result<Menu<tauri::Wry>> {
    let toggle_label = if tray.playing {
        &tray.labels.stop
    } else {
        &tray.labels.play
    };
    let toggle = MenuItem::with_id(app, "toggle", toggle_label, true, None::<&str>)?;
    let favorites = Submenu::with_id(
        app,
        "favorites",
        &tray.labels.favorites,
        !tray.favorites.is_empty(),
    )?;
    for fav in tray.favorites.iter().take(30) {
        favorites.append(&MenuItem::with_id(
            app,
            format!("fav:{}", fav.id),
            &fav.name,
            true,
            None::<&str>,
        )?)?;
    }
    let show = MenuItem::with_id(app, "show", &tray.labels.show, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", &tray.labels.quit, true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    Menu::with_items(app, &[&toggle, &sep()?, &favorites, &sep()?, &show, &quit])
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window(app);
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let initial = TrayState {
        tooltip: "SysRadio".into(),
        playing: false,
        favorites: Vec::new(),
        labels: TrayLabels {
            play: "Play".into(),
            stop: "Stop".into(),
            favorites: "Favourites".into(),
            show: "Show window".into(),
            quit: "Quit".into(),
        },
    };
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("SysRadio")
        .menu(&tray_menu(app, &initial)?)
        // Windows convention: left click opens the window, right click the menu.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                let _ = app.emit("tray-action", serde_json::json!({ "action": "toggle" }));
            }
            "show" => show_window(app),
            "quit" => app.exit(0),
            id => {
                if let Some(station) = id.strip_prefix("fav:") {
                    let _ = app.emit(
                        "tray-action",
                        serde_json::json!({ "action": "play", "id": station }),
                    );
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if !cfg!(target_os = "macos") {
                    toggle_window(tray.app_handle());
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    streamproxy::init_tls();
    let started_hidden = std::env::args().any(|a| a == MINIMIZED_ARG);
    tauri::Builder::default()
        // Must come first: a second start only brings the running window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app)
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Visibility is ours to decide (tray start), size and position are restored.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .setup(move |app| {
            let handle = app.handle().clone();
            let sink: proxy::TitleSink = Arc::new(move |event: TitleEvent| {
                let _ = handle.emit("now-playing", event);
            });
            let proxy = tauri::async_runtime::block_on(proxy::start(USER_AGENT, sink))?;
            app.manage(Arc::new(AppState {
                directory: Directory::new(USER_AGENT),
                proxy,
                close_to_tray: AtomicBool::new(true),
            }));
            build_tray(app.handle())?;
            if !started_hidden {
                show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Arc<AppState>>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            proxy_info,
            search_stations,
            stations_by_id,
            count_click,
            audio_started,
            set_close_to_tray,
            update_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running SysRadio");
}
