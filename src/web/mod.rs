//! Local web interface (`osu-collect web`).
//!
//! Serves a single-page app from memory on `127.0.0.1` and exposes a small JSON
//! API backed by the same download pipeline the TUI uses. Live run progress is
//! pushed to the browser over Server-Sent Events.
//!
//! Every `/api` request must carry the per-launch session token and a loopback
//! `Host` header, so other websites open in the browser cannot drive the API.

mod settings;
mod state;

use crate::config::{Config, save_config};
use crate::core::collection::Collection;
use crate::download::{self, DownloadEvent, DownloadId, DownloadRequest};
use crate::osu_db::BeatmapReader;
use crate::utils::{expand_tilde, parse_collection_id};
use axum::{
    Json, Router,
    extract::{Path as AxPath, Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use settings::SettingsDto;
use state::{RunSnapshot, RunState};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tracing::{info, warn};

const INDEX_HTML: &str = include_str!("assets/index.html");
const APP_CSS: &str = include_str!("assets/app.css");
const APP_JS: &str = include_str!("assets/app.js");
const ICONS_JS: &str = include_str!("assets/icons.js");
const LOGO_SVG: &str = include_str!("assets/logo.svg");

const DEFAULT_PORT: u16 = 7270;
const COLLECTOR_BASE: &str = "https://osucollector.com/api/collections";

/// Options for `osu-collect web`.
#[derive(Debug, Clone)]
pub struct WebArgs {
    pub port: u16,
    pub open_browser: bool,
}

impl Default for WebArgs {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            open_browser: true,
        }
    }
}

struct Inner {
    token: String,
    config: RwLock<Config>,
    runs: Mutex<Vec<RunState>>,
    next_id: Mutex<DownloadId>,
    collections: Mutex<HashMap<u32, Collection>>,
    events_tx: mpsc::UnboundedSender<DownloadEvent>,
    updates: broadcast::Sender<String>,
    http: reqwest::Client,
    collector: osu_downloader::collection::CollectionClient,
}

type Shared = Arc<Inner>;

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
}

fn err(status: StatusCode, message: impl Into<String>) -> Response {
    (
        status,
        Json(ApiError {
            error: message.into(),
        }),
    )
        .into_response()
}

