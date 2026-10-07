import { MEDIA } from '@byway/contracts';

export default function Page() {
  return <main>{MEDIA.join(', ')}</main>;
}
