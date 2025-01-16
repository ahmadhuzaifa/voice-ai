import { EventEmitter } from 'events';
import { TTSProvider } from '../tts.interface';
import { TTSRequest, TTSResponse, TTSConfig, TTSStreamResponse } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';
import { Readable } from 'stream';

export interface PlayHTConfig extends TTSConfig {
  /** API Key for PlayHT */
  apiKey: string;
  /** User ID for PlayHT */
  userId: string;
  /** Voice ID for PlayHT */
  voiceId: string;
  /** Optional quality setting */
  quality?: 'draft' | 'low' | 'medium' | 'high' | 'premium';
  /** Optional voice speed (0.1 to 5.0) */
  speed?: number;
  /** Optional output format */
  encoding?: AudioEncoding;
  /** Optional text guidance value */
  textGuidance?: number;
}

interface PlayHTStatusResponse {
  status: 'completed' | 'failed';
  url?: string;
}

interface PlayHTConversionResponse {
  id: string;
}

type AudioEncoding = 'mp3' | 'mulaw' | 'raw' | 'wav' | 'ogg' | 'flac';

export class PlayHTTTS extends EventEmitter implements TTSProvider {
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly baseUrl = 'https://api.play.ai/api/v1';
  private readonly voiceId: string;
  private readonly quality: string;
  private readonly speed: number;
  private readonly encoding: AudioEncoding;
  private readonly sampleRate: number;
  private readonly textGuidance: number;
  constructor(config: PlayHTConfig) {
    super();
    
    if (!config.apiKey || !config.userId) {
      throw new Error('PlayHT API key and User ID are required');
    }

    if (!config.voiceId) {
      throw new Error('Voice ID is required');
    }

    this.apiKey = config.apiKey;
    this.userId = config.userId;
    this.voiceId = config.voiceId;
    this.quality = config.quality ?? 'premium';
    this.speed = config.speed ?? 1.0;
    this.encoding = config.encoding ?? 'mp3';
    this.sampleRate = config.sampleRate ?? 24000;
    this.textGuidance = config.textGuidance ?? 1;
    
    // Validate speed range
    if (this.speed < 0.1 || this.speed > 5.0) {
      throw new Error('Speed must be between 0.1 and 5.0');
    }
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      if (!request.text) {
        throw new Error('Text is required for TTS generation');
      }

      // Step 1: Create conversion request
      const conversionResponse = await fetch(
        `${this.baseUrl}/tts`,
        {
          method: 'POST',
          headers: {
            'AUTHORIZATION': this.apiKey,
            'X-USER-ID': this.userId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'Play3.0-mini',
            text: request.text,
            voice: this.voiceId,
            quality: this.quality,
            speed: this.speed,
            outputFormat: this.encoding,
            sampleRate: this.sampleRate,
            textGuidance: 1,
            language: 'english'
          }),
        }
      );

      if (!conversionResponse.ok) {
        const errorBody = await conversionResponse.text();
        console.error('PlayHT API Error:', {
          status: conversionResponse.status,
          statusText: conversionResponse.statusText,
          body: errorBody
        });
        throw new Error(`PlayHT API error: ${errorBody || conversionResponse.statusText}`);
      }

      const { id: transcriptionId } = await conversionResponse.json() as PlayHTConversionResponse;

      // Step 2: Poll for completion and get audio URL
      const audioUrl = await this.pollForCompletion(transcriptionId);

      // Step 3: Download the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error('Failed to download audio file');
      }

      const audioBuffer = await audioResponse.arrayBuffer();
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
      console.error('PlayHT Generate Error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }

  async generateStream(request: TTSRequest): Promise<TTSStreamResponse> {
    try {
      if (!request.text) {
        throw new Error('Text is required for TTS generation');
      }

      console.log('PlayHT Request:', {
        model: 'Play3.0-mini',
        text: request.text,
        voice: this.voiceId,
        quality: this.quality,
        speed: this.speed,
        outputFormat: 'mp3',
        sampleRate: 24000,
        textGuidance: 1,
        language: 'english'
      });

      const response = await fetch(
        `${this.baseUrl}/tts/stream`,
        {
          method: 'POST',
          headers: {
            'AUTHORIZATION': this.apiKey,
            'X-USER-ID': this.userId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'Play3.0-mini',
            text: request.text,
            voice: this.voiceId,
            quality: this.quality,
            speed: this.speed,
            outputFormat: this.encoding,
            sampleRate: this.sampleRate,
            textGuidance: this.textGuidance,
            language: 'english'
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PlayHT API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`PlayHT API error: ${JSON.stringify(errorJson)}`);
        } catch {
          throw new Error(`PlayHT API error: ${errorText}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;
      let isDestroyed = false;
      const self = this;

      const stream = new Readable({
        async read() {
          const processChunk = async () => {
            if (isDestroyed) {
              this.push(null);
              return;
            }

            try {
              const { done, value } = await reader.read();
              
              if (done) {
                this.push(null);
                return;
              }

              this.push(Buffer.from(value));
              chunkIndex++;
            } catch (error) {
              console.error('Chunk Processing Error:', error);
              self.emit(TTSEvents.ERROR, error);
              this.destroy(error instanceof Error ? error : new Error(String(error)));
            }
          };

          processChunk().catch((error) => {
            console.error('Stream Processing Error:', error);
            self.emit(TTSEvents.ERROR, error);
            this.destroy(error instanceof Error ? error : new Error(String(error)));
          });
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
      console.error('PlayHT Stream Error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }

  private async pollForCompletion(transcriptionId: string): Promise<string> {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(
        `${this.baseUrl}/tts/${transcriptionId}`,
        {
          headers: {
            'AUTHORIZATION': this.apiKey,
            'X-USER-ID': this.userId,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check transcription status');
      }

      const status = await response.json() as PlayHTStatusResponse;

      if (status.status === 'completed') {
        return status.url!;
      } else if (status.status === 'failed') {
        throw new Error('Audio generation failed');
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    throw new Error('Timeout waiting for audio generation');
  }
}