/// Start the web UI and block until Ctrl+C.
pub async fn run(config: Config, args: WebArgs) -> Result<(), Box<dyn std::error::Error>> {
    let (events_tx, events_rx) = mpsc::unbounded_channel();
    let (updates, _) = broadcast::channel(256);
    let http = reqwest::Client::builder()
        .user_agent(concat!("osu-collect/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .build()?;

    let inner = Arc::new(Inner {
        token: session_token(),
        config: RwLock::new(config),
        runs: Mutex::new(Vec::new()),
        next_id: Mutex::new(1),
        collections: Mutex::new(HashMap::new()),
        events_tx,
        updates,
        http,
        collector: osu_downloader::collection::CollectionClient::new(),
    });

    tokio::spawn(event_loop(inner.clone(), events_rx));

    let api = Router::new()
        .route("/info", get(api_info))
        .route("/settings", get(api_get_settings).put(api_put_settings))
        .route("/collections/{input}", get(api_collection))
        .route("/collections/{id}/maps", get(api_collection_maps))
        .route("/downloads", get(api_downloads).post(api_start_download))
        .route("/downloads/{id}/cancel", post(api_cancel_download))
        .route("/downloads/{id}/dismiss", post(api_dismiss_download))
        .route("/events", get(api_events))
        .route("/fs", get(api_fs))
        .route("/open", post(api_open))
        .layer(middleware::from_fn_with_state(inner.clone(), guard));

    let app = Router::new()
        .route("/", get(index))
        .route("/app.css", get(|| async { asset(APP_CSS, "text/css") }))
        .route(
            "/app.js",
            get(|| async { asset(APP_JS, "text/javascript") }),
        )
        .route(
            "/icons.js",
            get(|| async { asset(ICONS_JS, "text/javascript") }),
        )
        .route(
            "/logo.svg",
            get(|| async { asset(LOGO_SVG, "image/svg+xml") }),
        )
        .nest("/api", api)
        .with_state(inner.clone());

    let listener = bind(args.port).await?;
    let addr = listener.local_addr()?;
    let url = format!("http://127.0.0.1:{}/", addr.port());
    info!(%url, "web ui listening");
    println!("osu!collect web UI running at {url}");
    println!("press Ctrl+C to stop");
    if args.open_browser {
        open_path(&url);
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;

    // Ask any still-running download to stop cleanly before exiting.
    if let Ok(runs) = inner.runs.lock() {
        for run in runs.iter() {
            if let Some(handle) = &run.handle {
                handle.request_shutdown();
            }
        }
    }
    Ok(())
}

/// Bind the preferred port, falling back to an OS-assigned one when taken.
async fn bind(port: u16) -> std::io::Result<tokio::net::TcpListener> {
    let preferred = SocketAddr::from(([127, 0, 0, 1], port));
    match tokio::net::TcpListener::bind(preferred).await {
        Ok(listener) => Ok(listener),
        Err(e) => {
            warn!(error = %e, port, "preferred port unavailable, using a random one");
            tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await
        }
    }
}

fn session_token() -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    hasher.update(nanos.to_le_bytes());
    hasher.update(std::process::id().to_le_bytes());
    let stack_marker = 0u8;
    hasher.update((&stack_marker as *const u8 as usize).to_le_bytes());
    if let Ok(dir) = std::env::current_dir() {
        hasher.update(dir.to_string_lossy().as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .take(16)
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn asset(body: &'static str, mime: &'static str) -> Response {
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static(mime)),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        ],
        body,
    )
        .into_response()
}

fn host_is_loopback(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(header::HOST).and_then(|h| h.to_str().ok()) else {
        return false;
    };
    let name = host.rsplit_once(':').map_or(host, |(name, _)| name);
    matches!(name, "127.0.0.1" | "localhost" | "[::1]")
}

async fn index(State(inner): State<Shared>, headers: HeaderMap) -> Response {
    if !host_is_loopback(&headers) {
        return err(StatusCode::FORBIDDEN, "forbidden host");
    }
    let html = INDEX_HTML.replace("__SESSION_TOKEN__", &inner.token);
    (
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        html,
    )
        .into_response()
}

#[derive(Deserialize)]
struct TokenQuery {
    t: Option<String>,
}

async fn guard(
    State(inner): State<Shared>,
    Query(query): Query<TokenQuery>,
    request: Request,
    next: Next,
) -> Response {
    if !host_is_loopback(request.headers()) {
        return err(StatusCode::FORBIDDEN, "forbidden host");
    }
    let header_token = request
        .headers()
        .get("x-osu-collect-token")
        .and_then(|v| v.to_str().ok());
    let ok = header_token == Some(inner.token.as_str())
        || query.t.as_deref() == Some(inner.token.as_str());
    if !ok {
        return err(StatusCode::UNAUTHORIZED, "missing or invalid session token");
    }
    next.run(request).await
}

/// Folds pipeline events into run state and broadcasts dirty snapshots at a
/// steady cadence so the browser never gets flooded by per-chunk progress.
async fn event_loop(inner: Shared, mut rx: mpsc::UnboundedReceiver<DownloadEvent>) {
    let mut tick = tokio::time::interval(Duration::from_millis(300));
    let mut speed_tick = 0u8;
    loop {
        tokio::select! {
            event = rx.recv() => {
                let Some(event) = event else { break };
                let id = event_id(&event);
                if let Ok(mut runs) = inner.runs.lock()
                    && let Some(run) = runs.iter_mut().find(|r| r.id == id)
                {
                    run.apply(event);
                }
            }
            _ = tick.tick() => {
                speed_tick = speed_tick.wrapping_add(1);
                let mut payloads = Vec::new();
                if let Ok(mut runs) = inner.runs.lock() {
                    for run in runs.iter_mut() {
                        if speed_tick.is_multiple_of(3) {
                            run.sample_speed();
                        }
                        if run.dirty {
                            run.dirty = false;
                            if let Ok(json) = serde_json::to_string(&run.snapshot()) {
                                payloads.push(json);
                            }
                        }
                    }
                }
                for payload in payloads {
                    let _ = inner.updates.send(payload);
                }
            }
        }
    }
}

fn event_id(event: &DownloadEvent) -> DownloadId {
    match event {
        DownloadEvent::CollectionReady { id, .. }
        | DownloadEvent::ResolveProgress { id, .. }
        | DownloadEvent::CollectionSizeResolved { id, .. }
        | DownloadEvent::LowDiskSpace { id, .. }
        | DownloadEvent::VerifiedMapSizes { id, .. }
        | DownloadEvent::BeatmapProgress { id, .. }
        | DownloadEvent::DownloadTarget { id, .. }
        | DownloadEvent::BeatmapStatus { id, .. }
        | DownloadEvent::OverallProgress { id, .. }
        | DownloadEvent::StageChanged { id, .. }
        | DownloadEvent::FailedMaps { id, .. }
        | DownloadEvent::SkippedImported { id, .. }
        | DownloadEvent::CollectionsUnresolved { id, .. }
        | DownloadEvent::BeatmapVerified { id, .. }
        | DownloadEvent::BeatmapDeferred { id, .. }
        | DownloadEvent::Finished { id, .. }
        | DownloadEvent::Failed { id, .. } => *id,
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct InfoDto {
    version: &'static str,
    config_path: Option<String>,
}

async fn api_info() -> Json<InfoDto> {
    Json(InfoDto {
        version: env!("CARGO_PKG_VERSION"),
        config_path: crate::config::config_path().map(|p| p.to_string_lossy().into_owned()),
    })
}

async fn api_get_settings(State(inner): State<Shared>) -> Response {
    let Ok(config) = inner.config.read() else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "config lock poisoned");
    };
    Json(SettingsDto::from_config(&config)).into_response()
}

async fn api_put_settings(State(inner): State<Shared>, Json(dto): Json<SettingsDto>) -> Response {
    let mut next = match inner.config.read() {
        Ok(config) => config.clone(),
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "config lock poisoned"),
    };
    dto.apply_to(&mut next);
    if let Err(e) = next.validate() {
        return err(StatusCode::BAD_REQUEST, e.to_string());
    }
    let saved = tokio::task::spawn_blocking({
        let next = next.clone();
        move || save_config(&next)
    })
    .await;
    match saved {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
    let dto = SettingsDto::from_config(&next);
    if let Ok(mut config) = inner.config.write() {
        *config = next;
    }
    Json(dto).into_response()
}

#[derive(Serialize)]
struct CollectionDto {
    id: u32,
    name: String,
    description: Option<String>,
    uploader: String,
    uploader_id: u32,
    favourites: u32,
    beatmapset_ids: Vec<u32>,
    beatmap_count: usize,
}

impl From<&Collection> for CollectionDto {
    fn from(c: &Collection) -> Self {
        Self {
            id: c.id,
            name: c.name.clone(),
            description: c.description.clone().filter(|d| !d.trim().is_empty()),
            uploader: c.uploader.username.clone(),
            uploader_id: c.uploader.id,
            favourites: c.favourites,
            beatmapset_ids: c.beatmapset_ids(),
            beatmap_count: c.beatmap_count(),
        }
    }
}

async fn api_collection(State(inner): State<Shared>, AxPath(input): AxPath<String>) -> Response {
    let id = match parse_collection_id(input.trim()) {
        Ok(id) => id,
        Err(_) => {
            return err(
                StatusCode::BAD_REQUEST,
                "That doesn't look like an osu!collector link or collection ID",
            );
        }
    };
    if let Some(cached) = inner
        .collections
        .lock()
        .ok()
        .and_then(|c| c.get(&id).cloned())
    {
        return Json(CollectionDto::from(&cached)).into_response();
    }
    match inner.collector.fetch_retrying(id, 2).await {
        Ok(collection) => {
            let dto = CollectionDto::from(&collection);
            if let Ok(mut cache) = inner.collections.lock() {
                cache.insert(id, collection);
            }
            Json(dto).into_response()
        }
        Err(e) => err(
            StatusCode::BAD_GATEWAY,
            format!("Could not load collection #{id}: {e}"),
        ),
    }
}

#[derive(Deserialize)]
struct MapsQuery {
    cursor: Option<String>,
}

#[derive(Serialize)]
struct MapDto {
    set_id: u32,
    artist: String,
    title: String,
    creator: String,
    version: String,
    stars: f64,
    mode: String,
    status: String,
}

#[derive(Serialize)]
struct MapsPage {
    maps: Vec<MapDto>,
    next_cursor: Option<String>,
}

/// Best-effort beatmap metadata from osu!collector, used to decorate the
/// collection preview with titles. Failures degrade to an empty page.
async fn api_collection_maps(
    State(inner): State<Shared>,
    AxPath(id): AxPath<u32>,
    Query(query): Query<MapsQuery>,
) -> Response {
    let mut url = format!("{COLLECTOR_BASE}/{id}/beatmapsv2?perPage=50");
    if let Some(cursor) = query.cursor.as_deref().filter(|c| !c.is_empty()) {
        if !cursor
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            return err(StatusCode::BAD_REQUEST, "invalid cursor");
        }
        url.push_str("&cursor=");
        url.push_str(cursor);
    }
    let response = match inner.http.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            return err(
                StatusCode::BAD_GATEWAY,
                format!("osu!collector answered {}", r.status()),
            );
        }
        Err(e) => return err(StatusCode::BAD_GATEWAY, e.to_string()),
    };
    let value: serde_json::Value = match response.json().await {
        Ok(v) => v,
        Err(e) => return err(StatusCode::BAD_GATEWAY, e.to_string()),
    };
    Json(parse_maps_page(&value)).into_response()
}

