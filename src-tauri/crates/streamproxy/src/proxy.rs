//! Local stream proxy on 127.0.0.1. The web view plays `http://127.0.0.1:<port>/stream?...`
//! instead of the station URL, which
//! - makes plain `http:` streams playable from the app's secure origin (loopback is trusted),
//! - lets us ask for ICY metadata and strip it before the audio reaches the player,
//! - reports the current title ("now playing") through a callback.
//!
//! Every request needs the random token of this run, so neither other programs nor web pages
//! in a browser can use the proxy.

use crate::icy::{stream_title, IcyDemuxer};
use bytes::Bytes;
use futures_util::StreamExt;
use http_body_util::{combinators::BoxBody, BodyExt, Full, StreamBody};
use hyper::body::Frame;
use hyper::header::{HeaderValue, CACHE_CONTROL, CONTENT_TYPE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::mpsc;

/// Logos larger than this are not proxied.
const MAX_LOGO_BYTES: usize = 1024 * 1024;
const LOGO_CACHE_ENTRIES: usize = 300;

/// "Now playing" changed for the stream started with `session`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleEvent {
    pub session: String,
    pub title: String,
}

pub type TitleSink = Arc<dyn Fn(TitleEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyInfo {
    /// e.g. `http://127.0.0.1:51234`
    pub base: String,
    pub token: String,
}

struct Shared {
    token: String,
    http: reqwest::Client,
    sink: TitleSink,
    logos: Mutex<LogoCache>,
}

#[derive(Default)]
struct LogoCache {
    order: VecDeque<String>,
    entries: HashMap<String, (String, Bytes)>,
}

impl LogoCache {
    fn get(&self, url: &str) -> Option<(String, Bytes)> {
        self.entries.get(url).cloned()
    }

    fn put(&mut self, url: String, value: (String, Bytes)) {
        if self.entries.insert(url.clone(), value).is_none() {
            self.order.push_back(url);
        }
        while self.order.len() > LOGO_CACHE_ENTRIES {
            if let Some(old) = self.order.pop_front() {
                self.entries.remove(&old);
            }
        }
    }
}

/// Starts the proxy on a free loopback port and returns where it listens.
pub async fn start(user_agent: &str, sink: TitleSink) -> std::io::Result<ProxyInfo> {
    crate::init_tls();
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let port = listener.local_addr()?.port();
    let token = format!("{:032x}", rand::random::<u128>());
    let http = reqwest::Client::builder()
        .user_agent(user_agent)
        .connect_timeout(Duration::from_secs(10))
        // A stalled stream ends the response; the player then reconnects.
        .read_timeout(Duration::from_secs(20))
        .build()
        .map_err(std::io::Error::other)?;
    let shared = Arc::new(Shared {
        token: token.clone(),
        http,
        sink,
        logos: Default::default(),
    });
    tokio::spawn(async move {
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(conn) => conn,
                Err(e) => {
                    log::warn!("proxy accept failed: {e}");
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    continue;
                }
            };
            let shared = shared.clone();
            tokio::spawn(async move {
                let service = service_fn(move |req| handle(shared.clone(), req));
                if let Err(e) = http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), service)
                    .await
                {
                    log::debug!("proxy connection ended: {e}");
                }
            });
        }
    });
    Ok(ProxyInfo {
        base: format!("http://127.0.0.1:{port}"),
        token,
    })
}

type Body = BoxBody<Bytes, Infallible>;

fn plain(status: StatusCode, text: &'static str) -> Response<Body> {
    let mut res = Response::new(Full::new(Bytes::from_static(text.as_bytes())).boxed());
    *res.status_mut() = status;
    res.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    res
}

async fn handle(
    shared: Arc<Shared>,
    req: Request<hyper::body::Incoming>,
) -> Result<Response<Body>, Infallible> {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return Ok(plain(StatusCode::METHOD_NOT_ALLOWED, "method not allowed"));
    }
    let params: HashMap<String, String> = req
        .uri()
        .query()
        .map(|q| {
            url::form_urlencoded::parse(q.as_bytes())
                .into_owned()
                .collect()
        })
        .unwrap_or_default();
    if params.get("t") != Some(&shared.token) {
        return Ok(plain(StatusCode::FORBIDDEN, "invalid token"));
    }
    let Some(target) = params.get("u").and_then(|u| allowed_url(u)) else {
        return Ok(plain(StatusCode::BAD_REQUEST, "missing or unsupported url"));
    };
    let res = match req.uri().path() {
        "/stream" => {
            let session = params.get("s").cloned().unwrap_or_default();
            stream(&shared, target, session).await
        }
        "/logo" => logo(&shared, target).await,
        _ => plain(StatusCode::NOT_FOUND, "not found"),
    };
    Ok(res)
}

