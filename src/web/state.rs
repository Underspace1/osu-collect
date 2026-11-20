//! Server-side view of the download runs started from the web UI.
//!
//! The download pipeline emits [`DownloadEvent`]s on an mpsc channel; a single
//! consumer task folds them into [`RunState`]s here. The SSE endpoint then
//! serialises the dirty runs as compact [`RunSnapshot`]s for the browser.

use crate::download::{BeatmapStage, DownloadEvent, DownloadHandle, DownloadId, DownloadStage};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// How many finished maps each snapshot carries for the "recent" list.
const RECENT_CAP: usize = 40;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Pending,
    Resolving,
    Rechecking,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

impl From<DownloadStage> for Stage {
    fn from(stage: DownloadStage) -> Self {
        match stage {
            DownloadStage::Pending => Self::Pending,
            DownloadStage::Resolving => Self::Resolving,
            DownloadStage::Rechecking => Self::Rechecking,
            DownloadStage::Downloading => Self::Downloading,
            DownloadStage::Completed => Self::Completed,
            DownloadStage::Failed => Self::Failed,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MapStage {
    Pending,
    Downloading,
    Verifying,
    Success,
    Skipped,
    Failed,
    Aborted,
}

impl From<BeatmapStage> for MapStage {
    fn from(stage: BeatmapStage) -> Self {
        match stage {
            BeatmapStage::Pending => Self::Pending,
            BeatmapStage::Downloading => Self::Downloading,
            BeatmapStage::Verifying => Self::Verifying,
            BeatmapStage::Success => Self::Success,
            BeatmapStage::Skipped => Self::Skipped,
            BeatmapStage::Failed => Self::Failed,
            BeatmapStage::Aborted => Self::Aborted,
        }
    }
}

impl MapStage {
    fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Success | Self::Skipped | Self::Failed | Self::Aborted
        )
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MapSnapshot {
    pub id: u32,
    pub stage: MapStage,
    pub message: String,
    pub downloaded: u64,
    pub total: u64,
    pub rate_limited: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FailureSnapshot {
    pub id: u32,
    pub title: Option<String>,
    pub reason: &'static str,
}

/// Everything the browser needs to render one run card.
#[derive(Debug, Clone, Serialize)]
pub struct RunSnapshot {
    pub id: DownloadId,
    pub collection_id: Option<u32>,
    pub name: String,
    pub uploader: String,
    pub output_dir: String,
    pub stage: Stage,
    pub total: usize,
    pub downloaded: u32,
    pub skipped: u32,
    pub failed: u32,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub speed: f64,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub resolve: Option<(u32, u32)>,
    pub active: Vec<MapSnapshot>,
    pub recent: Vec<MapSnapshot>,
    pub failures: Vec<FailureSnapshot>,
}

struct MapState {
    stage: MapStage,
    message: String,
    downloaded: u64,
    total: u64,
    rate_limited: bool,
}

impl MapState {
    fn snapshot(&self, id: u32) -> MapSnapshot {
        MapSnapshot {
            id,
            stage: self.stage,
            message: self.message.clone(),
            downloaded: self.downloaded,
            total: self.total,
            rate_limited: self.rate_limited,
        }
    }
}

pub struct RunState {
    pub id: DownloadId,
    pub collection_id: Option<u32>,
    name: String,
    uploader: String,
    output_dir: String,
    stage: Stage,
    total: usize,
    downloaded: u32,
    skipped: u32,
    failed: u32,
    bytes_total: u64,
    /// Bytes of maps that reached a terminal success.
    bytes_completed: u64,
    started_at: u64,
    finished_at: Option<u64>,
    error: Option<String>,
    notice: Option<String>,
    resolve: Option<(u32, u32)>,
    maps: HashMap<u32, MapState>,
    recent: VecDeque<u32>,
    failures: Vec<FailureSnapshot>,
    speed: f64,
    last_speed_sample: Option<(Instant, u64)>,
    pub handle: Option<DownloadHandle>,
    pub dirty: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl RunState {
    pub fn new(id: DownloadId, collection_id: Option<u32>, label: String, dir: String) -> Self {
        Self {
            id,
            collection_id,
            name: label,
            uploader: String::new(),
            output_dir: dir,
            stage: Stage::Pending,
            total: 0,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            bytes_total: 0,
            bytes_completed: 0,
            started_at: now_ms(),
            finished_at: None,
            error: None,
            notice: None,
            resolve: None,
            maps: HashMap::new(),
            recent: VecDeque::new(),
            failures: Vec::new(),
            speed: 0.0,
            last_speed_sample: None,
            handle: None,
            dirty: true,
        }
    }

    pub fn is_running(&self) -> bool {
        !matches!(
            self.stage,
            Stage::Completed | Stage::Failed | Stage::Cancelled
        )
    }

    pub fn mark_cancelled(&mut self) {
        if self.is_running() {
            self.stage = Stage::Cancelled;
            self.finished_at = Some(now_ms());
            self.dirty = true;
        }
    }

    fn bytes_done(&self) -> u64 {
        let in_flight: u64 = self
            .maps
            .values()
            .filter(|m| !m.stage.is_terminal())
            .map(|m| m.downloaded)
            .sum();
        self.bytes_completed + in_flight
    }

    /// Refresh the exponentially smoothed transfer speed. Called on each tick.
    pub fn sample_speed(&mut self) {
        if !self.is_running() {
            if self.speed != 0.0 {
                self.speed = 0.0;
                self.dirty = true;
            }
            return;
        }
        let now = Instant::now();
        let done = self.bytes_done();
        if let Some((at, prev)) = self.last_speed_sample {
            let dt = now.duration_since(at).as_secs_f64();
            if dt > 0.0 {
                let instant = done.saturating_sub(prev) as f64 / dt;
                self.speed = if self.speed == 0.0 {
                    instant
                } else {
                    self.speed * 0.7 + instant * 0.3
                };
                self.dirty = true;
            }
        }
        self.last_speed_sample = Some((now, done));
    }

    fn finish_map(&mut self, id: u32) {
        self.recent.retain(|&r| r != id);
        self.recent.push_front(id);
        while self.recent.len() > RECENT_CAP {
            if let Some(old) = self.recent.pop_back() {
                // Keep memory bounded on huge collections: forget the details of
                // finished maps that fell out of the recent window.
                if self.maps.get(&old).is_some_and(|m| m.stage.is_terminal()) {
                    self.maps.remove(&old);
                }
            }
        }
    }

    pub fn apply(&mut self, event: DownloadEvent) {
        self.dirty = true;
        match event {
            DownloadEvent::CollectionReady {
                collection_name,
                uploader,
                total_maps,
                output_dir,
                ..
            } => {
                self.name = collection_name;
                self.uploader = uploader;
                self.total = total_maps;
                self.output_dir = output_dir;
            }
            DownloadEvent::ResolveProgress { current, total, .. } => {
                self.resolve = Some((current, total));
            }
            DownloadEvent::CollectionSizeResolved { total_bytes, .. }
            | DownloadEvent::VerifiedMapSizes { total_bytes, .. } => {
                self.bytes_total = total_bytes;
            }
            DownloadEvent::LowDiskSpace {
                available_bytes, ..
            } => {
                self.notice = Some(format!(
                    "Low disk space: {} MB left on the target drive",
                    available_bytes / 1_048_576
                ));
            }
            DownloadEvent::BeatmapProgress {
                beatmapset_id,
                downloaded,
                total,
                ..
            } => {
                let map = self.maps.entry(beatmapset_id).or_insert(MapState {
                    stage: MapStage::Downloading,
                    message: String::new(),
                    downloaded: 0,
                    total: 0,
                    rate_limited: false,
                });
                map.downloaded = downloaded;
                if total > 0 {
                    map.total = total;
                }
                if !map.stage.is_terminal() {
                    map.stage = MapStage::Downloading;
                }
            }
            DownloadEvent::DownloadTarget { remaining, .. } => {
                if self.total == 0 {
                    self.total = remaining;
                }
            }
            DownloadEvent::BeatmapStatus {
                beatmapset_id,
                stage,
                message,
                rate_limited,
                ..
            } => {
                let stage = MapStage::from(stage);
                let map = self.maps.entry(beatmapset_id).or_insert(MapState {
                    stage,
                    message: String::new(),
                    downloaded: 0,
                    total: 0,
                    rate_limited: false,
                });
                map.stage = stage;
                map.message = message;
                map.rate_limited = rate_limited;
                if stage.is_terminal() {
                    if stage == MapStage::Success {
                        let size = map.total.max(map.downloaded);
                        self.bytes_completed += size;
                    }
                    self.finish_map(beatmapset_id);
                }
            }
            DownloadEvent::OverallProgress {
                downloaded,
                skipped,
                failed,
                ..
            } => {
                self.downloaded = downloaded;
                self.skipped = skipped;
                self.failed = failed;
            }
            DownloadEvent::StageChanged { stage, .. } => {
                if self.stage != Stage::Cancelled {
                    self.stage = stage.into();
                }
                if matches!(self.stage, Stage::Downloading) {
                    self.resolve = None;
                }
            }
            DownloadEvent::FailedMaps { failures, .. } => {
                self.failures = failures
                    .into_iter()
                    .map(|f| FailureSnapshot {
                        id: f.beatmapset_id,
                        title: f.title,
                        reason: f.reason.label(),
                    })
                    .collect();
            }
            DownloadEvent::SkippedImported { count, .. } => {
                self.notice = Some(format!(
                    "{count} map{} already in your osu! library — skipped",
                    if count == 1 { "" } else { "s" }
                ));
            }
            DownloadEvent::CollectionsUnresolved { count, .. } => {
                self.notice = Some(format!("{count} collection(s) could not be resolved"));
            }
            DownloadEvent::BeatmapVerified { .. } => {}
            DownloadEvent::BeatmapDeferred { beatmapset_id, .. } => {
                if let Some(map) = self.maps.get_mut(&beatmapset_id) {
                    map.stage = MapStage::Pending;
                    map.message = "waiting for a free mirror".to_string();
                }
            }
            DownloadEvent::Finished { summary, .. } => {
                self.downloaded = summary.downloaded;
                self.skipped = summary.skipped;
                self.failed = summary.failed;
                if self.stage != Stage::Cancelled {
                    self.stage = Stage::Completed;
                }
                self.finished_at = Some(now_ms());
                self.handle = None;
            }
            DownloadEvent::Failed { message, .. } => {
                if self.stage != Stage::Cancelled {
                    self.stage = Stage::Failed;
                    self.error = Some(message);
                }
                self.finished_at = Some(now_ms());
                self.handle = None;
            }
        }
    }

    pub fn snapshot(&self) -> RunSnapshot {
        let mut active: Vec<MapSnapshot> = self
            .maps
            .iter()
            .filter(|(_, m)| !m.stage.is_terminal() && m.stage != MapStage::Pending)
            .map(|(&id, m)| m.snapshot(id))
            .collect();
        active.sort_by_key(|m| m.id);
        let recent = self
            .recent
            .iter()
            .filter_map(|id| self.maps.get(id).map(|m| m.snapshot(*id)))
            .collect();
        RunSnapshot {
            id: self.id,
            collection_id: self.collection_id,
            name: self.name.clone(),
            uploader: self.uploader.clone(),
            output_dir: self.output_dir.clone(),
            stage: self.stage,
            total: self.total,
            downloaded: self.downloaded,
            skipped: self.skipped,
            failed: self.failed,
            bytes_total: self.bytes_total,
            bytes_done: self.bytes_done(),
            speed: self.speed,
            started_at: self.started_at,
            finished_at: self.finished_at,
            error: self.error.clone(),
            notice: self.notice.clone(),
            resolve: self.resolve,
            active,
            recent,
            failures: self.failures.clone(),
        }
    }
}
