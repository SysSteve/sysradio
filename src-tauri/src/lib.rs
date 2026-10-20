//! SysRadio desktop shell: windows, tray, autostart and the commands the web frontend calls.
//! Playback itself happens in the main web view (`<audio>`), fed by the local stream proxy.
//! The floating player is a second, small window ("mini") that remote-controls the main one;
//! in mini mode the main window stays hidden (but alive, it plays the audio).

mod mixer;

use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use streamproxy::directory::{Directory, Facet, Search, Station};
use streamproxy::proxy::{self, ProxyInfo, TitleEvent};
use streamproxy::resolve::{Resolved, Resolver};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

const USER_AGENT: &str = concat!("SysRadio/", env!("CARGO_PKG_VERSION"));
const TRAY_ID: &str = "main";
const MAIN: &str = "main";
const MINI: &str = "mini";
/// Passed by the autostart entry: start in the tray without showing a window.
const MINIMIZED_ARG: &str = "--minimized";
/// Windows limits tray tooltips to 127 characters.
const TOOLTIP_MAX: usize = 120;
/// If the frontend never reports ready (broken build), show the window anyway.
const SHOW_FALLBACK: Duration = Duration::from_secs(4);

struct AppState {
    directory: Directory,
    resolver: Resolver,
    proxy: ProxyInfo,
    close_to_tray: AtomicBool,
    mini_mode: AtomicBool,
    ui_shown: AtomicBool,
    started_hidden: bool,
}

impl AppState {
    fn current_label(&self) -> &'static str {
        if self.mini_mode.load(Ordering::Relaxed) {
            MINI
        } else {
            MAIN
        }
    }
}

type AppStateRef<'a> = State<'a, Arc<AppState>>;

#[tauri::command]
fn proxy_info(state: AppStateRef<'_>) -> ProxyInfo {
    state.proxy.clone()
}