fn parse_maps_page(value: &serde_json::Value) -> MapsPage {
    let str_of = |v: &serde_json::Value, key: &str| {
        v.get(key)
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string()
    };
    let maps = value
        .get("beatmaps")
        .and_then(|b| b.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|b| {
                    let set = b.get("beatmapset").cloned().unwrap_or_default();
                    let set_id = b
                        .get("beatmapset_id")
                        .and_then(|v| v.as_u64())
                        .or_else(|| set.get("id").and_then(|v| v.as_u64()))?;
                    Some(MapDto {
                        set_id: u32::try_from(set_id).ok()?,
                        artist: str_of(&set, "artist"),
                        title: str_of(&set, "title"),
                        creator: str_of(&set, "creator"),
                        version: str_of(b, "version"),
                        stars: b
                            .get("difficulty_rating")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0),
                        mode: str_of(b, "mode"),
                        status: str_of(b, "status"),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let has_more = value
        .get("hasMore")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let next_cursor = value.get("nextPageCursor").and_then(|v| match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    });
    MapsPage {
        maps,
        next_cursor: if has_more { next_cursor } else { None },
    }
}

async fn api_downloads(State(inner): State<Shared>) -> Response {
    let Ok(runs) = inner.runs.lock() else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "state lock poisoned");
    };
    let list: Vec<RunSnapshot> = runs.iter().map(RunState::snapshot).collect();
    Json(list).into_response()
}