/// Only `http:` and `https:` targets are fetched.
fn allowed_url(raw: &str) -> Option<url::Url> {
    let url = url::Url::parse(raw).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

async fn stream(shared: &Shared, target: url::Url, session: String) -> Response<Body> {
    let upstream = match shared
        .http
        .get(target)
        .header("Icy-MetaData", "1")
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        Ok(res) => {
            log::info!("stream answered {}", res.status());
            return plain(StatusCode::BAD_GATEWAY, "station answered with an error");
        }
        Err(e) => {
            log::info!("stream unreachable: {e}");
            return plain(StatusCode::BAD_GATEWAY, "station unreachable");
        }
    };
    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.starts_with("audio/") || v.starts_with("application/ogg"))
        .unwrap_or("audio/mpeg")
        .to_owned();
    let metaint = upstream
        .headers()
        .get("icy-metaint")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|&n| n > 0);

    // Pump upstream into a small channel; when the player disconnects the receiver is dropped,
    // the send fails and the upstream connection is closed.
    let (tx, rx) = mpsc::channel::<Bytes>(16);
    let sink = shared.sink.clone();
    tokio::spawn(async move {
        let mut demux = metaint.map(IcyDemuxer::new);
        let mut body = upstream.bytes_stream();
        let mut last_title: Option<String> = None;
        while let Some(chunk) = body.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(e) => {
                    log::info!("stream interrupted: {e}");
                    break;
                }
            };
            let audio = match demux.as_mut() {
                None => chunk,
                Some(demux) => {
                    let mut audio = Vec::with_capacity(chunk.len());
                    for block in demux.feed(&chunk, &mut audio) {
                        if let Some(title) = stream_title(&block) {
                            if last_title.as_ref() != Some(&title) {
                                last_title = Some(title.clone());
                                sink(TitleEvent {
                                    session: session.clone(),
                                    title,
                                });
                            }
                        }
                    }
                    Bytes::from(audio)
                }
            };
            if !audio.is_empty() && tx.send(audio).await.is_err() {
                break;
            }
        }
    });

    let frames = futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv()
            .await
            .map(|bytes| (Ok::<_, Infallible>(Frame::data(bytes)), rx))
    });
    let mut res = Response::new(BodyExt::boxed(StreamBody::new(frames)));
    let headers = res.headers_mut();
    if let Ok(value) = HeaderValue::from_str(&content_type) {
        headers.insert(CONTENT_TYPE, value);
    }
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}

async fn logo(shared: &Shared, target: url::Url) -> Response<Body> {
    let key = target.to_string();
    let cached = shared.logos.lock().unwrap().get(&key);
    let (content_type, bytes) = match cached {
        Some(hit) => hit,
        None => match fetch_logo(&shared.http, target).await {
            Some(value) => {
                shared.logos.lock().unwrap().put(key, value.clone());
                value
            }
            None => return plain(StatusCode::NOT_FOUND, "no logo"),
        },
    };
    let mut res = Response::new(Full::new(bytes).boxed());
    if let Ok(value) = HeaderValue::from_str(&content_type) {
        res.headers_mut().insert(CONTENT_TYPE, value);
    }
    res.headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("max-age=86400"));
    res
}

