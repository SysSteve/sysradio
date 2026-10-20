//! Live check against the real directory and a real station:
//!   cargo run -p streamproxy --example live -- "station name"
//!   cargo run -p streamproxy --example live -- https://…/playlist.m3u8
//! Searches the station, plays it through the proxy for a few seconds and prints the titles.

use std::sync::Arc;
use std::time::Duration;
use streamproxy::directory::{Directory, Search};
use streamproxy::proxy;

#[tokio::main]
async fn main() {
    let name = std::env::args().nth(1).unwrap_or_else(|| "Bayern 3".into());
    if name.contains(".m3u8") {
        return hls_check(&name).await;
    }
    let directory = Directory::new("SysRadio-live-check/0.1");
    let stations = directory
        .search(&Search {
            name,
            limit: 5,
            ..Default::default()
        })
        .await
        .expect("search");
    for s in &stations {
        println!(
            "{} | {} | {} {}kbps | {}",
            s.name, s.country_code, s.codec, s.bitrate, s.url
        );
    }
    let station = stations.first().expect("no station found");
    if station.hls {
        return hls_check(&station.url).await;
    }
    let info = proxy::start(
        "SysRadio-live-check/0.1",
        Arc::new(|e| println!("title: {}", e.title)),
    )
    .await
    .expect("proxy");
    let url = format!(
        "{}/stream?t={}&s=1&u={}",
        info.base,
        info.token,
        url::form_urlencoded::byte_serialize(station.url.as_bytes()).collect::<String>()
    );
    let mut res = reqwest::get(url).await.expect("proxy request");
    println!(
        "status {} type {:?}",
        res.status(),
        res.headers().get("content-type")
    );
    let mut total = 0;
    let _ = tokio::time::timeout(Duration::from_secs(12), async {
        while let Ok(Some(chunk)) = res.chunk().await {
            total += chunk.len();
        }
    })
    .await;
    println!("received {total} audio bytes");
}

/// HLS: fetch the rewritten playlist(s) through the proxy and one segment.
async fn hls_check(url: &str) {
    let info = proxy::start("SysRadio-live-check/0.1", Arc::new(|_| {}))
        .await
        .expect("proxy");
    let enc = |u: &str| url::form_urlencoded::byte_serialize(u.as_bytes()).collect::<String>();
    let mut playlist_url = format!("{}/hls?t={}&u={}", info.base, info.token, enc(url));
    for depth in 0..3 {
        let text = reqwest::get(&playlist_url)
            .await
            .expect("playlist")
            .text()
            .await
            .unwrap();
        println!("--- playlist (level {depth}) ---");
        for line in text.lines().take(8) {
            println!("{}", &line[..line.len().min(140)]);
        }
        let next = text.lines().find(|l| l.starts_with("http")).expect("entry");
        if next.contains("/hls?") {
            playlist_url = next.to_owned();
            continue;
        }
        let res = reqwest::get(next).await.expect("segment");
        let status = res.status();
        let kind = res.headers().get("content-type").cloned();
        println!(
            "segment {status} {kind:?} {} bytes",
            res.bytes().await.unwrap().len()
        );
        return;
    }
}
