//! Remembered window geometry. Pure parsing, validation and clamping; reading, writing and
//! applying it to real windows is in `lib.rs`. Values are in "placement units": logical
//! points on macOS, physical pixels elsewhere (see `ensure_on_screen`).

use crate::placement::Rect;
use serde::{Deserialize, Serialize};

const VERSION: u32 = 1;
/// Plausibility limits: anything outside is a corrupt or foreign file.
const MAX_SIZE: u32 = 20_000;
const MAX_COORD: u32 = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Saved {
    pub rect: Rect,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct File {
    pub version: u32,
    pub main: Option<Saved>,
    pub mini: Option<Saved>,
}

impl File {
    pub fn new() -> Self {
        Self {
            version: VERSION,
            ..Self::default()
        }
    }

    pub fn get(&self, label: &str) -> Option<Saved> {
        match label {
            "main" => self.main,
            "mini" => self.mini,
            _ => None,
        }
    }

    pub fn set(&mut self, label: &str, saved: Saved) {
        match label {
            "main" => self.main = Some(saved),
            "mini" => self.mini = Some(saved),
            _ => {}
        }
    }
}

/// Smallest and largest size per window (logical points); matches `tauri.conf.json`.
pub fn size_limits(label: &str) -> ((u32, u32), (u32, u32)) {
    match label {
        "mini" => ((200, 64), (960, 360)),
        _ => ((320, 420), (MAX_SIZE, MAX_SIZE)),
    }
}

fn plausible(r: &Rect) -> bool {
    r.w > 0
        && r.h > 0
        && r.w <= MAX_SIZE
        && r.h <= MAX_SIZE
        && r.x.unsigned_abs() <= MAX_COORD
        && r.y.unsigned_abs() <= MAX_COORD
}

/// A saved entry that is usable for `label`: plausible numbers, size clamped to the limits.
/// `units_per_point` converts the limits (points) into the stored units: 1 on macOS, the
/// window's scale factor where physical pixels are stored.
pub fn sanitized(label: &str, saved: Saved, units_per_point: f64) -> Option<Saved> {
    if !plausible(&saved.rect) {
        return None;
    }
    let ((min_w, min_h), (max_w, max_h)) = size_limits(label);
    let mut rect = saved.rect;
    let u = |v: u32| (v as f64 * units_per_point).round() as u32;
    rect.w = rect.w.clamp(u(min_w), u(max_w).max(u(min_w)));
    rect.h = rect.h.clamp(u(min_h), u(max_h).max(u(min_h)));
    Some(Saved { rect, ..saved })
}

/// Parses the file; broken JSON or an unknown version gives `None` (defaults apply).
pub fn parse(text: &str) -> Option<File> {
    let file: File = serde_json::from_str(text).ok()?;
    (file.version == VERSION).then_some(file)
}

pub fn to_json(file: &File) -> String {
    serde_json::to_string_pretty(file).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(x: i32, y: i32, w: u32, h: u32) -> Saved {
        Saved {
            rect: Rect::new(x, y, w, h),
            maximized: false,
        }
    }

    #[test]
    fn roundtrip() {
        let mut file = File::new();
        file.set(
            "main",
            Saved {
                maximized: true,
                ..saved(10, 20, 400, 640)
            },
        );
        file.set("mini", saved(-1500, 30, 380, 104));
        assert_eq!(parse(&to_json(&file)), Some(file));
    }

    #[test]
    fn broken_or_foreign_files_are_ignored() {
        assert_eq!(parse(""), None);
        assert_eq!(parse("{not json"), None);
        assert_eq!(
            parse("{\"version\":1,\"main\":{\"rect\":{\"x\":NaN}}}"),
            None
        );
        assert_eq!(parse("{\"version\":99}"), None);
        // The old plugin's file has no version.
        assert_eq!(
            parse("{\"main\":{\"width\":800,\"height\":600,\"x\":0,\"y\":0}}"),
            None
        );
    }

    #[test]
    fn implausible_values_are_dropped() {
        assert_eq!(sanitized("main", saved(0, 0, 0, 640), 1.0), None);
        assert_eq!(sanitized("main", saved(0, 0, 400, 0), 1.0), None);
        assert_eq!(sanitized("main", saved(0, 0, 400_000, 640), 1.0), None);
        assert_eq!(sanitized("main", saved(i32::MIN, 0, 400, 640), 1.0), None);
        assert_eq!(sanitized("main", saved(500_000, 0, 400, 640), 1.0), None);
        // Negative sizes cannot even be parsed.
        assert_eq!(
            parse("{\"version\":1,\"main\":{\"rect\":{\"x\":0,\"y\":0,\"w\":-5,\"h\":10}}}"),
            None
        );
    }

    #[test]
    fn mini_is_capped_and_floored() {
        let big = sanitized("mini", saved(100, 100, 2528, 1272), 1.0).unwrap();
        assert_eq!((big.rect.w, big.rect.h), (960, 360));
        let small = sanitized("mini", saved(100, 100, 10, 10), 1.0).unwrap();
        assert_eq!((small.rect.w, small.rect.h), (200, 64));
        let main = sanitized("main", saved(100, 100, 2528, 1272), 1.0).unwrap();
        assert_eq!((main.rect.w, main.rect.h), (2528, 1272));
        // Physical pixels at 2x: the limit doubles.
        let px = sanitized("mini", saved(100, 100, 2528, 1272), 2.0).unwrap();
        assert_eq!((px.rect.w, px.rect.h), (1920, 720));
    }
}
