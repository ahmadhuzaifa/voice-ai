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

export interface ElevenLabsConfig extends TTSConfig {
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

  constructor(config: ElevenLabsConfig) {
    super();
    
    if (!config.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }

    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'eleven_monolingual_v1';
    this.voiceId = config.voiceId ?? 'premade/adam';
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
    this.encoding = config.encoding ?? 'pcm';
    this.sampleRate = config.sampleRate ?? 16000;
    this.bitRate = config.bitRate ?? 32;
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
          default: return 'mp3_44100_64';
        }
      }
      return 'mp3_44100_64';
    }

    if (this.encoding === 'pcm') {
      switch (this.sampleRate) {
        case 16000: return 'pcm_16000';
        case 22050: return 'pcm_22050';
        case 24000: return 'pcm_24000';
        case 44100: return 'pcm_44100';
        default: return 'pcm_16000'; 
      }
    }

    if (this.encoding === 'ulaw') {
      return 'ulaw_8000';
    }

    throw new Error(`Unsupported encoding: ${this.encoding}`);
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      const url = new URL(`${this.baseUrl}/text-to-speech/${this.voiceId}`);
      url.searchParams.append('output_format', this.determineOutputFormat());

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: this.modelId,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`ElevenLabs API error: ${error || response.statusText}`);
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
      const url = new URL(`${this.baseUrl}/text-to-speech/${this.voiceId}/stream`);
      url.searchParams.append('output_format', this.determineOutputFormat());
      url.searchParams.append('optimize_streaming_latency', '3');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: this.modelId,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to get stream from ElevenLabs API');
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;
      let isDestroyed = false;

      const stream = new Readable({
        async read(): Promise<void> {
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
            this.emit(TTSEvents.ERROR, error);
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
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }
}