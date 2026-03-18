import { createClient, LiveTranscriptionEvents, type LiveClient } from "@deepgram/sdk";

type TranscriptHandler = (text: string) => void;

export interface CloudSttSession {
  /**
   * Push a chunk of raw audio data to the cloud STT stream.
   */
  pushAudioChunk(chunk: Buffer): void;
  /**
   * Close the underlying streaming session.
   */
  close(): void;
}

interface CreateCloudSttSessionOptions {
  onTranscript: TranscriptHandler;
}

/**
 * Create a Deepgram live transcription session.
 *
 * Returns null if the Deepgram API key is not configured. Callers should treat
 * a null return value as \"cloud STT disabled\" and ignore any audio_chunk
 * messages in that case.
 */
export function createCloudSttSession(
  options: CreateCloudSttSessionOptions,
): CloudSttSession | null {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.warn(
      "[cloud-stt] DEEPGRAM_API_KEY is not set; cloud STT is disabled.",
    );
    return null;
  }

  const deepgram = createClient(apiKey);

  const live = deepgram.listen.live({
    model: "nova-3",
    language: "en-US",
    smart_format: true,
  }) as LiveClient;

  live.on(LiveTranscriptionEvents.Open, () => {
    console.log("[cloud-stt] Deepgram live connection opened.");
  });

  live.on(LiveTranscriptionEvents.Error, (err) => {
    console.error("[cloud-stt] Deepgram error:", err);
  });

  live.on(LiveTranscriptionEvents.Close, () => {
    console.log("[cloud-stt] Deepgram live connection closed.");
  });

  live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    try {
      const alternatives = data.channel?.alternatives;
      const transcript = alternatives?.[0]?.transcript;
      const isFinal = data.is_final ?? false;
      if (isFinal && transcript && transcript.trim().length > 0) {
        options.onTranscript(transcript.trim());
      }
    } catch (err) {
      console.error("[cloud-stt] Failed to handle Deepgram transcript:", err);
    }
  });

  return {
    pushAudioChunk(chunk: Buffer) {
      try {
        live.send(chunk);
      } catch (err) {
        console.error("[cloud-stt] Failed to send audio chunk:", err);
      }
    },
    close() {
      try {
        live.finish();
      } catch (err) {
        console.error("[cloud-stt] Failed to close Deepgram live session:", err);
      }
    },
  };
}