async fn fetch_logo(http: &reqwest::Client, target: url::Url) -> Option<(String, Bytes)> {
    let res = tokio::time::timeout(Duration::from_secs(10), http.get(target).send())
        .await
        .ok()?
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let content_type = res.headers().get(CONTENT_TYPE)?.to_str().ok()?.to_owned();
    // SVG could carry scripts; raster formats only.
    if !content_type.starts_with("image/") || content_type.contains("svg") {
        return None;
    }
    if res
        .content_length()
        .is_some_and(|n| n as usize > MAX_LOGO_BYTES)
    {
        return None;
    }
    let mut body = res.bytes_stream();
    let mut data = Vec::new();
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(10), body.next())
        .await
        .ok()?
    {
        data.extend_from_slice(&chunk.ok()?);
        if data.len() > MAX_LOGO_BYTES {
            return None;
        }
    }
    Some((content_type, Bytes::from(data)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// A fake station: answers every request with `head` and `body`, then closes.
    async fn fake_station(head: &'static str, body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = listener.accept().await.unwrap();
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let _ = sock.read(&mut buf).await;
                    let _ = sock.write_all(head.as_bytes()).await;
                    let _ = sock.write_all(&body).await;
                });
            }
        });
        format!("http://{addr}/live")
    }

    fn collecting_sink() -> (TitleSink, Arc<Mutex<Vec<TitleEvent>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = events.clone();
        (Arc::new(move |e| store.lock().unwrap().push(e)), events)
    }

    fn proxied(info: &ProxyInfo, path: &str, target: &str, token: &str) -> String {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("t", token)
            .append_pair("s", "session-1")
            .append_pair("u", target)
            .finish();
        format!("{}{path}?{query}", info.base)
    }

    #[tokio::test]
    async fn strips_metadata_and_reports_titles() {
        let mut body = b"abcd".to_vec();
        let meta = b"StreamTitle='Artist - Song';";
        let mut block = meta.to_vec();
        block.resize(32, 0);
        body.push(2);
        body.extend(block);
        body.extend(b"efgh");
        body.push(0);
        let station = fake_station(
            "HTTP/1.0 200 OK\r\nContent-Type: audio/aacp\r\nicy-metaint: 4\r\n\r\n",
            body,
        )
        .await;
        let (sink, events) = collecting_sink();
        let info = start("test", sink).await.unwrap();
        let res = reqwest::get(proxied(&info, "/stream", &station, &info.token))
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        assert_eq!(res.headers()[CONTENT_TYPE], "audio/aacp");
        assert_eq!(&res.bytes().await.unwrap()[..], b"abcdefgh");
        assert_eq!(
            *events.lock().unwrap(),
            [TitleEvent {
                session: "session-1".into(),
                title: "Artist - Song".into()
            }]
        );
    }

    #[tokio::test]
    async fn passes_streams_without_metadata_through() {
        let station = fake_station(
            "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n",
            b"rawaudio".to_vec(),
        )
        .await;
        let (sink, events) = collecting_sink();
        let info = start("test", sink).await.unwrap();
        let res = reqwest::get(proxied(&info, "/stream", &station, &info.token))
            .await
            .unwrap();
        assert_eq!(res.headers()[CONTENT_TYPE], "audio/mpeg");
        assert_eq!(&res.bytes().await.unwrap()[..], b"rawaudio");
        assert!(events.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn rejects_wrong_token_and_foreign_schemes() {
        let (sink, _) = collecting_sink();
        let info = start("test", sink).await.unwrap();
        let wrong = reqwest::get(proxied(&info, "/stream", "http://example.org/", "nope")).await;
        assert_eq!(wrong.unwrap().status(), 403);
        for target in ["file:///etc/passwd", "javascript:alert(1)", "not a url"] {
            let res = reqwest::get(proxied(&info, "/stream", target, &info.token))
                .await
                .unwrap();
            assert_eq!(res.status(), 400, "{target}");
        }
    }

    #[tokio::test]
    async fn reports_unreachable_stations_as_bad_gateway() {
        let (sink, _) = collecting_sink();
        let info = start("test", sink).await.unwrap();
        // Port 9 (discard) on loopback is closed on CI machines and developer laptops.
        let res = reqwest::get(proxied(
            &info,
            "/stream",
            "http://127.0.0.1:9/",
            &info.token,
        ))
        .await
        .unwrap();
        assert_eq!(res.status(), 502);
    }

    #[tokio::test]
    async fn serves_raster_logos_but_not_svg() {
        let png = fake_station("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 4\r\nConnection: close\r\n\r\n", b"\x89PNG".to_vec()).await;
        let svg = fake_station("HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\nContent-Length: 6\r\nConnection: close\r\n\r\n", b"<svg/>".to_vec()).await;
        let (sink, _) = collecting_sink();
        let info = start("test", sink).await.unwrap();
        let res = reqwest::get(proxied(&info, "/logo", &png, &info.token))
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        assert_eq!(&res.bytes().await.unwrap()[..], b"\x89PNG");
        let res = reqwest::get(proxied(&info, "/logo", &svg, &info.token))
            .await
            .unwrap();
        assert_eq!(res.status(), 404);
    }
}
