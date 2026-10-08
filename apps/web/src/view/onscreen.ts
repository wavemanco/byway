/**
 * A storyboard's on-screen copy in a Your words (write) turn (C4). Late in Ad Video Chain you rewrite the words shown
 * on screen: the headline, the tagline and each shot's caption (the voice-over was settled earlier). When the runner
 * offers that copy as one "Label: text" line per field ("Headline: …", "Tagline: …", "Shot 2: …"), the panel shows a
 * labelled field for each, and sends the lines back exactly as they came with only your text changed. Any other
 * starting text gets the plain editor.
 */

export interface CopyField {
  /** As written: "Headline", "Tagline", "Shot 3". */
  label: string;
  /** What separated the label from the text (": " usually), kept so unchanged copy goes back unchanged. */
  sep: string;
  value: string;
}

const LINE = /^(Headline|Tagline|Shot \d+)(\s*:\s?)(.*)$/i;

/** The fields, or null when the text is not on-screen copy in that form (then the plain editor is used). */
export function parseOnScreenCopy(text: string | undefined): CopyField[] | null {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const fields: CopyField[] = [];
  for (const line of lines) {
    const m = LINE.exec(line);
    if (!m) return null;
    fields.push({ label: m[1] ?? '', sep: m[2] ?? ': ', value: m[3] ?? '' });
  }
  return fields;
}

export function serializeOnScreenCopy(fields: readonly CopyField[]): string {
  return fields.map((f) => `${f.label}${f.sep}${f.value.replace(/\s*\n\s*/g, ' ')}`).join('\n');
}

/** "Shot 3" reads as "Shot 3 caption" next to its field; Headline and Tagline read as they are. */
export function fieldName(label: string): string {
  return /^shot \d+$/i.test(label) ? `${label} caption` : label;
}
