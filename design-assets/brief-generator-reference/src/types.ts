/**
 * site.json shape — docs/export-format.md §2 (schemaVersion 1).
 * Types are structural only; validation is the validator's job (§5), not the
 * brief generator's. The generator assumes a schema-valid, post-FIX site.json
 * (feature-brief-generator.md: "Generated after the validator's FIX pass").
 */

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Link =
  | { kind: 'page'; pageId: string }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

export interface NavItem {
  id: string;
  label: string;
  link: Link;
}

interface BlockCommon {
  id: string;
  frame: Frame;
  z: number;
  fromTemplate?: boolean;
}

export interface SectionBlock extends BlockCommon {
  type: 'section';
  background: string | null;
}

export interface CopyBlock extends BlockCommon {
  type: 'heading' | 'text';
  copyMode: 'real' | 'generate';
  text: string;
  generateDescription: string | null;
  lengthHint: string | null;
}

export interface ImageSlotBlock extends BlockCommon {
  type: 'imageSlot';
  assetId: string | null;
  fit: 'cover' | 'contain';
  description: string | null;
}

export interface ButtonBlock extends BlockCommon {
  type: 'button';
  label: string;
  link: Link;
}

export interface NavBarBlock extends BlockCommon {
  type: 'navBar';
  items: NavItem[];
}

export type Block =
  | SectionBlock
  | CopyBlock
  | ImageSlotBlock
  | ButtonBlock
  | NavBarBlock;

export type BlockType = Block['type'];

export interface PenStroke {
  id: string;
  points: Array<[number, number]>;
  color: string;
  width: number;
  role: 'annotation' | 'imageSketch';
  targetBlockId: string | null;
}

export interface Page {
  id: string;
  name: string;
  slug: string;
  height: number;
  screenshot: string;
  blocks: Block[];
  penStrokes: PenStroke[];
}

export interface Asset {
  id: string;
  path: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  bytes: number;
}

export interface SiteSettings {
  businessName: string;
  tagline?: string | null;
  about?: string | null;
  vibe?: 'modern' | 'classic' | 'playful' | 'bold' | 'warm' | null;
  styleNotes?: string | null;
  colors?: string[];
}

export interface Submission {
  id: string;
  submittedAt: string;
  designCreatedAt?: string | null;
  client: { name: string; email: string };
  appVersion: string;
}

export interface SiteJson {
  schemaVersion: number;
  submission: Submission;
  siteSettings: SiteSettings;
  pages: Page[];
  assets: Asset[];
}
