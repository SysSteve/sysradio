//! Live check against the real directory and a real station:
//!   cargo run -p streamproxy --example live -- "station name"
//! Searches the station, plays it through the proxy for a few seconds and prints the titles.

use std::sync::Arc;
use std::time::Duration;
use streamproxy::directory::{Directory, Search};
use streamproxy::proxy;

#[tokio::main]
async fn main() {
    let name = std::env::args().nth(1).unwrap_or_else(|| "Bayern 3".into());
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
