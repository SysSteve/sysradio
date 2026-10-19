//! Windows volume mixer: audio from the web view is played by a WebView2 child process, so the
//! mixer would show "Microsoft Edge WebView2" with the Edge icon. After playback starts we look
//! up the audio sessions of our own WebView2 processes (descendants of this process) and give
//! them the app's name and icon through the Core Audio API. Other apps' sessions are untouched.
//! Upstream issue: https://github.com/MicrosoftEdge/WebView2Feedback/issues/2236

/// Name shown in the volume mixer.
#[cfg_attr(not(windows), allow(dead_code))]
pub const DISPLAY_NAME: &str = "SysRadio";

/// Whether `pid` is `ancestor` or one of its descendants. `parent_of` returns a process's
/// parent; the walk stops at unknown processes, PID 0 and loops (PIDs get reused).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn descends_from(pid: u32, ancestor: u32, parent_of: impl Fn(u32) -> Option<u32>) -> bool {
    let mut current = pid;
    for _ in 0..32 {
        if current == ancestor {
            return true;
        }
        match parent_of(current) {
            Some(parent) if parent != 0 && parent != current => current = parent,
            _ => return false,
        }
    }
    false
}

/// Names our WebView2 audio sessions; retries for a few seconds, because the session appears
/// only once the audio process has opened the output device. Does nothing outside Windows.
pub fn brand_audio_sessions() {
    #[cfg(windows)]
    std::thread::spawn(|| {
        for delay_ms in [300u64, 1000, 3000] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            match win::brand() {
                Ok(0) => continue,
                Ok(n) => log::debug!("named {n} audio session(s)"),
                Err(e) => log::warn!("could not name audio sessions: {e}"),
            }
        }
    });
}

#[cfg(windows)]
mod win {
    use super::{descends_from, DISPLAY_NAME};
    use std::collections::HashMap;
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    /// Parent PID of every running process.
    fn parents() -> windows::core::Result<HashMap<u32, u32>> {
        let mut map = HashMap::new();
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)?;
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    map.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
        Ok(map)
    }

    /// Returns how many sessions now carry our name and icon.
    pub fn brand() -> windows::core::Result<usize> {
        unsafe {
            // Fails harmlessly if this thread already has COM; we only uninitialize our own.
            let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let result = brand_sessions();
            if com {
                CoUninitialize();
            }
            result
        }
    }

    unsafe fn brand_sessions() -> windows::core::Result<usize> {
        let own = std::process::id();
        let parents = parents()?;
        let name = HSTRING::from(DISPLAY_NAME);
        // The exe carries the app icon; ",0" is the first icon in it.
        let icon = std::env::current_exe()
            .map(|p| HSTRING::from(format!("{},0", p.display())))
            .ok();

        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let collection = devices.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let mut branded = 0;
        for i in 0..collection.GetCount()? {
            let Ok(device) = collection.Item(i) else {
                continue;
            };
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
                continue;
            };
            let sessions = manager.GetSessionEnumerator()?;
            for j in 0..sessions.GetCount()? {
                let Ok(session) = sessions.GetSession(j) else {
                    continue;
                };
                let Ok(session) = session.cast::<IAudioSessionControl2>() else {
                    continue;
                };
                let Ok(pid) = session.GetProcessId() else {
                    continue;
                };
                // Only sessions of our own child processes (WebView2), never our own exe's
                // or another app's.
                if pid == own || !descends_from(pid, own, |p| parents.get(&p).copied()) {
                    continue;
                }
                session.SetDisplayName(&name, std::ptr::null())?;
                if let Some(icon) = &icon {
                    session.SetIconPath(icon, std::ptr::null())?;
                }
                branded += 1;
            }
        }
        Ok(branded)
    }
}

#[cfg(test)]
mod tests {
    use super::descends_from;
    use std::collections::HashMap;

    #[test]
    fn finds_webview_grandchildren_but_not_strangers() {
        // 100 = SysRadio → 200 = WebView2 browser → 300 = WebView2 audio; 400 = other app.
        let parents = HashMap::from([(200, 100), (300, 200), (400, 50), (50, 4), (4, 0)]);
        let parent_of = |p: u32| parents.get(&p).copied();
        assert!(descends_from(300, 100, parent_of));
        assert!(descends_from(200, 100, parent_of));
        assert!(!descends_from(400, 100, parent_of));
        assert!(!descends_from(999, 100, parent_of));
    }

    #[test]
    fn stops_on_loops_from_reused_pids() {
        let parents = HashMap::from([(1, 2), (2, 1)]);
        assert!(!descends_from(1, 100, |p| parents.get(&p).copied()));
    }
}
