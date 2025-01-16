import { EventEmitter } from 'events';
import { TTSProvider } from '../tts.interface';
import { TTSRequest, TTSResponse, TTSConfig, TTSStreamResponse } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';
import { Readable } from 'stream';

type ElevenLabsOutputFormat = 
  | 'mp3_22050_32' 
  | 'mp3_44100_32'
  | 'mp3_44100_64'
  | 'mp3_44100_96'
  | 'mp3_44100_128'
  | 'mp3_44100_192'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'ulaw_8000';

type AudioEncoding = 'mp3' | 'pcm' | 'ulaw';
type SampleRate = 8000 | 16000 | 22050 | 24000 | 44100;
type BitRate = 32 | 64 | 96 | 128 | 192;
type TextNormalization = 'auto' | 'on' | 'off';
type StreamingLatency = 0 | 1 | 2 | 3 | 4;

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

interface PronunciationDictionaryLocator {
  id: string;
  version_id?: string;
}

export interface ElevenLabsConfig extends TTSConfig {
  /** API Key for ElevenLabs */
  apiKey: string;
  /** Voice ID for ElevenLabs */
  voiceId: string;
  /** Optional model ID for ElevenLabs (default: eleven_monolingual_v1) */
  modelId?: string;
  /** Optional stability value between 0 and 1 */
  stability?: number;
  /** Optional similarity boost value between 0 and 1 */
  similarityBoost?: number;
  /** Audio encoding format */
  encoding?: AudioEncoding;
  /** Sample rate in Hz */
  sampleRate?: SampleRate;
  /** Bit rate for MP3 encoding */
  bitRate?: BitRate;
  /** Optional language code (ISO 639-1) */
  languageCode?: string;
  /** Optional text normalization setting */
  textNormalization?: TextNormalization;
  /** Optional streaming latency optimization level (0-4) */
  streamingLatency?: StreamingLatency;
  /** Optional seed for deterministic generation (0-4294967295) */
  seed?: number;
  /** Optional enable/disable logging */
  enableLogging?: boolean;
  /** Optional list of pronunciation dictionary locators */
  pronunciationDictionaries?: PronunciationDictionaryLocator[];
}

interface RequestOptions {
  text: string;
  model_id: string;
  voice_settings?: VoiceSettings;
  language_code?: string;
  pronunciation_dictionary_locators?: PronunciationDictionaryLocator[];
  seed?: number;
  apply_text_normalization?: TextNormalization;
}

