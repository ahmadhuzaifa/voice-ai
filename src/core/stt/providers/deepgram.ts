import { EventEmitter } from 'events';
import { createClient, ListenLiveClient, LiveTranscriptionEvent, LiveSchema, LiveTranscriptionEvents, UtteranceEndEvent, SpeechStartedEvent } from '@deepgram/sdk';
import { Buffer } from 'node:buffer';
import { STTProvider } from '@/core/stt/stt.interface';
import { SpeechStartedResult, STTConfig, TranscriptionResult, UtteranceEndResult } from '@/types/stt';
import { STTEvents } from '@/constants/STTEvents';

type DiarizeVersion = string;
type Language = string;
export enum DeepgramSTTModels {
  /** Base Nova 2 model */
  NOVA_2 = 'nova-2',
  /** Optimized for everyday audio processing */
  NOVA_2_GENERAL = 'nova-2-general',
  /** Optimized for conference room settings with multiple speakers and single microphone */
  NOVA_2_MEETING = 'nova-2-meeting',
  /** Optimized for low-bandwidth audio phone calls */
  NOVA_2_PHONECALL = 'nova-2-phonecall',
  /** Optimized for low-bandwidth audio clips with a single speaker */
  NOVA_2_VOICEMAIL = 'nova-2-voicemail',
  /** Optimized for multiple speakers with varying audio quality, with finance-oriented vocabulary */
  NOVA_2_FINANCE = 'nova-2-finance',
  /** Optimized for human-bot interactions (IVR, voice assistants, automated kiosks) */
  NOVA_2_CONVERSATIONALAI = 'nova-2-conversationalai',
  /** Optimized for audio sourced from videos */
  NOVA_2_VIDEO = 'nova-2-video',
  /** Optimized for audio with medical-oriented vocabulary */
  NOVA_2_MEDICAL = 'nova-2-medical',
  /** Optimized for audio sources from drive-thrus */
  NOVA_2_DRIVETHRU = 'nova-2-drivethru',
  /** Optimized for audio with automotive-oriented vocabulary */
  NOVA_2_AUTOMOTIVE = 'nova-2-automotive',
  /** Optimized for air traffic control audio */
  NOVA_2_ATC = 'nova-2-atc',
}

export interface DeepgramSTTConfig extends STTConfig {
  /** Model ID (e.g., 'nova-2') */
  model?: DeepgramSTTModels;
  /** Optional callback URL for async processing */
  callback?: string;
  /** Optional callback method (put/post) */
  callbackMethod?: 'put' | 'post';
  /** Enable speaker diarization */
  diarize?: boolean;
  /** Optional diarization version */
  diarizeVersion?: DiarizeVersion;
  /** Enable dictation mode */
  dictation?: boolean;
  /** Include filler words (uh/um) */
  fillerWords?: boolean;
  /** Convert numbers to numerical format */
  numerals?: boolean;
  /** Filter profanity */
  profanityFilter?: boolean;
  /** Redact sensitive information */
  redact?: string[];
  /** Terms to search and replace */
  replace?: { [key: string]: string };
  /** Terms to search for */
  search?: string[];
  /** Keywords to boost recognition */
  keywords?: string[];
  /** Primary spoken language */
  language?: Language;
  /** Enable smart formatting */
  smartFormat?: boolean;
  /** Enable multichannel processing */
  multichannel?: boolean;
  /** Tag for the request */
  tag?: string[];
  /** Additional metadata */
  extra?: string;
  /** Deterministic processing seed */
  seed?: number;
}

interface AudioConfig {
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
  /** Audio encoding format */
  encoding: string;
}

export interface TranscriptionOptions {
  /** Audio configuration */
  audio: AudioConfig;
  /** Enable punctuation */
  punctuate?: boolean;
  /** Enable interim results */
  interimResults?: boolean;
  /** Endpointing timeout in ms */
  endpointing?: number;
  /** Utterance end timeout in ms */
  utteranceEndMs?: number;
  /** Enable VAD events */
  vadEvents?: boolean;
}

export class DeepgramSTT extends EventEmitter implements STTProvider {
  private dgConnection: ListenLiveClient;

  constructor(config: DeepgramSTTConfig, options: TranscriptionOptions) {
    super();
    const deepgram = createClient(config.apiKey);

    const dgOptions: LiveSchema = {
      // Audio settings
      encoding: options.audio.encoding,
      sample_rate: options.audio.sampleRate,
      channels: options.audio.channels,
      multichannel: config.multichannel,

      // Model and language
      model: config.model ?? 'nova-2',
      language: config.language,
      
      // Formatting options
      punctuate: options.punctuate ?? true,
      smart_format: config.smartFormat ?? true,
      diarize: config.diarize,
      diarize_version: config.diarizeVersion,
      dictation: config.dictation,
      filler_words: config.fillerWords,
      numerals: config.numerals,
      profanity_filter: config.profanityFilter,
      redact: config.redact?.join(','),
      replace: JSON.stringify(config.replace),
      search: config.search?.join(','),
      keywords: config.keywords?.join(','),

      // Processing options
      interim_results: options.interimResults ?? true,
      endpointing: options.endpointing ?? 200,
      utterance_end_ms: options.utteranceEndMs ?? 1000,
      vad_events: options.vadEvents ?? true,

      // Additional options
      tag: config.tag,
      extra: config.extra,
      callback: config.callback,
      callback_method: config.callbackMethod,
    };

    this.dgConnection = deepgram.listen.live(dgOptions);

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      this.emit(STTEvents.OPEN);

      // Handle transcription results
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
            words: alternative.words?.map(word => ({
              word: word.word,
              start: word.start,
              end: word.end,
              confidence: word.confidence,
              punctuatedWord: word.punctuated_word,
              speaker: word.speaker
            })),
            metadata: {
              requestId: event.metadata?.request_id,
              modelVersion: event.metadata?.model_info?.version,
            }
          };
          
          this.emit(STTEvents.TRANSCRIPTION, transcription);
        }
      });

      // Handle utterance end events
      this.dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, (event: UtteranceEndEvent) => {
        const utteranceEnd: UtteranceEndResult = {
          last_word_end: event.last_word_end,
          channel: event.channel
        };
        this.emit(STTEvents.UTTERANCE_END, utteranceEnd);
      });

      // Handle speech started events
      this.dgConnection.on(LiveTranscriptionEvents.SpeechStarted, (event: SpeechStartedEvent) => {
        const speechStarted: SpeechStartedResult = {
          timestamp: event.timestamp,
          channel: event.channel
        };
        this.emit(STTEvents.SPEECH_STARTED, speechStarted);
      });

      // Handle errors and connection close
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
      this.dgConnection.finalize();
      this.dgConnection.disconnect();
    }
  }
}