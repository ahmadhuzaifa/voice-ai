import { EventEmitter } from 'events';
import { createClient, LiveSchema, LiveTranscriptionEvents } from '@deepgram/sdk';
import { Buffer } from 'node:buffer';
import { STTProvider } from '@/core/stt/stt.interface';
import { STTConfig, TranscriptionResult, TranscriptionOptions } from '@/types/stt';
import { STTEvents } from '@/constants/STTEvents';

export interface DeepgramSTTConfig extends STTConfig {
  /** Model to use for transcription */
  model?: string;
}

export class DeepgramSTT extends EventEmitter implements STTProvider {
  private dgConnection: any;
  private finalResult: string = '';
  private speechFinal: boolean = false;

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

    // Initialize Deepgram connection
    this.dgConnection = deepgram.listen.live(dgOptions);

    // Set up event handlers
    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      // Emit open event
      this.emit(STTEvents.OPEN);

      // Handle transcripts
      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent: any) => {
        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = '';
        if (alternatives) {
          text = alternatives[0]?.transcript;
        }

        // Handle UtteranceEnd events
        if (transcriptionEvent.type === 'UtteranceEnd') {
          if (!this.speechFinal) {
            const result: TranscriptionResult = {
              text: this.finalResult.trim(),
              isFinal: true,
              speechFinal: true
            };
            this.emit(STTEvents.TRANSCRIPTION, result);
            return;
          }
          return;
        }

        // Handle regular transcription results
        if (transcriptionEvent.is_final === true && text.trim().length > 0) {
          this.finalResult += ` ${text}`;

          if (transcriptionEvent.speech_final === true) {
            this.speechFinal = true;
            const result: TranscriptionResult = {
              text: this.finalResult.trim(),
              isFinal: true,
              speechFinal: true,
              confidence: alternatives?.[0]?.confidence
            };
            this.emit(STTEvents.TRANSCRIPTION, result);
            this.finalResult = '';
          } else {
            this.speechFinal = false;
          }
        } else {
          // Emit interim results
          this.emit(STTEvents.UTTERANCE, text);
        }
      });

      // Handle errors
      this.dgConnection.on(LiveTranscriptionEvents.Error, (error: Error) => {
        this.emit(STTEvents.ERROR, error);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
        this.emit(STTEvents.METADATA, metadata);
      });

      // Handle connection close
      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        this.emit(STTEvents.CLOSE);
      });
    });
  }

  /**
   * Send audio data to Deepgram
   * @param payload Base64 encoded audio data
   */
  send(payload: string): void {
    if (this.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }

  /**
   * Get the current connection state
   * @returns Connection ready state (0: Connecting, 1: Open, 2: Closing, 3: Closed)
   */
  getReadyState(): number {
    return this.dgConnection?.getReadyState() ?? 3;
  }

  /**
   * Close the Deepgram connection
   */
  close(): void {
    if (this.dgConnection) {
      this.dgConnection.close();
    }
  }
}