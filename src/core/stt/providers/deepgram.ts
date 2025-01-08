import { EventEmitter } from 'events';
import { createClient, ListenLiveClient, LiveTranscriptionEvent, LiveSchema, LiveTranscriptionEvents, UtteranceEndEvent, SpeechStartedEvent } from '@deepgram/sdk';
import { Buffer } from 'node:buffer';
import { STTProvider } from '@/core/stt/stt.interface';
import { SpeechStartedResult, STTConfig, TranscriptionOptions, TranscriptionResult, UtteranceEndResult } from '@/types/stt';
import { STTEvents } from '@/constants/STTEvents';

export interface DeepgramSTTConfig extends STTConfig {
  model?: string;
}

export class DeepgramSTT extends EventEmitter implements STTProvider {
  private dgConnection: ListenLiveClient;

  constructor(config: DeepgramSTTConfig, options: TranscriptionOptions) {
    super();
    const deepgram = createClient(config.apiKey);

    const dgOptions: LiveSchema = {
      encoding: options.audio.encoding,
      sample_rate: options.audio.sampleRate,
      model: config.model ?? 'nova-2',
      punctuate: options.punctuate ?? true,
      interim_results: options.interimResults ?? true,
      endpointing: options.endpointing ?? 200,
      utterance_end_ms: options.utteranceEndMs ?? 1000
    };

    this.dgConnection = deepgram.listen.live(dgOptions);

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      this.emit(STTEvents.OPEN);

      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (event: LiveTranscriptionEvent) => {
        if (event.type === 'Results' && event.channel?.alternatives?.length > 0) {
          const alternative = event.channel.alternatives[0];

          const transcription: TranscriptionResult = {
            text: alternative.transcript.trim(),
            isFinal: event.is_final ?? false,
            speechFinal: event.speech_final ?? false,
            confidence: alternative.confidence,
            start: event.start,
            duration: event.duration,
            words: alternative.words,
          }
          
          this.emit(STTEvents.TRANSCRIPTION, transcription);
        }
      });

      this.dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, (event: UtteranceEndEvent) => {
        const utteranceEnd: UtteranceEndResult = {
          last_word_end: event.last_word_end,
          channel: event.channel
        }
        this.emit(STTEvents.UTTERANCE_END, utteranceEnd);
      });

      this.dgConnection.on(LiveTranscriptionEvents.SpeechStarted, (event: SpeechStartedEvent) => {
        const speechStarted: SpeechStartedResult = {
          channel: event.channel
        }
        this.emit(STTEvents.SPEECH_STARTED, speechStarted);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Error, (error: Error) => {
        this.emit(STTEvents.ERROR, error);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        this.emit(STTEvents.CLOSE);
      });
    });
  }

  send(payload: string): void {
    if (this.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }

  getReadyState(): number {
    return this.dgConnection?.getReadyState() ?? 3;
  }

  close(): void {
    if (this.dgConnection) {
      this.dgConnection.disconnect();
    }
  }
}