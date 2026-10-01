import { LandingA } from './LandingA';
import { LandingB } from './LandingB';

export type LandingConfig = {
  name: string;
  appleReady: boolean;
  registrationOpen: boolean;
  macAvailable: boolean;
};

// Both designs stay addressable. Change this value to restore the default.
const DEFAULT_VARIANT = 'b';

export function Landing(props: { config: LandingConfig | null; error: string }) {
  const variant = new URLSearchParams(location.search).get('variant') ?? DEFAULT_VARIANT;
  return variant === 'a' ? <LandingA {...props} /> : <LandingB {...props} />;
}
