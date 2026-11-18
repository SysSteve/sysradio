//! Keeps restored windows reachable. The window-state plugin can restore a position outside
//! every screen (mixed scale factors on macOS), and macOS does not pull borderless windows
//! back. Pure geometry, no Tauri types; all values share one unit.

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, w: u32, h: u32) -> Self {
        Self { x, y, w, h }
    }
    fn right(&self) -> i64 {
        self.x as i64 + self.w as i64
    }
    fn bottom(&self) -> i64 {
        self.y as i64 + self.h as i64
    }
}

/// Minimum visible width of the window's top edge, and height of the grab strip below it.
const MIN_GRAB_W: i64 = 64;
const MIN_GRAB_H: i64 = 32;

/// Whether the top edge (title bar / drag area) lies on `area` with enough width to grab.
fn reachable(window: &Rect, area: &Rect) -> bool {
    let overlap = window.right().min(area.right()) - (window.x as i64).max(area.x as i64);
    let top = window.y as i64;
    overlap >= MIN_GRAB_W && top >= area.y as i64 && top <= area.bottom() - MIN_GRAB_H
}

/// `None` when the window is reachable on some monitor and fits its work area; otherwise the
/// rectangle to use: size capped to the work area (and `max`, if given) and centred on it. The target is
/// `areas[0]` (callers pass the primary monitor first).
pub fn corrected(window: Rect, areas: &[Rect], max: Option<(u32, u32)>) -> Option<Rect> {
    let target = areas.first()?;
    let (max_w, max_h) = max.unwrap_or((u32::MAX, u32::MAX));
    let fits = |a: &Rect| window.w <= a.w.min(max_w) && window.h <= a.h.min(max_h);
    let ok = areas.iter().any(|a| reachable(&window, a) && fits(a));
    if ok {
        return None;
    }
    // A reachable but oversized window stays on its own monitor.
    let area = areas
        .iter()
        .find(|a| reachable(&window, a))
        .unwrap_or(target);
    let w = window.w.min(area.w).min(max_w);
    let h = window.h.min(area.h).min(max_h);
    Some(Rect::new(
        area.x + ((area.w - w) / 2) as i32,
        area.y + ((area.h - h) / 2) as i32,
        w,
        h,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Logical points as measured on a Mac: wide main screen, laptop screen below it.
    const MAIN: Rect = Rect::new(0, 25, 3440, 1415);
    const LAPTOP: Rect = Rect::new(2161, 1440, 1512, 982);

    #[test]
    fn fully_visible_is_left_alone() {
        assert_eq!(
            corrected(Rect::new(100, 100, 1264, 636), &[MAIN, LAPTOP], None),
            None
        );
    }

    #[test]
    fn far_outside_is_centred_on_the_primary_monitor() {
        // The real case: above every screen.
        let fixed = corrected(Rect::new(1530, -724, 1264, 636), &[MAIN, LAPTOP], None).unwrap();
        assert_eq!(fixed, Rect::new(1088, 414, 1264, 636));
    }

    #[test]
    fn barely_visible_is_corrected() {
        // Only 20 px of width on screen.
        let fixed = corrected(Rect::new(3420, 200, 800, 500), &[MAIN, LAPTOP], None).unwrap();
        assert_eq!(fixed, Rect::new(1320, 482, 800, 500));
        // Top edge above the screen: not grabbable although most of the body is visible.
        assert!(corrected(Rect::new(500, -300, 800, 500), &[MAIN, LAPTOP], None).is_some());
    }

    #[test]
    fn oversized_is_shrunk_to_the_work_area() {
        let fixed = corrected(Rect::new(0, 25, 5000, 3000), &[MAIN, LAPTOP], None).unwrap();
        assert_eq!(fixed, MAIN);
    }

    #[test]
    fn max_size_caps_a_reachable_window() {
        let fixed = corrected(
            Rect::new(100, 100, 2528, 1272),
            &[MAIN, LAPTOP],
            Some((960, 360)),
        )
        .unwrap();
        assert_eq!(fixed, Rect::new(1240, 552, 960, 360));
        assert_eq!(
            corrected(
                Rect::new(100, 100, 380, 104),
                &[MAIN, LAPTOP],
                Some((960, 360))
            ),
            None
        );
    }

    #[test]
    fn second_monitor_is_fine() {
        assert_eq!(
            corrected(Rect::new(2300, 1500, 1264, 636), &[MAIN, LAPTOP], None),
            None
        );
    }

    #[test]
    fn no_monitors_means_no_change() {
        assert_eq!(corrected(Rect::new(0, 0, 100, 100), &[], None), None);
    }
}
