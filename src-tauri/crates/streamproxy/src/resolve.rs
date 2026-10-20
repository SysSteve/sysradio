//! Checks a stream address the user typed in: follows `.pls` and `.m3u` playlists to the real
//! stream, recognises HLS, and reads name, format and bitrate from the station's headers.

use futures_util::StreamExt;
use serde::Serialize;
use std::time::Duration;

/// Playlists larger than this are not read.
const MAX_PLAYLIST_BYTES: usize = 64 * 1024;
/// Playlists may point to playlists; stop after this many hops.
const MAX_HOPS: usize = 3;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    /// Address the player should use.
    pub url: String,
    pub hls: bool,
    /// Station name from `icy-name`, if sent.
    pub name: String,
    pub codec: String,
    pub bitrate: u32,
}

/// Error codes; the frontend maps them to texts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolveError {
    InvalidUrl,
    Unreachable,
    NotAudio,
    EmptyPlaylist,
}

impl std::fmt::Display for ResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            ResolveError::InvalidUrl => "invalid_url",
            ResolveError::Unreachable => "unreachable",
            ResolveError::NotAudio => "not_audio",
            ResolveError::EmptyPlaylist => "empty_playlist",
        };
        f.write_str(text)
    }
}

impl std::error::Error for ResolveError {}

pub struct Resolver {
    http: reqwest::Client,
}

enum Kind {
    Pls,
    M3u,
    Audio,
    Unknown,
}

impl Resolver {
    pub fn new(user_agent: &str) -> Self {
        crate::init_tls();
        let http = reqwest::Client::builder()
            .user_agent(user_agent)
            .connect_timeout(Duration::from_secs(8))
            .read_timeout(Duration::from_secs(10))
            .build()
            .expect("http client");
        Self { http }
    }

    pub async fn resolve(&self, raw: &str) -> Result<Resolved, ResolveError> {
        let mut current = parse_url(raw.trim())?;
        for _ in 0..MAX_HOPS {
            let res = tokio::time::timeout(
                Duration::from_secs(10),
                self.http.get(current.clone()).send(),
            )
            .await
            .map_err(|_| ResolveError::Unreachable)?
            .map_err(|_| ResolveError::Unreachable)?;
            if !res.status().is_success() {
                return Err(ResolveError::Unreachable);
            }
            let final_url = res.url().clone();
            let header = |name: &str| {
                res.headers()
                    .get(name)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .trim()
                    .to_owned()
            };
            let content_type = header("content-type").to_ascii_lowercase();
            match kind(&content_type, final_url.path()) {
                Kind::Audio => {
                    return Ok(Resolved {
                        url: final_url.to_string(),
                        hls: false,
                        name: header("icy-name"),
                        codec: codec(&content_type).to_owned(),
                        bitrate: header("icy-br")
                            .split(',')
                            .next()
                            .and_then(|b| b.trim().parse().ok())
                            .unwrap_or(0),
                    });
                }
                Kind::Pls | Kind::M3u | Kind::Unknown => {
                    let is_pls = matches!(kind(&content_type, final_url.path()), Kind::Pls);
                    let body = read_limited(res).await?;
                    if body.starts_with(b"#EXTM3U") && contains(&body, b"#EXT-X-") {
                        return Ok(Resolved {
                            url: final_url.to_string(),
                            hls: true,
                            name: String::new(),
                            codec: String::new(),
                            bitrate: 0,
                        });
                    }
                    let text = String::from_utf8_lossy(&body);
                    let entry = if is_pls
                        || text
                            .trim_start()
                            .to_ascii_lowercase()
                            .starts_with("[playlist]")
                    {
                        first_pls_entry(&text)
                    } else if looks_like_text(&body) {
                        first_m3u_entry(&text)
                    } else {
                        // Binary without a known type: most likely audio after all.
                        return Ok(Resolved {
                            url: final_url.to_string(),
                            hls: false,
                            name: String::new(),
                            codec: String::new(),
                            bitrate: 0,
                        });
                    };
                    let entry = entry.ok_or(ResolveError::EmptyPlaylist)?;
                    current = final_url
                        .join(&entry)
                        .map_err(|_| ResolveError::EmptyPlaylist)?;
                    if !matches!(current.scheme(), "http" | "https") {
                        return Err(ResolveError::EmptyPlaylist);
                    }
                }
            }
        }
        Err(ResolveError::EmptyPlaylist)
    }
}

fn parse_url(raw: &str) -> Result<url::Url, ResolveError> {
    let url = url::Url::parse(raw).map_err(|_| ResolveError::InvalidUrl)?;
    if matches!(url.scheme(), "http" | "https") && url.host().is_some() {
        Ok(url)
    } else {
        Err(ResolveError::InvalidUrl)
    }
}

fn kind(content_type: &str, path: &str) -> Kind {
    let path = path.to_ascii_lowercase();
    if content_type.contains("scpls") || path.ends_with(".pls") {
        Kind::Pls
    } else if content_type.contains("mpegurl") || path.ends_with(".m3u") || path.ends_with(".m3u8")
    {
        Kind::M3u
    } else if content_type.starts_with("audio/") || content_type.starts_with("application/ogg") {
        Kind::Audio
    } else if content_type.starts_with("text/html") {
        // A web page: not a stream, but read it to give a clear answer below.
        Kind::Unknown
    } else {
        Kind::Unknown
    }
}

