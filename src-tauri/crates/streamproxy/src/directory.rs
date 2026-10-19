//! Client for the community station directory radio-browser.info. The API runs on several
//! mirrors; the list comes from `all.api.radio-browser.info` and requests fail over to the next
//! mirror. The API asks clients for a speaking User-Agent and a click call when a station is
//! played (it powers the popularity ranking).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

/// Mirrors used when the server list cannot be fetched.
const FALLBACK_SERVERS: [&str; 3] = [
    "de1.api.radio-browser.info",
    "fi1.api.radio-browser.info",
    "de2.api.radio-browser.info",
];

/// A station as the app uses it (camelCase towards the frontend).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub id: String,
    pub name: String,
    pub url: String,
    pub homepage: String,
    pub favicon: String,
    pub tags: Vec<String>,
    pub country: String,
    pub country_code: String,
    pub language: String,
    pub codec: String,
    pub bitrate: u32,
}

/// The raw station record of the API (only the fields we need).
#[derive(Debug, Deserialize)]
struct ApiStation {
    stationuuid: String,
    name: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    url_resolved: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    favicon: String,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    countrycode: String,
    #[serde(default)]
    language: String,
    #[serde(default)]
    codec: String,
    #[serde(default)]
    bitrate: u32,
    #[serde(default)]
    hls: u8,
}

impl ApiStation {
    /// HLS streams need playlist handling the player does not have yet; they are left out.
    fn into_station(self) -> Option<Station> {
        let url = if self.url_resolved.is_empty() {
            self.url
        } else {
            self.url_resolved
        };
        let playable = url.starts_with("http://") || url.starts_with("https://");
        if self.hls != 0 || !playable || url.contains(".m3u8") {
            return None;
        }
        Some(Station {
            id: self.stationuuid,
            name: self.name.trim().to_owned(),
            url,
            homepage: self.homepage,
            favicon: self.favicon,
            tags: self
                .tags
                .split(',')
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(str::to_owned)
                .collect(),
            country: self.country,
            country_code: self.countrycode.to_uppercase(),
            language: self.language,
            codec: self.codec,
            bitrate: self.bitrate,
        })
    }
}

/// Search parameters; empty strings mean "no filter".
#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Search {
    pub name: String,
    pub tag: String,
    pub country_code: String,
    pub limit: u32,
    pub offset: u32,
}

impl Search {
    /// Path and query for `/json/stations/search`, most popular first.
    pub fn path(&self) -> String {
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        for (key, value) in [
            ("name", &self.name),
            ("tag", &self.tag),
            ("countrycode", &self.country_code),
        ] {
            let value = value.trim();
            if !value.is_empty() {
                query.append_pair(key, value);
            }
        }
        if !self.tag.trim().is_empty() {
            query.append_pair("tagExact", "false");
        }
        let limit = if self.limit == 0 {
            50
        } else {
            self.limit.min(200)
        };
        query
            .append_pair("limit", &limit.to_string())
            .append_pair("offset", &self.offset.to_string())
            .append_pair("hidebroken", "true")
            .append_pair("order", "clickcount")
            .append_pair("reverse", "true");
        format!("/json/stations/search?{}", query.finish())
    }
}

#[derive(Debug)]
pub enum DirectoryError {
    /// No mirror answered.
    Unreachable(String),
}

impl std::fmt::Display for DirectoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DirectoryError::Unreachable(e) => write!(f, "station directory unreachable: {e}"),
        }
    }
}

impl std::error::Error for DirectoryError {}

pub struct Directory {
    http: reqwest::Client,
    servers: Mutex<Vec<String>>,
}

impl Directory {
    pub fn new(user_agent: &str) -> Self {
        crate::init_tls();
        let http = reqwest::Client::builder()
            .user_agent(user_agent)
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .build()
            .expect("http client");
        Self {
            http,
            servers: Mutex::new(Vec::new()),
        }
    }

    pub async fn search(&self, search: &Search) -> Result<Vec<Station>, DirectoryError> {
        let list: Vec<ApiStation> = self.get(&search.path()).await?;
        Ok(list
            .into_iter()
            .filter_map(ApiStation::into_station)
            .collect())
    }

