
/**
 * Events emitted by STT providers
 */
export enum STTEvents {
    /** Emitted when a final transcription is ready */
    TRANSCRIPTION = 'transcription',
    /** Emitted when an utterance ends */
    UTTERANCE_END = 'utterance_end',
    /** Emitted when a speech started */
    SPEECH_STARTED = 'speech_started',
    /** Emitted when an error occurs */
    ERROR = 'error',
    /** Emitted when a warning occurs */
    WARNING = 'warning',
    /** Emitted when metadata is received */
    METADATA = 'metadata',
    /** Emitted when the connection is opened */
    OPEN = 'open',
    /** Emitted when the connection is closed */
    CLOSE = 'close'
}