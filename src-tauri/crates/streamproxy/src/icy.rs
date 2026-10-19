//! ICY (Shoutcast/Icecast) metadata: a server that is asked with `Icy-MetaData: 1` and answers
//! with an `icy-metaint: N` header inserts a metadata block after every N audio bytes. The block
//! starts with one length byte (times 16) and holds text such as `StreamTitle='Artist - Song';`.

/// Splits an ICY stream into audio bytes and metadata blocks. Chunks may be cut anywhere.
pub struct IcyDemuxer {
    metaint: usize,
    state: State,
}

enum State {
    Audio { remaining: usize },
    Length,
    Meta { buf: Vec<u8>, remaining: usize },
}

impl IcyDemuxer {
    /// `metaint` is the value of the `icy-metaint` header and must be greater than zero.
    pub fn new(metaint: usize) -> Self {
        assert!(metaint > 0, "icy-metaint must be positive");
        Self {
            metaint,
            state: State::Audio { remaining: metaint },
        }
    }

    /// Appends the audio part of `input` to `audio` and returns every metadata block that was
    /// completed by this chunk (usually none or one).
    pub fn feed(&mut self, mut input: &[u8], audio: &mut Vec<u8>) -> Vec<Vec<u8>> {
        let mut blocks = Vec::new();
        loop {
            match &mut self.state {
                State::Audio { remaining } => {
                    if *remaining == 0 {
                        self.state = State::Length;
                        continue;
                    }
                    if input.is_empty() {
                        break;
                    }
                    let n = (*remaining).min(input.len());
                    audio.extend_from_slice(&input[..n]);
                    *remaining -= n;
                    input = &input[n..];
                }
                State::Length => {
                    let Some((&len, rest)) = input.split_first() else {
                        break;
                    };
                    input = rest;
                    let len = usize::from(len) * 16;
                    self.state = if len == 0 {
                        State::Audio {
                            remaining: self.metaint,
                        }
                    } else {
                        State::Meta {
                            buf: Vec::with_capacity(len),
                            remaining: len,
                        }
                    };
                }
                State::Meta { buf, remaining } => {
                    if input.is_empty() {
                        break;
                    }
                    let n = (*remaining).min(input.len());
                    buf.extend_from_slice(&input[..n]);
                    *remaining -= n;
                    input = &input[n..];
                    if *remaining == 0 {
                        blocks.push(std::mem::take(buf));
                        self.state = State::Audio {
                            remaining: self.metaint,
                        };
                    }
                }
            }
        }
        blocks
    }
}

/// Reads `StreamTitle` from a metadata block. Returns `None` when the block has no title at
/// all and `Some("")` when the station cleared it. Titles are UTF-8 or, on older servers,
/// Windows-1252.
pub fn stream_title(block: &[u8]) -> Option<String> {
    let end = block.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
    let block = &block[..end];
    let text = match std::str::from_utf8(block) {
        Ok(s) => s.to_owned(),
        Err(_) => encoding_rs::WINDOWS_1252.decode(block).0.into_owned(),
    };
    const KEY: &str = "StreamTitle='";
    let start = text.find(KEY)? + KEY.len();
    let rest = &text[start..];
    // The value ends at `';` (next field or end); titles themselves may contain apostrophes.
    let value = match rest.find("';") {
        Some(i) => &rest[..i],
        None => rest.strip_suffix('\'').unwrap_or(rest),
    };
    Some(clean(value))
}

/// Collapses whitespace and drops control characters, so a title fits a tray tooltip.
fn clean(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(text: &str) -> Vec<u8> {
        let mut data = text.as_bytes().to_vec();
        data.resize(data.len().div_ceil(16) * 16, 0);
        let mut out = vec![(data.len() / 16) as u8];
        out.extend(data);
        out
    }

    fn stream(metaint: usize, parts: &[(&[u8], Option<&str>)]) -> Vec<u8> {
        let mut out = Vec::new();
        for (audio, meta) in parts {
            assert_eq!(audio.len(), metaint);
            out.extend_from_slice(audio);
            match meta {
                Some(text) => out.extend(block(text)),
                None => out.push(0),
            }
        }
        out
    }

    #[test]
    fn splits_audio_and_metadata_for_any_chunk_size() {
        let data = stream(
            4,
            &[
                (b"aaaa", Some("StreamTitle='One';")),
                (b"bbbb", None),
                (b"cccc", Some("StreamTitle='Two';StreamUrl='';")),
            ],
        );
        for chunk in 1..=data.len() {
            let mut demux = IcyDemuxer::new(4);
            let mut audio = Vec::new();
            let mut titles = Vec::new();
            for part in data.chunks(chunk) {
                for b in demux.feed(part, &mut audio) {
                    titles.push(stream_title(&b).unwrap());
                }
            }
            assert_eq!(audio, b"aaaabbbbcccc", "chunk size {chunk}");
            assert_eq!(titles, ["One", "Two"], "chunk size {chunk}");
        }
    }

    #[test]
    fn reads_titles_with_apostrophes_and_trailing_fields() {
        assert_eq!(
            stream_title(b"StreamTitle='Guns N' Roses - Don't Cry';StreamUrl='x';\0\0").as_deref(),
            Some("Guns N' Roses - Don't Cry")
        );
        assert_eq!(
            stream_title(b"StreamTitle='No semicolon'").as_deref(),
            Some("No semicolon")
        );
    }

    #[test]
    fn empty_and_missing_titles() {
        assert_eq!(stream_title(b"StreamTitle='';\0").as_deref(), Some(""));
        assert_eq!(stream_title(b"StreamUrl='https://example.org';"), None);
        assert_eq!(stream_title(b"\0\0\0"), None);
    }

    #[test]
    fn decodes_windows_1252_and_cleans_whitespace() {
        // "Mötley Crüe" in Windows-1252, with a tab and double spaces.
        let raw = b"StreamTitle='M\xf6tley  Cr\xfce\t- Home';";
        assert_eq!(stream_title(raw).as_deref(), Some("Mötley Crüe - Home"));
        assert_eq!(
            stream_title("StreamTitle='Björk – Jóga';".as_bytes()).as_deref(),
            Some("Björk – Jóga")
        );
    }
}