export class ElevenLabsTTS extends EventEmitter implements TTSProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly modelId: string;
  private readonly voiceId: string;
  private readonly stability: number;
  private readonly similarityBoost: number;
  private readonly encoding: AudioEncoding;
  private readonly sampleRate: SampleRate;
  private readonly bitRate: BitRate;
  private readonly languageCode?: string;
  private readonly textNormalization: TextNormalization;
  private readonly streamingLatency: StreamingLatency;
  private readonly seed?: number;
  private readonly enableLogging: boolean;
  private readonly pronunciationDictionaries?: PronunciationDictionaryLocator[];

  constructor(config: ElevenLabsConfig) {
    super();
    
    if (!config.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }

    if (!config.voiceId) {
      throw new Error('Voice ID is required');
    }

    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'eleven_monolingual_v1';
    this.voiceId = config.voiceId;
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
    this.encoding = config.encoding ?? 'mp3';
    this.sampleRate = config.sampleRate ?? 44100;
    this.bitRate = config.bitRate ?? 128;
    this.languageCode = config.languageCode;
    this.textNormalization = config.textNormalization ?? 'auto';
    this.streamingLatency = config.streamingLatency ?? 0;
    this.seed = config.seed;
    this.enableLogging = config.enableLogging ?? true;
    this.pronunciationDictionaries = config.pronunciationDictionaries;

    // Validate configurations
    if (this.stability < 0 || this.stability > 1) {
      throw new Error('Stability must be between 0 and 1');
    }

    if (this.similarityBoost < 0 || this.similarityBoost > 1) {
      throw new Error('Similarity boost must be between 0 and 1');
    }

    if (this.seed !== undefined && (this.seed < 0 || this.seed > 4294967295)) {
      throw new Error('Seed must be between 0 and 4294967295');
    }

    if (this.pronunciationDictionaries && this.pronunciationDictionaries.length > 3) {
      throw new Error('Maximum of 3 pronunciation dictionaries allowed');
    }
  }

  private determineOutputFormat(): ElevenLabsOutputFormat {
    if (this.encoding === 'mp3') {
      if (this.sampleRate === 22050) {
        return 'mp3_22050_32';
      }
      if (this.sampleRate === 44100) {
        switch (this.bitRate) {
          case 32: return 'mp3_44100_32';
          case 64: return 'mp3_44100_64';
          case 96: return 'mp3_44100_96';
          case 128: return 'mp3_44100_128';
          case 192: return 'mp3_44100_192';
          default: return 'mp3_44100_128';
        }
      }
      return 'mp3_44100_128';
    }

    if (this.encoding === 'pcm') {
      switch (this.sampleRate) {
        case 16000: return 'pcm_16000';
        case 22050: return 'pcm_22050';
        case 24000: return 'pcm_24000';
        case 44100: return 'pcm_44100';
        default: return 'pcm_24000';
      }
    }

    if (this.encoding === 'ulaw') {
      return 'ulaw_8000';
    }

    throw new Error(`Unsupported encoding: ${this.encoding}`);
  }

  private getRequestOptions(text: string): RequestOptions {
    const options: RequestOptions = {
      text,
      model_id: this.modelId,
      voice_settings: {
        stability: this.stability,
        similarity_boost: this.similarityBoost
      }
    };

    if (this.languageCode) {
      options.language_code = this.languageCode;
    }

    if (this.pronunciationDictionaries) {
      options.pronunciation_dictionary_locators = this.pronunciationDictionaries;
    }

    if (this.seed !== undefined) {
      options.seed = this.seed;
    }

    if (this.textNormalization !== 'auto') {
      options.apply_text_normalization = this.textNormalization;
    }

    return options;
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      if (!request.text) {
        throw new Error('Text is required for TTS generation');
      }

      const url = new URL(`${this.baseUrl}/text-to-speech/${this.voiceId}`);
      url.searchParams.append('output_format', this.determineOutputFormat());

      if (this.enableLogging === false) {
        url.searchParams.append('enable_logging', 'false');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.getRequestOptions(request.text)),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { detail?: string; message?: string };
        console.log('ElevenLabs API error:', error);
        throw new Error(`ElevenLabs API error: ${error.detail || error.message || response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const audioData = Buffer.from(audioBuffer);

      const result: TTSResponse = {
        audioData,
        metadata: {
          text: request.text,
          responseIndex: request.responseIndex,
        },
      };

      this.emit(TTSEvents.SPEECH, 
        request.responseIndex ?? 0,
        audioData.toString('base64'),
        request.text,
        request.interactionCount
      );

      return result;
    } catch (error) {
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }

  async generateStream(request: TTSRequest): Promise<TTSStreamResponse> {
    try {
      if (!request.text) {
        throw new Error('Text is required for TTS generation');
      }

      const url = new URL(`${this.baseUrl}/text-to-speech/${this.voiceId}/stream`);
      url.searchParams.append('output_format', this.determineOutputFormat());
      
      if (this.streamingLatency > 0) {
        url.searchParams.append('optimize_streaming_latency', this.streamingLatency.toString());
      }

      if (this.enableLogging === false) {
        url.searchParams.append('enable_logging', 'false');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.getRequestOptions(request.text)),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`Failed to get stream from ElevenLabs API: ${errorText}`);
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;
      let isDestroyed = false;
      const self = this;

      const stream = new Readable({
        async read() {
          try {
            if (isDestroyed) {
              this.push(null);
              return;
            }

            const { done, value } = await reader.read();
            
            if (done) {
              this.push(null);
              return;
            }

            this.push(Buffer.from(value));
            chunkIndex++;
          } catch (error) {
            console.error('Stream Processing Error:', error);
            self.emit(TTSEvents.ERROR, error);
            this.destroy(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });

      const cleanup = () => {
        isDestroyed = true;
        reader.cancel().catch(console.error);
        stream.destroy();
      };

      stream.on('end', cleanup);
      stream.on('error', cleanup);

      return {
        stream,
        cleanup
      };

    } catch (error) {
      console.error('ElevenLabs Stream Error:', error);
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }
}