#[derive(Deserialize)]
struct StartDownload {
    collection: String,
    directory: Option<String>,
}

async fn api_start_download(
    State(inner): State<Shared>,
    Json(body): Json<StartDownload>,
) -> Response {
    let input = body.collection.trim().to_string();
    let collection_id = match parse_collection_id(&input) {
        Ok(id) => id,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid collection link or ID"),
    };

    let config = match inner.config.read() {
        Ok(c) => c.clone(),
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "config lock poisoned"),
    };

    let directory = body
        .directory
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(expand_tilde)
        .unwrap_or_else(|| settings::default_directory(&config));

    let mirrors = settings::build_mirrors(&config);
    if mirrors.is_empty() {
        return err(
            StatusCode::BAD_REQUEST,
            "Enable at least one mirror in Settings",
        );
    }

    if let Ok(runs) = inner.runs.lock()
        && runs
            .iter()
            .any(|r| r.is_running() && r.collection_id == Some(collection_id))
    {
        return err(
            StatusCode::CONFLICT,
            "This collection is already downloading",
        );
    }

    if let Err(e) = std::fs::create_dir_all(&directory) {
        return err(
            StatusCode::BAD_REQUEST,
            format!("Cannot create folder {directory}: {e}"),
        );
    }

    let prefetched = inner
        .collections
        .lock()
        .ok()
        .and_then(|c| c.get(&collection_id).cloned());
    let label = prefetched
        .as_ref()
        .map(|c| c.name.clone())
        .unwrap_or_else(|| format!("Collection #{collection_id}"));

    let osu_client = config.recent.osu_client.unwrap_or_default();
    let osu_path = config
        .recent
        .osu_path
        .clone()
        .map(|p| expand_tilde(&p))
        .unwrap_or_else(|| settings::detect_osu_path(osu_client));

    let request = DownloadRequest {
        collection_input: input.clone(),
        config: download::DownloadConfig {
            directory: directory.clone(),
            mirrors,
            concurrent: config.download.resolved_concurrent(),
            archive_validation: config.download.archive_validation,
            auto_skip_rate_limited: config.download.auto_skip_rate_limited,
            rate_limit_skip_secs: config.download.rate_limit_skip_secs,
        },
        auto_overwrite: false,
        previously_failed_skipped: HashSet::new(),
        skip_already_imported: config.download.skip_already_imported && !osu_path.is_empty(),
        osu_client,
        osu_path,
        prefetched,
    };

    let id = {
        let Ok(mut next) = inner.next_id.lock() else {
            return err(StatusCode::INTERNAL_SERVER_ERROR, "state lock poisoned");
        };
        let id = *next;
        *next += 1;
        id
    };

    let mut run = RunState::new(id, Some(collection_id), label, directory.clone());
    run.handle = Some(download::spawn_download(
        id,
        request,
        inner.events_tx.clone(),
    ));
    let snapshot = run.snapshot();
    if let Ok(mut runs) = inner.runs.lock() {
        runs.push(run);
    }

    // Remember the inputs, like the TUI home form does.
    if let Ok(mut cfg) = inner.config.write() {
        cfg.recent.collection = Some(input);
        cfg.recent.directory = Some(directory);
        let to_save = cfg.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = save_config(&to_save) {
                warn!(error = %e, "failed to persist recent inputs");
            }
        });
    }

    (StatusCode::CREATED, Json(snapshot)).into_response()
}

