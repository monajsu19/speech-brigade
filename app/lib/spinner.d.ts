export type SpinnerOptions = {
  container: HTMLElement;
  items: string[];
  itemHeight?: number;
  windowHeight?: number;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  accent?: string;
  knobColor?: string;
  showLever?: boolean;
  showButton?: boolean;
  buttonLabel?: string;
  sound?: boolean;
  onLand?: (topic: string) => void;
};

export class Spinner {
  constructor(opts: SpinnerOptions);
  isSpinning: boolean;
  spin(initialVelocity?: number, target?: string): void;
  setItems(items: string[]): void;
  getCurrentItem(): string | null;
  destroy(): void;
}
