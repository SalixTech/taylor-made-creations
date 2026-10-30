/** The studio owner's supplied cue. No uploads, remote URLs or editable sound settings. */
export const STUDIO_NOTIFICATION_AUDIO = {
  opus: "/audio/tmc-studio-notification.oga",
  wav: "/audio/tmc-studio-notification.wav",
} as const;

export function createStudioNotificationAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  try {
    const player = new Audio();
    const opusSupport = player.canPlayType?.('audio/ogg; codecs="opus"');
    player.src = opusSupport === "probably" || opusSupport === "maybe" ? STUDIO_NOTIFICATION_AUDIO.opus : STUDIO_NOTIFICATION_AUDIO.wav;
    player.preload = "auto";
    player.volume = 1;
    return player;
  } catch { return null; }
}

const playbackGeneration = new WeakMap<HTMLAudioElement, number>();
function nextPlayback(player: HTMLAudioElement) { const generation = (playbackGeneration.get(player) ?? 0) + 1; playbackGeneration.set(player, generation); return generation; }

/** Called only from an explicit click, never mounting or an initial backlog. */
export function primeStudioNotificationAudio(player: HTMLAudioElement): void {
  const generation = nextPlayback(player);
  try {
    player.muted = true;
    void player.play().then(() => { if (playbackGeneration.get(player) !== generation) return; player.pause(); player.currentTime = 0; player.muted = false; }, () => { if (playbackGeneration.get(player) === generation) player.muted = false; });
  } catch { player.muted = false; }
}

/** Optional sound must not interrupt live updates or retry in a loop if blocked. */
export function playNotificationAudio(player: HTMLAudioElement | null): void {
  if (!player) return;
  nextPlayback(player);
  try { player.muted = false; player.currentTime = 0; void player.play().catch(() => {}); } catch { /* Browser policy or audio device unavailable. */ }
}
