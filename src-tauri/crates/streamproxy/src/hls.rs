//! HTTP Live Streaming: a station publishes an `.m3u8` playlist that lists short segments (or
//! further playlists for different bitrates). The proxy rewrites every address in a playlist
//! so that playlists go through `/hls` and segments, keys and init sections through `/seg`.
//! That keeps everything on the trusted loopback origin with CORS for the app.

/// Builds proxied addresses: `kind` is `"hls"` (playlist) or `"seg"` (anything else).
pub trait ProxyUrl {
    fn proxied(&self, kind: &str, target: &url::Url) -> String;
}

/// Rewrites a playlist fetched from `base` (its final address after redirects).
pub fn rewrite_playlist(text: &str, base: &url::Url, proxy: &impl ProxyUrl) -> String {
    let mut out = String::with_capacity(text.len() * 2);
    // The line after #EXT-X-STREAM-INF is another playlist (a variant), not a segment.
    let mut next_is_playlist = false;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            out.push('\n');
            continue;
        }
        if let Some(tag) = line.strip_prefix('#') {
            if tag.starts_with("EXT-X-STREAM-INF") {
                next_is_playlist = true;
            }
            let kind =
                if tag.starts_with("EXT-X-MEDIA") || tag.starts_with("EXT-X-I-FRAME-STREAM-INF") {
                    "hls"
                } else {
                    "seg"
                };
            out.push_str(&rewrite_uri_attribute(line, base, kind, proxy));
        } else {
            let kind = if next_is_playlist || looks_like_playlist(line) {
                "hls"
            } else {
                "seg"
            };
            next_is_playlist = false;
            match base.join(line) {
                Ok(target) if matches!(target.scheme(), "http" | "https") => {
                    out.push_str(&proxy.proxied(kind, &target))
                }
                // Unusable address: drop it rather than pass something unproxied through.
                _ => continue,
            }
        }
        out.push('\n');
    }
    out
}

fn looks_like_playlist(uri: &str) -> bool {
    let path = uri.split(['?', '#']).next().unwrap_or(uri);
    path.to_ascii_lowercase().ends_with(".m3u8")
}

/// Rewrites `URI="…"` inside a tag line (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, …).
fn rewrite_uri_attribute(line: &str, base: &url::Url, kind: &str, proxy: &impl ProxyUrl) -> String {
    const KEY: &str = "URI=\"";
    let Some(start) = line.find(KEY).map(|i| i + KEY.len()) else {
        return line.to_owned();
    };
    let Some(len) = line[start..].find('"') else {
        return line.to_owned();
    };
    let uri = &line[start..start + len];
    match base.join(uri) {
        Ok(target) if matches!(target.scheme(), "http" | "https") => format!(
            "{}{}{}",
            &line[..start],
            proxy.proxied(kind, &target),
            &line[start + len..]
        ),
        _ => line.to_owned(),
    }
}

/// Whether a response is a playlist (by type or, for servers that send `text/plain`, content).
pub fn is_playlist(content_type: &str, body_start: &[u8]) -> bool {
    let ct = content_type.to_ascii_lowercase();
    ct.contains("mpegurl") || body_start.starts_with(b"#EXTM3U")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake;
    impl ProxyUrl for Fake {
        fn proxied(&self, kind: &str, target: &url::Url) -> String {
            format!("P/{kind}?u={target}")
        }
    }

    #[test]
    fn rewrites_master_playlist_variants_and_media() {
        let base = url::Url::parse("https://cdn.example/live/master.m3u8?token=1").unwrap();
        let text = "#EXTM3U\n\
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",URI=\"audio/main.m3u8\"\n\
            #EXT-X-STREAM-INF:BANDWIDTH=128000\n\
            low/index\n\
            #EXT-X-STREAM-INF:BANDWIDTH=256000\n\
            https://other.example/high.m3u8\n";
        let out = rewrite_playlist(text, &base, &Fake);
        assert_eq!(
            out,
            "#EXTM3U\n\
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",URI=\"P/hls?u=https://cdn.example/live/audio/main.m3u8\"\n\
            #EXT-X-STREAM-INF:BANDWIDTH=128000\n\
            P/hls?u=https://cdn.example/live/low/index\n\
            #EXT-X-STREAM-INF:BANDWIDTH=256000\n\
            P/hls?u=https://other.example/high.m3u8\n"
        );
    }

    #[test]
    fn rewrites_segments_keys_and_init_sections() {
        let base = url::Url::parse("http://radio.example/hls/chunks.m3u8").unwrap();
        let text = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\",IV=0x1\n\
            #EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:6.0,\nseg-1.aac\n\n#EXTINF:6.0,\n/abs/seg-2.aac?x=1\n";
        let out = rewrite_playlist(text, &base, &Fake);
        assert!(out.contains("URI=\"P/seg?u=http://radio.example/hls/key.bin\",IV=0x1"));
        assert!(out.contains("#EXT-X-MAP:URI=\"P/seg?u=http://radio.example/hls/init.mp4\""));
        assert!(out.contains("\nP/seg?u=http://radio.example/hls/seg-1.aac\n"));
        assert!(out.contains("\nP/seg?u=http://radio.example/abs/seg-2.aac?x=1\n"));
    }

    #[test]
    fn drops_addresses_with_foreign_schemes() {
        let base = url::Url::parse("https://cdn.example/a.m3u8").unwrap();
        let out = rewrite_playlist("#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n", &base, &Fake);
        assert_eq!(out, "#EXTM3U\n#EXTINF:1,\n");
    }

    #[test]
    fn recognises_playlists() {
        assert!(is_playlist("application/vnd.apple.mpegurl", b""));
        assert!(is_playlist("text/plain", b"#EXTM3U\n"));
        assert!(!is_playlist("audio/aac", b"\xff\xf1"));
    }
}