    /// Current data for known stations (favourites), in the order of `ids`.
    pub async fn by_ids(&self, ids: &[String]) -> Result<Vec<Station>, DirectoryError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("uuids", &ids.join(","))
            .finish();
        let list: Vec<ApiStation> = self.get(&format!("/json/stations/byuuid?{query}")).await?;
        let mut stations: Vec<Station> = list
            .into_iter()
            .filter_map(ApiStation::into_station)
            .collect();
        stations.sort_by_key(|s| ids.iter().position(|id| *id == s.id));
        Ok(stations)
    }

    /// Tells the directory that a station was played. Failures do not matter.
    pub async fn click(&self, id: &str) {
        let path = format!(
            "/json/url/{}",
            url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>()
        );
        if let Err(e) = self.get::<serde_json::Value>(&path).await {
            log::debug!("click not counted: {e}");
        }
    }

    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, DirectoryError> {
        let servers = self.servers().await;
        let mut last_error = String::from("no servers");
        for (i, server) in servers.iter().enumerate() {
            match self.fetch(server, path).await {
                Ok(value) => {
                    if i > 0 {
                        // Keep using the mirror that answered.
                        let mut list = self.servers.lock().unwrap();
                        list.retain(|s| s != server);
                        list.insert(0, server.clone());
                    }
                    return Ok(value);
                }
                Err(e) => {
                    log::warn!("{server} failed: {e}");
                    last_error = e.to_string();
                }
            }
        }
        Err(DirectoryError::Unreachable(last_error))
    }

    async fn fetch<T: serde::de::DeserializeOwned>(
        &self,
        server: &str,
        path: &str,
    ) -> Result<T, reqwest::Error> {
        self.http
            .get(format!("https://{server}{path}"))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    async fn servers(&self) -> Vec<String> {
        {
            let list = self.servers.lock().unwrap();
            if !list.is_empty() {
                return list.clone();
            }
        }
        #[derive(Deserialize)]
        struct Server {
            name: String,
        }
        let fetched: Vec<String> = match self
            .fetch::<Vec<Server>>("all.api.radio-browser.info", "/json/servers")
            .await
        {
            Ok(list) => list.into_iter().map(|s| s.name).collect(),
            Err(e) => {
                log::warn!("server list unavailable: {e}");
                Vec::new()
            }
        };
        let mut list = shuffled(dedupe(fetched));
        for server in FALLBACK_SERVERS {
            if !list.iter().any(|s| s == server) {
                list.push(server.to_owned());
            }
        }
        *self.servers.lock().unwrap() = list.clone();
        list
    }
}

fn dedupe(mut list: Vec<String>) -> Vec<String> {
    list.sort();
    list.dedup();
    list
}

/// Spreads load over the mirrors, as the API asks.
fn shuffled(mut list: Vec<String>) -> Vec<String> {
    use rand::seq::SliceRandom;
    list.shuffle(&mut rand::rng());
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_path_only_contains_set_filters() {
        let search = Search {
            name: " Bayern 3 ".into(),
            country_code: "DE".into(),
            ..Default::default()
        };
        assert_eq!(
            search.path(),
            "/json/stations/search?name=Bayern+3&countrycode=DE&limit=50&offset=0&hidebroken=true&order=clickcount&reverse=true"
        );
        let search = Search {
            tag: "jazz".into(),
            limit: 999,
            ..Default::default()
        };
        assert!(search.path().contains("tag=jazz&tagExact=false&limit=200&"));
    }

    #[test]
    fn maps_api_records_and_drops_unplayable_ones() {
        let json = r#"[
          {"stationuuid":"a","name":" Radio A ","url":"http://a/pls","url_resolved":"http://a/stream",
           "favicon":"https://a/icon.png","tags":"pop, rock,,","countrycode":"de","codec":"MP3","bitrate":128,"hls":0},
          {"stationuuid":"b","name":"HLS","url_resolved":"https://b/live.m3u8","hls":1},
          {"stationuuid":"c","name":"No URL","url":"","url_resolved":""}
        ]"#;
        let list: Vec<ApiStation> = serde_json::from_str(json).unwrap();
        let stations: Vec<Station> = list
            .into_iter()
            .filter_map(ApiStation::into_station)
            .collect();
        assert_eq!(stations.len(), 1);
        let a = &stations[0];
        assert_eq!(
            (a.name.as_str(), a.url.as_str()),
            ("Radio A", "http://a/stream")
        );
        assert_eq!(a.tags, ["pop", "rock"]);
        assert_eq!(a.country_code, "DE");
        assert_eq!(serde_json::to_value(a).unwrap()["countryCode"], "DE");
    }
}