/// Short codec name for display.
pub fn codec(content_type: &str) -> &'static str {
    let ct = content_type.split(';').next().unwrap_or("").trim();
    match ct {
        "audio/mpeg" | "audio/mp3" => "MP3",
        "audio/aac" | "audio/aacp" | "audio/x-aac" => "AAC",
        "audio/ogg" | "application/ogg" => "OGG",
        "audio/opus" => "OPUS",
        "audio/flac" | "audio/x-flac" => "FLAC",
        _ => "",
    }
}

async fn read_limited(res: reqwest::Response) -> Result<Vec<u8>, ResolveError> {
    let mut body = res.bytes_stream();
    let mut data = Vec::new();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|_| ResolveError::Unreachable)?;
        data.extend_from_slice(&chunk);
        if data.len() >= MAX_PLAYLIST_BYTES {
            break;
        }
    }
    Ok(data)
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

/// Text playlists are printable; audio data is not.
fn looks_like_text(data: &[u8]) -> bool {
    let sample = &data[..data.len().min(512)];
    !sample.is_empty() && std::str::from_utf8(sample).is_ok() && !sample.contains(&0)
}

/// `File1=http://…` from a PLS playlist (lowest number first).
pub fn first_pls_entry(text: &str) -> Option<String> {
    text.lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            let number: u32 = key
                .trim()
                .to_ascii_lowercase()
                .strip_prefix("file")?
                .parse()
                .ok()?;
            let value = value.trim();
            (!value.is_empty()).then(|| (number, value.to_owned()))
        })
        .min_by_key(|(n, _)| *n)
        .map(|(_, v)| v)
}

/// First address in an M3U playlist (lines that are not comments). Rejects HTML pages.
pub fn first_m3u_entry(text: &str) -> Option<String> {
    if text.trim_start().starts_with('<') {
        return None;
    }
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn reads_pls_and_m3u() {
        let pls = "[playlist]\nNumberOfEntries=2\nFile2=http://b/stream\nFile1=http://a/stream\nTitle1=A\n";
        assert_eq!(first_pls_entry(pls).as_deref(), Some("http://a/stream"));
        let m3u = "#EXTM3U\n#EXTINF:-1,Radio\n\nhttp://c/live.mp3\nhttp://d/\n";
        assert_eq!(first_m3u_entry(m3u).as_deref(), Some("http://c/live.mp3"));
        assert_eq!(first_m3u_entry("<!doctype html><p>x</p>"), None);
        assert_eq!(first_pls_entry("[playlist]\n"), None);
    }

    #[test]
    fn names_codecs() {
        assert_eq!(codec("audio/mpeg"), "MP3");
        assert_eq!(codec("audio/aacp; charset=x"), "AAC");
        assert_eq!(codec("video/mp4"), "");
    }

    /// A tiny server answering per path: (path, head, body).
    async fn server(routes: Vec<(&'static str, &'static str, &'static [u8])>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = listener.accept().await.unwrap();
                let routes = routes.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let path = req.split_whitespace().nth(1).unwrap_or("/").to_owned();
                    let (head, body) = routes
                        .iter()
                        .find(|(p, _, _)| *p == path)
                        .map(|(_, h, b)| (*h, *b))
                        .unwrap_or(("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n", b""));
                    let _ = sock
                        .write_all(format!("{head}Connection: close\r\n\r\n").as_bytes())
                        .await;
                    let _ = sock.write_all(body).await;
                });
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn follows_playlists_to_the_stream() {
        let base = server(vec![
            ("/radio.pls", "HTTP/1.1 200 OK\r\nContent-Type: audio/x-scpls\r\n", b"[playlist]\nFile1=/live.m3u\n"),
            ("/live.m3u", "HTTP/1.1 200 OK\r\nContent-Type: audio/x-mpegurl\r\n", b"#EXTM3U\n/stream\n"),
            (
                "/stream",
                "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nicy-name: Test FM\r\nicy-br: 128\r\n",
                b"\xff\xfb\x90\x00",
            ),
        ])
        .await;
        let resolved = Resolver::new("test")
            .resolve(&format!("{base}/radio.pls"))
            .await
            .unwrap();
        assert_eq!(resolved.url, format!("{base}/stream"));
        assert_eq!(
            (
                resolved.name.as_str(),
                resolved.codec.as_str(),
                resolved.bitrate
            ),
            ("Test FM", "MP3", 128)
        );
        assert!(!resolved.hls);
    }

    #[tokio::test]
    async fn recognises_hls_and_rejects_web_pages() {
        let base = server(vec![
            (
                "/live.m3u8",
                "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\n",
                b"#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6,\nseg1.aac\n",
            ),
            (
                "/page",
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n",
                b"<!doctype html><title>Radio</title>",
            ),
        ])
        .await;
        let resolver = Resolver::new("test");
        let hls = resolver
            .resolve(&format!("{base}/live.m3u8"))
            .await
            .unwrap();
        assert!(hls.hls);
        assert_eq!(
            resolver.resolve(&format!("{base}/page")).await,
            Err(ResolveError::EmptyPlaylist)
        );
        assert_eq!(
            resolver.resolve("ftp://x/y").await,
            Err(ResolveError::InvalidUrl)
        );
        assert_eq!(
            resolver.resolve("http://127.0.0.1:9/").await,
            Err(ResolveError::Unreachable)
        );
    }
}
