interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult { readonly isFinal: boolean; readonly length: number; [index: number]: SpeechRecognitionAlternative }
interface SpeechRecognitionResultList { readonly length: number; [index: number]: SpeechRecognitionResult }
interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList }
interface SpeechRecognitionErrorEvent extends Event { readonly error: string; readonly message: string }
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionConstructor { new(): SpeechRecognition }
interface FaceDetectionResult { boundingBox: DOMRectReadOnly }
interface FaceDetector { detect(source: CanvasImageSource): Promise<FaceDetectionResult[]> }
interface FaceDetectorConstructor { new(options?: { fastMode?: boolean; maxDetectedFaces?: number }): FaceDetector }
interface PermissionsPolicy { allowsFeature(feature: string, origin?: string): boolean }

interface Document {
  permissionsPolicy?: PermissionsPolicy;
  featurePolicy?: PermissionsPolicy;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  FaceDetector?: FaceDetectorConstructor;
}
