# Privacy

SysRadio does not collect, store or send personal data to the SysRadio project. There is no
account, no analytics, no tracking and no advertising.

Your favorites, history and settings are stored only on your device, in SysRadio's app data
folder. Uninstalling SysRadio and deleting that folder removes them.

## Connections SysRadio makes

To work, SysRadio connects to these services. As with any internet connection, they can see
your IP address.

| Service                                                                  | When                                                                 | What is sent                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [radio-browser.info](https://www.radio-browser.info) (station directory) | when you search, open filters or start SysRadio with favorites       | your search terms and filters; the IDs of stations you start, which the directory counts to rank popular stations |
| The radio stations themselves                                            | when you play a station                                              | a normal request for the stream and the station's logo                                                            |
| GitHub (`github.com`, `api.github.com`)                                  | on start and every six hours, and when you click "Check for updates" | a request for the latest version; when you update, the download                                                   |
| Stream addresses you add yourself                                        | when you add or play them                                            | a normal request for the stream                                                                                   |

Automatic update checks can be turned off under Settings ("Check for updates automatically").

The privacy policies of these services apply to them, not this document.

## Logs

SysRadio writes a local log file for troubleshooting (on Windows in
`%LOCALAPPDATA%\de.syssteve.sysradio\logs`, on macOS in `~/Library/Logs/de.syssteve.sysradio`).
It stays on your device and is never sent anywhere.

## Contact

Questions: open an [issue](https://github.com/SysSteve/sysradio/issues).
