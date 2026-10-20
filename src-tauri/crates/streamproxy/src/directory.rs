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

/// Sort orders the search offers; anything else falls back to popularity.
const ORDERS: [&str; 5] = ["clickcount", "votes", "clicktrend", "bitrate", "name"];

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
    /// HTTP Live Streaming (`.m3u8` playlist instead of one continuous stream).
    #[serde(default)]
    pub hls: bool,
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
    #[serde(default)]
    clickcount: i64,
    #[serde(default)]
    votes: i64,
    #[serde(default)]
    clicktrend: i64,
}

impl ApiStation {
    /// Sort key for merging results of several countries (higher first).
    fn rank(&self, order: &str) -> i64 {
        match order {
            "votes" => self.votes,
            "clicktrend" => self.clicktrend,
            "bitrate" => i64::from(self.bitrate),
            _ => self.clickcount,
        }
    }

    fn into_station(self) -> Option<Station> {
        let url = if self.url_resolved.is_empty() {
            self.url
        } else {
            self.url_resolved
        };
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return None;
        }
        let hls = self.hls != 0 || url.to_ascii_lowercase().contains(".m3u8");
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
            hls,
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
    /// Several countries at once (a region); overrides `country_code`.
    pub country_codes: Vec<String>,
    /// Language name as the directory spells it, e.g. `german`.
    pub language: String,
    /// One of [`ORDERS`]; empty or unknown means most popular first.
    pub order: String,
    pub limit: u32,
    pub offset: u32,
}

impl Search {
    /// Path and query for `/json/stations/search`.
    pub fn path(&self) -> String {
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        for (key, value) in [
            ("name", &self.name),
            ("tag", &self.tag),
            ("countrycode", &self.country_code),
            ("language", &self.language),
        ] {
            let value = value.trim();
            if !value.is_empty() {
                query.append_pair(key, value);
            }
        }
        if !self.tag.trim().is_empty() {
            query.append_pair("tagExact", "false");
        }
        if !self.language.trim().is_empty() {
            query.append_pair("languageExact", "true");
        }
        let order = ORDERS
            .iter()
            .find(|o| **o == self.order)
            .copied()
            .unwrap_or("clickcount");
        let limit = if self.limit == 0 {
            50
        } else {
            self.limit.min(200)
        };
        query
            .append_pair("limit", &limit.to_string())
            .append_pair("offset", &self.offset.to_string())
            .append_pair("hidebroken", "true")
            .append_pair("order", order)
            // Names A–Z, everything else highest first.
            .append_pair("reverse", if order == "name" { "false" } else { "true" });
        format!("/json/stations/search?{}", query.finish())
    }
}

/// A filter value with its station count (countries, languages).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Facet {
    /// Value for the search (`DE` for countries, `german` for languages).
    pub value: String,
    /// ISO code for localised names (`DE`, `de`); may be empty for languages.
    pub code: String,
    /// The directory's English name, used when no localised name exists.
    pub name: String,
    pub count: u32,
}

#[derive(Debug, Deserialize)]
struct ApiCountry {
    name: String,
    #[serde(default)]
    iso_3166_1: String,
    #[serde(default)]
    stationcount: u32,
}