async fn api_cancel_download(
    State(inner): State<Shared>,
    AxPath(id): AxPath<DownloadId>,
) -> Response {
    let Ok(mut runs) = inner.runs.lock() else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "state lock poisoned");
    };
    let Some(run) = runs.iter_mut().find(|r| r.id == id) else {
        return err(StatusCode::NOT_FOUND, "unknown download");
    };
    if let Some(handle) = &run.handle {
        handle.request_shutdown();
    }
    run.mark_cancelled();
    Json(run.snapshot()).into_response()
}

async fn api_dismiss_download(
    State(inner): State<Shared>,
    AxPath(id): AxPath<DownloadId>,
) -> Response {
    let Ok(mut runs) = inner.runs.lock() else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "state lock poisoned");
    };
    if runs.iter().any(|r| r.id == id && r.is_running()) {
        return err(StatusCode::CONFLICT, "stop the download before removing it");
    }
    runs.retain(|r| r.id != id);
    StatusCode::NO_CONTENT.into_response()
}

async fn api_events(
    State(inner): State<Shared>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let rx = inner.updates.subscribe();
    let stream = futures_util::stream::unfold(rx, |mut rx| async move {
        let event = match rx.recv().await {
            Ok(payload) => Event::default().event("run").data(payload),
            // Missed updates: tell the page to refetch the full list.
            Err(broadcast::error::RecvError::Lagged(_)) => {
                Event::default().event("resync").data("{}")
            }
            Err(broadcast::error::RecvError::Closed) => return None,
        };
        Some((Ok(event), rx))
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[derive(Deserialize)]
struct FsQuery {
    path: Option<String>,
}

#[derive(Serialize)]
struct FsEntry {
    name: String,
    path: String,
}

#[derive(Serialize)]
struct FsListing {
    path: String,
    display: String,
    parent: Option<String>,
    dirs: Vec<FsEntry>,
    shortcuts: Vec<FsEntry>,
}

/// Lists sub-folders of `path` for the in-app folder picker.
async fn api_fs(Query(query): Query<FsQuery>) -> Response {
    let requested = query
        .path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(expand_tilde)
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("/"));

    let listing = tokio::task::spawn_blocking(move || list_dirs(&requested)).await;
    match listing {
        Ok(Ok(listing)) => Json(listing).into_response(),
        Ok(Err(e)) => err(StatusCode::BAD_REQUEST, e.to_string()),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

fn list_dirs(path: &Path) -> std::io::Result<FsListing> {
    let path = path.canonicalize()?;
    let mut dirs: Vec<FsEntry> = std::fs::read_dir(&path)?
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            (!name.starts_with('.')).then(|| FsEntry {
                path: e.path().to_string_lossy().into_owned(),
                name,
            })
        })
        .collect();
    dirs.sort_by_key(|e| e.name.to_lowercase());

    let mut shortcuts = Vec::new();
    let mut push = |name: &str, p: Option<PathBuf>| {
        if let Some(p) = p.filter(|p| p.is_dir()) {
            shortcuts.push(FsEntry {
                name: name.to_string(),
                path: p.to_string_lossy().into_owned(),
            });
        }
    };
    push("Home", dirs::home_dir());
    push("Downloads", dirs::download_dir());
    push("Desktop", dirs::desktop_dir());
    push("Documents", dirs::document_dir());
    push(
        "osu! Songs",
        crate::osu_db::StableReader::default_path().map(|p| p.join("Songs")),
    );

    Ok(FsListing {
        display: crate::utils::pretty_path(&path).into_owned(),
        path: path.to_string_lossy().into_owned(),
        parent: path.parent().map(|p| p.to_string_lossy().into_owned()),
        dirs,
        shortcuts,
    })
}

#[derive(Deserialize)]
struct OpenBody {
    path: String,
}

async fn api_open(Json(body): Json<OpenBody>) -> Response {
    let path = PathBuf::from(expand_tilde(body.path.trim()));
    if !path.is_dir() {
        return err(StatusCode::BAD_REQUEST, "folder does not exist");
    }
    open_path(&path.to_string_lossy());
    StatusCode::NO_CONTENT.into_response()
}

/// Open a URL or folder with the platform's default handler.
fn open_path(target: &str) {
    use std::process::{Command, Stdio};
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(target);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    if let Err(e) = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        warn!(error = %e, target, "could not open with the system handler");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_collector_maps_page() {
        let value = serde_json::json!({
            "hasMore": true,
            "nextPageCursor": 42,
            "beatmaps": [{
                "beatmapset_id": 1,
                "version": "Insane",
                "difficulty_rating": 4.5,
                "mode": "osu",
                "status": "ranked",
                "beatmapset": { "id": 1, "artist": "A", "title": "T", "creator": "C" }
            }, { "nothing": true }]
        });
        let page = parse_maps_page(&value);
        assert_eq!(page.maps.len(), 1);
        assert_eq!(page.maps[0].title, "T");
        assert_eq!(page.next_cursor.as_deref(), Some("42"));
    }

    #[test]
    fn loopback_host_check() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:7270"));
        assert!(host_is_loopback(&headers));
        headers.insert(header::HOST, HeaderValue::from_static("evil.example:7270"));
        assert!(!host_is_loopback(&headers));
    }
}