#[tauri::command]
async fn search_stations(state: AppStateRef<'_>, search: Search) -> Result<Vec<Station>, String> {
    state
        .directory
        .search(&search)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stations_by_id(state: AppStateRef<'_>, ids: Vec<String>) -> Result<Vec<Station>, String> {
    state
        .directory
        .by_ids(&ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn directory_countries(state: AppStateRef<'_>) -> Result<Vec<Facet>, String> {
    state.directory.countries().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn directory_languages(state: AppStateRef<'_>) -> Result<Vec<Facet>, String> {
    state.directory.languages().await.map_err(|e| e.to_string())
}

/// Checks a stream address the user entered. Errors are codes (`invalid_url`, …).
#[tauri::command]
async fn resolve_stream(state: AppStateRef<'_>, url: String) -> Result<Resolved, String> {
    state
        .resolver
        .resolve(&url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn count_click(state: AppStateRef<'_>, id: String) {
    let state = state.inner().clone();
    tauri::async_runtime::spawn(async move { state.directory.click(&id).await });
}

/// The web view reports an error (start-up failures, uncaught exceptions).
#[tauri::command]
fn frontend_error(message: String) {
    log::error!("frontend: {message}");
    eprintln!("frontend error: {message}");
}

/// Playback started: give our WebView2 audio session the app's name and icon (Windows mixer).
#[tauri::command]
fn audio_started() {
    mixer::brand_audio_sessions();
}

#[tauri::command]
fn set_close_to_tray(state: AppStateRef<'_>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

/// The frontend is ready: show the window of the stored mode (unless started into the tray).
#[tauri::command]
fn show_ui(app: AppHandle, state: AppStateRef<'_>, mini: bool) {
    log::info!("UI ready (floating player: {mini})");
    state.mini_mode.store(mini, Ordering::Relaxed);
    if state.ui_shown.swap(true, Ordering::Relaxed) || state.started_hidden {
        return;
    }
    show_window(&app);
}

/// Switches between the main window and the floating player.
#[tauri::command]
fn set_mini_mode(app: AppHandle, state: AppStateRef<'_>, enabled: bool) {
    state.mini_mode.store(enabled, Ordering::Relaxed);
    let (show, hide) = if enabled { (MINI, MAIN) } else { (MAIN, MINI) };
    if let Some(window) = app.get_webview_window(hide) {
        let _ = window.hide();
    }
    show_window_by_label(&app, show);
}

/// Hides the floating player to the tray (its close button).
#[tauri::command]
fn hide_window(app: AppHandle, state: AppStateRef<'_>) {
    if let Some(window) = app.get_webview_window(state.current_label()) {
        let _ = window.hide();
    }
}

#[tauri::command]
fn show_current_window(app: AppHandle) {
    show_window(&app);
}

/// Tray texts come from the frontend, which owns the translations.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayState {
    tooltip: String,
    playing: bool,
    mini: bool,
    favorites: Vec<TrayFavorite>,
    labels: TrayLabels,
}

#[derive(Debug, Deserialize)]
struct TrayFavorite {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayLabels {
    play: String,
    stop: String,
    favorites: String,
    mini_on: String,
    mini_off: String,
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
    let mini_label = if tray.mini {
        &tray.labels.mini_off
    } else {
        &tray.labels.mini_on
    };
    let mini = MenuItem::with_id(app, "mini", mini_label, true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", &tray.labels.show, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", &tray.labels.quit, true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    Menu::with_items(
        app,
        &[&toggle, &sep()?, &favorites, &sep()?, &mini, &show, &quit],
    )
}

fn show_window_by_label(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Shows the window of the current mode (main window or floating player).
fn show_window(app: &AppHandle) {
    let label = app.state::<Arc<AppState>>().current_label();
    show_window_by_label(app, label);
}

fn toggle_window(app: &AppHandle) {
    let label = app.state::<Arc<AppState>>().current_label();
    if let Some(window) = app.get_webview_window(label) {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window_by_label(app, label);
        }
    }
}

fn emit_action(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit_to(MAIN, "tray-action", payload);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let initial = TrayState {
        tooltip: "SysRadio".into(),
        playing: false,
        mini: false,
        favorites: Vec::new(),
        labels: TrayLabels {
            play: "Play".into(),
            stop: "Stop".into(),
            favorites: "Favorites".into(),
            mini_on: "Floating player".into(),
            mini_off: "Full window".into(),
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
            "toggle" => emit_action(app, serde_json::json!({ "action": "toggle" })),
            "mini" => emit_action(app, serde_json::json!({ "action": "mini" })),
            "show" => show_window(app),
            "quit" => app.exit(0),
            id => {
                if let Some(station) = id.strip_prefix("fav:") {
                    emit_action(app, serde_json::json!({ "action": "play", "id": station }));
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

    // The state must exist before any window loads: on Windows the web view can call commands
    // before `setup` has run (2026-10-20, 0.2.0 started with an empty window). The proxy is
    // therefore started here; its title events reach the app once the handle exists.
    let handle_slot: Arc<OnceLock<AppHandle>> = Arc::new(OnceLock::new());
    let slot = handle_slot.clone();
    let sink: proxy::TitleSink = Arc::new(move |event: TitleEvent| {
        if let Some(handle) = slot.get() {
            let _ = handle.emit("now-playing", event);
        }
    });
    let proxy = tauri::async_runtime::block_on(proxy::start(USER_AGENT, sink))
        .expect("could not start the local stream proxy");
    let state = Arc::new(AppState {
        directory: Directory::new(USER_AGENT),
        resolver: Resolver::new(USER_AGENT),
        proxy,
        close_to_tray: AtomicBool::new(true),
        mini_mode: AtomicBool::new(false),
        ui_shown: AtomicBool::new(false),
        started_hidden,
    });

    tauri::Builder::default()
        .manage(state)
        // Must come first: a second start only brings the running window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app)
        }))
        // Log file for support: %LOCALAPPDATA%\de.syssteve.sysradio\logs (Windows),
        // ~/Library/Logs/de.syssteve.sysradio (macOS).
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir {
                        file_name: Some("sysradio".into()),
                    }),
                    Target::new(TargetKind::Stderr),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Visibility is ours to decide (tray start), size and position are restored.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .setup(move |app| {
            log::info!(
                "SysRadio {} starting (hidden: {started_hidden})",
                env!("CARGO_PKG_VERSION")
            );
            let _ = handle_slot.set(app.handle().clone());
            build_tray(app.handle())?;
            if !started_hidden {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(SHOW_FALLBACK).await;
                    let state = handle.state::<Arc<AppState>>();
                    if !state.ui_shown.swap(true, Ordering::Relaxed) {
                        log::warn!("the UI did not report ready within {SHOW_FALLBACK:?}; showing the window anyway");
                        show_window(&handle);
                    }
                });
            }
            Ok(())
        })
        .on_page_load(|webview, payload| {
            let event = match payload.event() {
                PageLoadEvent::Started => "loading",
                PageLoadEvent::Finished => "loaded",
            };
            log::info!("{} {event}: {}", webview.label(), payload.url());
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Arc<AppState>>();
                // The floating player always goes to the tray (Alt+F4 included).
                if window.label() == MINI || state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            proxy_info,
            frontend_error,
            search_stations,
            stations_by_id,
            directory_countries,
            directory_languages,
            resolve_stream,
            count_click,
            audio_started,
            set_close_to_tray,
            show_ui,
            set_mini_mode,
            hide_window,
            show_current_window,
            update_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running SysRadio");
}