#[derive(Debug, Deserialize)]
struct ApiLanguage {
    name: String,
    #[serde(default)]
    iso_639: Option<String>,
    #[serde(default)]
    stationcount: u32,
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
    countries: Mutex<Option<Vec<Facet>>>,
    languages: Mutex<Option<Vec<Facet>>>,
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
            countries: Mutex::new(None),
            languages: Mutex::new(None),
        }
    }

    pub async fn search(&self, search: &Search) -> Result<Vec<Station>, DirectoryError> {
        let codes: Vec<String> = search
            .country_codes
            .iter()
            .map(|c| c.trim().to_uppercase())
            .filter(|c| c.len() == 2)
            .collect();
        if codes.len() < 2 {
            let mut single = search.clone();
            if let Some(code) = codes.into_iter().next() {
                single.country_code = code;
            }
            let list: Vec<ApiStation> = self.get(&single.path()).await?;
            return Ok(list
                .into_iter()
                .filter_map(ApiStation::into_station)
                .collect());
        }
        // A region: ask every country for enough results to fill the requested page, then
        // merge them in the requested order. Countries that fail are left out.
        let limit = if search.limit == 0 {
            50
        } else {
            search.limit.min(200)
        };
        let per_country = (search.offset + limit).min(200);
        let requests = codes.iter().map(|code| {
            let one = Search {
                country_code: code.clone(),
                country_codes: Vec::new(),
                offset: 0,
                limit: per_country,
                ..search.clone()
            };
            async move { self.get::<Vec<ApiStation>>(&one.path()).await }
        });
        let results = futures_util::future::join_all(requests).await;
        if results.iter().all(Result::is_err) {
            return Err(results
                .into_iter()
                .find_map(Result::err)
                .unwrap_or(DirectoryError::Unreachable("no countries".into())));
        }
        let lists = results.into_iter().filter_map(Result::ok).collect();
        Ok(merge(lists, &search.order, search.offset, limit))
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

    /// Countries with working stations, most stations first. Cached for the session.
    pub async fn countries(&self) -> Result<Vec<Facet>, DirectoryError> {
        if let Some(list) = self.countries.lock().unwrap().clone() {
            return Ok(list);
        }
        let list: Vec<ApiCountry> = self
            .get("/json/countries?hidebroken=true&order=stationcount&reverse=true")
            .await?;
        let facets = country_facets(list);
        *self.countries.lock().unwrap() = Some(facets.clone());
        Ok(facets)
    }

    /// Languages with at least a few stations, most stations first. Cached for the session.
    pub async fn languages(&self) -> Result<Vec<Facet>, DirectoryError> {
        if let Some(list) = self.languages.lock().unwrap().clone() {
            return Ok(list);
        }
        let list: Vec<ApiLanguage> = self
            .get("/json/languages?hidebroken=true&order=stationcount&reverse=true")
            .await?;
        let facets = language_facets(list);
        *self.languages.lock().unwrap() = Some(facets.clone());
        Ok(facets)
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

/// Merges per-country results: sorted by `order`, duplicates removed, one page cut out.
fn merge(lists: Vec<Vec<ApiStation>>, order: &str, offset: u32, limit: u32) -> Vec<Station> {
    let mut all: Vec<ApiStation> = lists.into_iter().flatten().collect();
    if order == "name" {
        all.sort_by_key(|s| s.name.trim().to_lowercase());
    } else {
        all.sort_by_key(|s| std::cmp::Reverse(s.rank(order)));
    }
    let mut seen = std::collections::HashSet::new();
    all.into_iter()
        .filter(|s| seen.insert(s.stationuuid.clone()))
        .filter_map(ApiStation::into_station)
        .skip(offset as usize)
        .take(limit as usize)
        .collect()
}

/// Real countries only (two-letter code), merged when the directory lists one twice.
fn country_facets(list: Vec<ApiCountry>) -> Vec<Facet> {
    let mut facets: Vec<Facet> = Vec::new();
    for c in list {
        let code = c.iso_3166_1.trim().to_uppercase();
        if code.len() != 2 || !code.chars().all(|ch| ch.is_ascii_alphabetic()) {
            continue;
        }
        match facets.iter_mut().find(|f| f.code == code) {
            Some(f) => f.count += c.stationcount,
            None => facets.push(Facet {
                value: code.clone(),
                code,
                name: c.name,
                count: c.stationcount,
            }),
        }
    }
    facets.sort_by_key(|f| std::cmp::Reverse(f.count));
    facets
}

/// Languages with at least 5 stations; the long tail is mostly typos.
fn language_facets(list: Vec<ApiLanguage>) -> Vec<Facet> {
    let mut facets: Vec<Facet> = list
        .into_iter()
        .filter(|l| l.stationcount >= 5 && !l.name.trim().is_empty())
        .map(|l| Facet {
            value: l.name.trim().to_owned(),
            code: l.iso_639.unwrap_or_default().trim().to_lowercase(),
            name: l.name.trim().to_owned(),
            count: l.stationcount,
        })
        .collect();
    facets.sort_by_key(|f| std::cmp::Reverse(f.count));
    facets
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
    fn search_path_language_and_order() {
        let search = Search {
            language: "german".into(),
            order: "name".into(),
            ..Default::default()
        };
        let path = search.path();
        assert!(path.contains("language=german&languageExact=true"));
        assert!(path.ends_with("order=name&reverse=false"));
        let unknown = Search {
            order: "drop table".into(),
            ..Default::default()
        };
        assert!(unknown.path().ends_with("order=clickcount&reverse=true"));
    }

    #[test]
    fn maps_api_records_and_marks_hls() {
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
        assert_eq!(stations.len(), 2);
        let a = &stations[0];
        assert_eq!(
            (a.name.as_str(), a.url.as_str(), a.hls),
            ("Radio A", "http://a/stream", false)
        );
        assert_eq!(a.tags, ["pop", "rock"]);
        assert_eq!(a.country_code, "DE");
        assert_eq!(serde_json::to_value(a).unwrap()["countryCode"], "DE");
        assert!(stations[1].hls);
    }

    fn api(id: &str, name: &str, clicks: i64) -> ApiStation {
        serde_json::from_value(serde_json::json!({
            "stationuuid": id, "name": name, "url_resolved": format!("https://x/{id}"), "clickcount": clicks
        }))
        .unwrap()
    }

    #[test]
    fn merges_region_results_by_rank_and_pages() {
        let ec = vec![api("a", "Radio Quito", 50), api("b", "Ecuador FM", 10)];
        let co = vec![api("c", "Bogotá Stereo", 30), api("a", "Radio Quito", 50)];
        let ids = |v: Vec<Station>| v.into_iter().map(|s| s.id).collect::<Vec<_>>();
        assert_eq!(
            ids(merge(vec![ec, co], "clickcount", 0, 10)),
            ["a", "c", "b"]
        );
        let ec = vec![api("a", "Radio Quito", 50), api("b", "Ecuador FM", 10)];
        let co = vec![api("c", "Bogotá Stereo", 30)];
        assert_eq!(ids(merge(vec![ec, co], "name", 1, 1)), ["b"]);
    }

    #[test]
    fn facets_skip_junk_and_merge_duplicates() {
        let countries = vec![
            ApiCountry {
                name: "Germany".into(),
                iso_3166_1: "DE".into(),
                stationcount: 10,
            },
            ApiCountry {
                name: "Deutschland".into(),
                iso_3166_1: "de".into(),
                stationcount: 5,
            },
            ApiCountry {
                name: "?".into(),
                iso_3166_1: "".into(),
                stationcount: 99,
            },
            ApiCountry {
                name: "Austria".into(),
                iso_3166_1: "AT".into(),
                stationcount: 20,
            },
        ];
        let facets = country_facets(countries);
        assert_eq!(
            facets
                .iter()
                .map(|f| (f.code.as_str(), f.count))
                .collect::<Vec<_>>(),
            [("AT", 20), ("DE", 15)]
        );
        let languages = vec![
            ApiLanguage {
                name: "german".into(),
                iso_639: Some("de".into()),
                stationcount: 50,
            },
            ApiLanguage {
                name: "typo".into(),
                iso_639: None,
                stationcount: 2,
            },
        ];
        let facets = language_facets(languages);
        assert_eq!(facets.len(), 1);
        assert_eq!(
            (facets[0].value.as_str(), facets[0].code.as_str()),
            ("german", "de")
        );
    }
}
