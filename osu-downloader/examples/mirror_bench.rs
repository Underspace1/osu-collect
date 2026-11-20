//! Offline mirror benchmark.
//!
//! Starts three local fake mirrors with different per-connection speeds, lists
//! the slowest one first (the worst case for a naive "first mirror wins"
//! scheduler), downloads a batch of synthetic beatmapsets through them, and
//! prints the wall time, the throughput and which mirror served each map.
//!
//! ```text
//! cargo run --release --manifest-path osu-downloader/Cargo.toml --example mirror_bench -- [threads] [maps]
//! ```

use futures_util::StreamExt;
use osu_downloader::{ArchiveValidation, Downloader, Event, Mirror, OnExists};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const MAP_BYTES: usize = 2 * 1024 * 1024;
const CHUNK: usize = 16 * 1024;
const LATENCY: Duration = Duration::from_millis(40);

/// A fake mirror that serves every request at `bytes_per_sec` per connection.
/// `served` counts archives it delivered in full.
async fn spawn_mirror(bytes_per_sec: usize, served: Arc<AtomicU32>) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            let served = served.clone();
            tokio::spawn(async move {
                // Serve keep-alive requests until the client hangs up.
                let mut buf = vec![0u8; 4096];
                loop {
                    let n = match sock.read(&mut buf).await {
                        Ok(0) | Err(_) => return,
                        Ok(n) => n,
                    };
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let id = req
                        .split_whitespace()
                        .nth(1)
                        .and_then(|p| p.rsplit('/').next())
                        .unwrap_or("0")
                        .to_string();
                    tokio::time::sleep(LATENCY).await;
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {MAP_BYTES}\r\nContent-Disposition: attachment; filename={id}.osz\r\n\r\n"
                    );
                    if sock.write_all(head.as_bytes()).await.is_err() {
                        return;
                    }
                    let chunk = vec![b'P'; CHUNK];
                    let per_chunk = Duration::from_secs_f64(CHUNK as f64 / bytes_per_sec as f64);
                    let mut sent = 0;
                    while sent < MAP_BYTES {
                        let n = CHUNK.min(MAP_BYTES - sent);
                        if sock.write_all(&chunk[..n]).await.is_err() {
                            return;
                        }
                        sent += n;
                        tokio::time::sleep(per_chunk).await;
                    }
                    served.fetch_add(1, Ordering::Relaxed);
                }
            });
        }
    });
    port
}

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let threads: usize = args.next().and_then(|a| a.parse().ok()).unwrap_or(8);
    let maps: u32 = args.next().and_then(|a| a.parse().ok()).unwrap_or(40);

    let speeds = [
        ("slow", 300 * 1024),
        ("fast", 4 * 1024 * 1024),
        ("medium", 1536 * 1024),
    ];
    let mut counters = Vec::new();
    let mut mirrors = Vec::new();
    for (name, speed) in speeds {
        let served = Arc::new(AtomicU32::new(0));
        let port = spawn_mirror(speed, served.clone()).await;
        counters.push((name, served));
        mirrors.push(Mirror::custom(format!("http://127.0.0.1:{port}/d/{{id}}")).unwrap());
    }

    let dir = tempfile::tempdir().unwrap();
    let downloader = Downloader::builder()
        .mirrors(mirrors)
        .concurrent_downloads(threads)
        .archive_validation(ArchiveValidation::Off)
        .on_exists(OnExists::Overwrite)
        .build()
        .unwrap();
    let started = Instant::now();
    let mut session = downloader.download_many((1..=maps).collect::<Vec<u32>>(), dir.path());
    let mut events = session.events().unwrap();
    while let Some(event) = events.next().await {
        if matches!(event, Event::SessionCompleted { .. }) {
            break;
        }
    }
    drop(events);
    let summary = session.wait().await.unwrap();
    let secs = started.elapsed().as_secs_f64();
    let mb = summary.total_bytes as f64 / 1_048_576.0;
    let served: BTreeMap<&str, u32> = counters
        .iter()
        .map(|(n, c)| (*n, c.load(Ordering::Relaxed)))
        .collect();
    println!(
        "threads={threads} maps={maps} downloaded={} failed={} time={secs:.1}s throughput={:.2} MiB/s served={served:?}",
        summary.downloaded.len(),
        summary.failed.len(),
        mb / secs
    );
}
