import { execFile, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Storage } from '../../storage/s3';
import { videoKeys } from './playlist';

const execFileAsync = promisify(execFile);

/** Heights the ladder offers; a rendition is never taller than the source. */
const LADDER = [
  { height: 360, bandwidth: 900_000 },
  { height: 720, bandwidth: 2_800_000 },
  { height: 1080, bandwidth: 5_000_000 },
] as const;

const SEGMENT_SECONDS = 6;

/** The file is not a video ffmpeg can read. Retrying would not help. */
export class UnreadableVideoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableVideoError';
  }
}

export interface VideoProbe {
  width: number;
  height: number;
  /** Null when the container reports none (browser-recorded WebM, for one); it is measured later. */
  durationSeconds: number | null;
}

export interface Rendition {
  name: string;
  height: number;
  bandwidth: number;
}

/** Reads size and duration with ffprobe. */
export async function probeVideo(file: string): Promise<VideoProbe> {
  let output: string;
  try {
    ({ stdout: output } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      file,
    ]));
  } catch (error) {
    // ffprobe exits non-zero for files it cannot parse; a missing binary is a deployment bug
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
    throw new UnreadableVideoError('The file is not a video that can be read');
  }
  const info = JSON.parse(output) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
    format?: { duration?: string };
  };
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height) {
    throw new UnreadableVideoError('The file has no playable video stream');
  }
  // ffprobe prints "N/A" when it does not know: the stream may still say, otherwise it stays null
  const known = [info.format?.duration, video.duration].map(Number).find((n) => n > 0);
  // ponytail: rotation metadata (phone videos) is not read; renditions keep the stored size
  return { width: video.width, height: video.height, durationSeconds: known ?? null };
}

/** Length of an HLS playlist: the sum of its segment durations. */
export function playlistDurationSeconds(playlist: string): number {
  return [...playlist.matchAll(/^#EXTINF:([\d.]+)/gm)].reduce(
    (total, match) => total + Number(match[1]),
    0,
  );
}

/** Renditions to produce: every ladder step up to the source height, or one at the source height. */
export function chooseRenditions(sourceHeight: number): Rendition[] {
  const steps = LADDER.filter((step) => step.height <= sourceHeight);
  if (steps.length === 0) {
    const height = Math.max(2, sourceHeight - (sourceHeight % 2));
    return [{ name: `${height}p`, height, bandwidth: LADDER[0].bandwidth }];
  }
  return steps.map((step) => ({ name: `${step.height}p`, ...step }));
}

/** The master playlist; renditions are listed from the lowest, which players start with. */
export function buildMasterPlaylist(probe: VideoProbe, renditions: Rendition[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const rendition of renditions) {
    const width = Math.max(2, Math.round((rendition.height * probe.width) / probe.height / 2) * 2);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${width}x${rendition.height}`,
      `${rendition.name}/index.m3u8`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args]);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // only the tail matters in an error message
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/** Encodes one rendition as VOD HLS with fixed-length segments. */
async function encodeRendition(
  source: string,
  rendition: Rendition,
  outputDir: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await runFfmpeg([
    '-y',
    '-i',
    source,
    '-vf',
    `scale=-2:${rendition.height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    // a keyframe at every segment start keeps the renditions aligned, so players can switch between them
    '-force_key_frames',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-sc_threshold',
    '0',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, 'segment_%05d.ts'),
    path.join(outputDir, 'index.m3u8'),
  ]);
}

function contentTypeOf(file: string): string {
  return file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
}

export interface TranscodeResult {
  durationSeconds: number;
  renditions: string[];
}

/**
 * Turns the uploaded source into HLS renditions plus a master playlist, all stored under the
 * asset's prefix. `workDir` is scratch space the caller removes afterwards.
 */
export async function transcodeVideo(
  storage: Storage,
  assetId: string,
  workDir: string,
): Promise<TranscodeResult> {
  const sourcePath = path.join(workDir, 'source');
  await storage.downloadToFile(videoKeys.source(assetId), sourcePath);
  const probe = await probeVideo(sourcePath);
  const renditions = chooseRenditions(probe.height);

  // start clean, so a retry never leaves segments of an earlier attempt behind
  await storage.deletePrefix(`${videoKeys.prefix(assetId)}hls/`);

  let durationSeconds = probe.durationSeconds;
  for (const rendition of renditions) {
    const outputDir = path.join(workDir, rendition.name);
    await encodeRendition(sourcePath, rendition, outputDir);
    durationSeconds ??= playlistDurationSeconds(
      await readFile(path.join(outputDir, 'index.m3u8'), 'utf8'),
    );
    for (const file of await readdir(outputDir)) {
      await storage.uploadFile(
        videoKeys.segment(assetId, rendition.name, file),
        path.join(outputDir, file),
        contentTypeOf(file),
      );
    }
  }

  const masterPath = path.join(workDir, 'master.m3u8');
  await writeFile(masterPath, buildMasterPlaylist(probe, renditions));
  await storage.uploadFile(videoKeys.masterPlaylist(assetId), masterPath, contentTypeOf('.m3u8'));

  if (!durationSeconds || durationSeconds <= 0) {
    throw new UnreadableVideoError('The file has no playable video stream');
  }
  return {
    durationSeconds: Math.round(durationSeconds),
    renditions: renditions.map((rendition) => rendition.name),
  };
}
