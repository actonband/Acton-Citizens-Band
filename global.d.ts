// Declaration for gtag function
declare global {
  interface Window {
    gtag: (command: 'event', eventName: string, params: Record<string, any>) => void;
  }
  
  interface Navigator {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  }
}

export type gtag = Window['gtag'];
