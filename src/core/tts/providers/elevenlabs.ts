import { EventEmitter } from 'events';
import { TTSProvider } from '../tts.interface';
import { TTSRequest, TTSResponse, TTSConfig, TTSStreamResponse } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';
import { Readable } from 'stream';

export interface ElevenLabsConfig extends TTSConfig {
  /** Voice ID for ElevenLabs */
  voiceId: string;
  /** Optional model ID for ElevenLabs (default: eleven_monolingual_v1) */
  modelId?: string;
  /** Optional stability value between 0 and 1 */
  stability?: number;
  /** Optional similarity boost value between 0 and 1 */
  similarityBoost?: number;
}

export class ElevenLabsTTS extends EventEmitter implements TTSProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly modelId: string;
  private readonly voiceId: string;
  private readonly stability: number;
  private readonly similarityBoost: number;

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
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${this.voiceId}`,
        {
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
        }
      );

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
          format: 'audio/mpeg',
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
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${this.voiceId}/stream`,
        {
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
        }
      );

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