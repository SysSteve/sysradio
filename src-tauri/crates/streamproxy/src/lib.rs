//! Networking core of SysRadio, kept free of Tauri so it can be tested on any machine.

pub mod directory;
pub mod hls;
pub mod icy;
pub mod proxy;
pub mod resolve;

/// Installs the TLS crypto provider (ring). Call once at startup, before any request.
pub fn init_tls() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
