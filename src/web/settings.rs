//! Settings exchanged with the web UI, mapped onto the shared `config.toml`.

use crate::config::{Config, constants::default_threads};
use crate::download::ArchiveValidation;
use crate::mirrors::{Mirror, MirrorKind};
use crate::osu_db::{BeatmapReader, LazerReader, OsuClient, StableReader};
use crate::utils::expand_tilde;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorDto {
    /// Stable key: the mirror host (matches `mirror.order` in the config).
    pub key: String,
    #[serde(default)]
    pub label: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsDto {
    /// Built-in mirrors in try-order.
    pub mirrors: Vec<MirrorDto>,
    pub custom_mirrors: Vec<String>,
    /// `None` = automatic thread count.
    pub threads: Option<u8>,
    #[serde(default)]
    pub default_threads: u8,
    pub video: bool,
    pub archive_validation: ArchiveValidation,
    pub skip_already_imported: bool,
    pub auto_skip_rate_limited: bool,
    pub rate_limit_skip_secs: u32,
    pub osu_client: OsuClient,
    pub osu_path: Option<String>,
    #[serde(default)]
    pub detected_osu_path: String,
    pub directory: Option<String>,
    #[serde(default)]
    pub default_directory: String,
    /// Last collection link typed in (read-only for the UI).
    #[serde(default)]
    pub recent_collection: Option<String>,
}

/// Mirrors offered in the web UI. The official osu! API needs an OAuth login,
/// which only the TUI handles, so it is left out here.
fn web_mirror(kind: MirrorKind) -> bool {
    !matches!(kind, MirrorKind::OsuApi | MirrorKind::Custom)
}

fn enabled_flag(config: &mut Config, kind: MirrorKind) -> Option<&mut bool> {
    let m = &mut config.mirror;
    Some(match kind {
        MirrorKind::Nerinyan => &mut m.nerinyan,
        MirrorKind::OsuDirect => &mut m.osu_direct,
        MirrorKind::Sayobot => &mut m.sayobot,
        MirrorKind::Nekoha => &mut m.nekoha,
        MirrorKind::Beatconnect => &mut m.beatconnect,
        MirrorKind::Osudl => &mut m.osudl,
        MirrorKind::Catboy => &mut m.catboy,
        MirrorKind::Hinamizawa => &mut m.hinamizawa,
        MirrorKind::Nzbasic => &mut m.nzbasic,
        MirrorKind::OsuApi => &mut m.osu_official,
        MirrorKind::Custom => return None,
    })
}

fn is_enabled(config: &Config, kind: MirrorKind) -> bool {
    let m = &config.mirror;
    match kind {
        MirrorKind::Nerinyan => m.nerinyan,
        MirrorKind::OsuDirect => m.osu_direct,
        MirrorKind::Sayobot => m.sayobot,
        MirrorKind::Nekoha => m.nekoha,
        MirrorKind::Beatconnect => m.beatconnect,
        MirrorKind::Osudl => m.osudl,
        MirrorKind::Catboy => m.catboy,
        MirrorKind::Hinamizawa => m.hinamizawa,
        MirrorKind::Nzbasic => m.nzbasic,
        MirrorKind::OsuApi => m.osu_official,
        MirrorKind::Custom => false,
    }
}

pub fn detect_osu_path(client: OsuClient) -> String {
    match client {
        OsuClient::Stable => StableReader::default_path(),
        OsuClient::Lazer => LazerReader::default_path(),
    }
    .map(|p| p.to_string_lossy().into_owned())
    .unwrap_or_default()
}

pub fn default_directory(config: &Config) -> String {
    config
        .recent
        .directory
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(expand_tilde)
        .or_else(|| {
            dirs::download_dir()
                .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
                .map(|d| d.join("osu-collect").to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| ".".to_string())
}

/// Download mirror list in configured order, honouring the video toggle.
pub fn build_mirrors(config: &Config) -> Vec<Mirror> {
    let video = config.download.video;
    let mut mirrors: Vec<Mirror> = config
        .mirror
        .ordered_builtins()
        .into_iter()
        .filter(|&kind| web_mirror(kind) && is_enabled(config, kind))
        .filter_map(Mirror::builtin)
        .map(|m| if video { m } else { m.no_video() })
        .collect();
    mirrors.extend(
        config
            .mirror
            .custom_templates()
            .into_iter()
            .filter_map(|t| Mirror::custom(t).ok())
            .map(|m| if video { m } else { m.no_video() }),
    );
    mirrors
}

impl SettingsDto {
    pub fn from_config(config: &Config) -> Self {
        let mirrors = config
            .mirror
            .ordered_builtins()
            .into_iter()
            .filter(|&kind| web_mirror(kind))
            .map(|kind| MirrorDto {
                key: kind.host().to_string(),
                label: kind.label().to_string(),
                enabled: is_enabled(config, kind),
            })
            .collect();
        let osu_client = config.recent.osu_client.unwrap_or_default();
        Self {
            mirrors,
            custom_mirrors: config
                .mirror
                .custom_templates()
                .into_iter()
                .map(String::from)
                .collect(),
            threads: config.download.concurrent,
            default_threads: default_threads(),
            video: config.download.video,
            archive_validation: config.download.archive_validation,
            skip_already_imported: config.download.skip_already_imported,
            auto_skip_rate_limited: config.download.auto_skip_rate_limited,
            rate_limit_skip_secs: config.download.rate_limit_skip_secs,
            osu_client,
            osu_path: config.recent.osu_path.clone(),
            detected_osu_path: detect_osu_path(osu_client),
            directory: config.recent.directory.clone(),
            default_directory: default_directory(config),
            recent_collection: config.recent.collection.clone(),
        }
    }

    pub fn apply_to(&self, config: &mut Config) {
        // Order: keys the UI sent first, then whatever it left out (osu! API).
        let mut order: Vec<Box<str>> = Vec::new();
        for dto in &self.mirrors {
            let Some(kind) = MirrorKind::BUILTINS
                .iter()
                .copied()
                .find(|k| k.host() == dto.key && web_mirror(*k))
            else {
                continue;
            };
            if let Some(flag) = enabled_flag(config, kind) {
                *flag = dto.enabled;
            }
            order.push(Box::from(kind.host()));
        }
        for kind in config.mirror.ordered_builtins() {
            if !order.iter().any(|k| k.as_ref() == kind.host()) {
                order.push(Box::from(kind.host()));
            }
        }
        config.mirror.order = order;
        config.mirror.url = None;
        config.mirror.urls = self
            .custom_mirrors
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(Box::from)
            .collect();

        config.download.concurrent = self.threads.filter(|&n| n > 0).map(|n| n.min(100));
        config.download.video = self.video;
        config.download.archive_validation = self.archive_validation;
        config.download.skip_already_imported = self.skip_already_imported;
        config.download.auto_skip_rate_limited = self.auto_skip_rate_limited;
        config.download.rate_limit_skip_secs = self.rate_limit_skip_secs.clamp(1, 3600);

        config.recent.osu_client = Some(self.osu_client);
        config.recent.osu_path = self
            .osu_path
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(String::from);
        config.recent.directory = self
            .directory
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(String::from);
    }
}
