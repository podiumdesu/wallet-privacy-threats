export const IMPORT_ACCOUNT_PATTERNS: ReadonlyArray<RegExp> = [
  // /import account/i,
  // /import key/i,
  // /import private key/i,
  // /import address/i,
  // any order: contains import AND wallet
  // /^(?=.*\bimport\b)(?=.*\bwallet\b).*/i,
  /\bimport\b[\s\S]*\bwallet\b/i,
  /\b(already have)\b/i,
  /\b(have a wallet)\b/i,
  // any order: contains already AND account/wallet
  /^(?=.*\balready\b)(?=.*\b(account|wallet)\b).*/i,
];

export const IMPORT_SEED_PATTERNS: ReadonlyArray<RegExp> = [
  // direct phrases
  /\bimport (seed|secret|recovery)\s+(phrase|passphrase)\b/i,
  /\bimport mnemonic\b/i,
  /\bseed phrase\b/i,
  /\bmnemonic\b/i,
  /\brestore (seed|secret|recovery)\s+(phrase|passphrase)\b/i,
  /\brecover (seed|secret|recovery)\s+(phrase|passphrase)\b/i,
  /\brecovery phrase\b/i,

  // /^(?=.*\bimport\b)(?=.*\b(secret|seed).*(phrase|recovery)).*/i,
  // generic: must contain a verb (import/restore/recover) AND a seed/phrase noun (any order)
  /^(?=.*\b(import|restore|recover)\b)(?=.*\b(mnemonic|seed|secret(?: recovery)? phrase|recovery phrase|passphrase)\b).*$/i,
];

export const CONTINUE_PATTERNS: ReadonlyArray<RegExp> = [
  // restore must be the whole text
  /^\s*restore\s*$/i,

  // all other words can appear anywhere
  // Removed agree
  /\b(continue|next|confirm|ok|done|all done|finish|import|submit)\b/i,

  /^\s*set password\s*$/i,

  // /\b(continue|next|confirm|ok|done|all done|finish|agree|import|submit|restore)\b/i,
];

// const GATE_LABELS = [
//   /get started/i,
//   /agree/i,
//   /accept/i,
//   /ok/i,
//   /no thanks/i,
//   /maybe later/i,
//   /skip/i,
//   /next/i,
//   /confirm/i,
//   /continue/i,
//   /\b(continue|next|confirm|ok|done|all done|finish|agree|import|submit)\b/i,
//   // NOTE: intentionally do NOT include /continue|next/ here to avoid overshooting
// ];

// CTA words you likely care about
export const CONNECTISH = /\b(connect)\b/i;

// Ethereum addresses: full + truncated with … or ...
export const ETH_ADDR_FULL = /\b0x[a-fA-F0-9]{40}\b/;
export const ETH_ADDR_SHORT =
  /\b0x[a-fA-F0-9]{2,8}(?:…|\.\.\.)[a-fA-F0-9]{2,8}\b/;

export const DISCONNECT_PATTERNS: ReadonlyArray<RegExp> = [
  /\bdisconnect\b/i,
  /\blogout\b/i,
  /\bsign\s*out\b/i,
  /\blog\s*off\b/i,
];

const CONNECTWALLETISH = /^(connect|connect wallet)$/i;

export const connectCandidates = [
  `role=button[name=${CONNECTWALLETISH}]`,
  `text=${CONNECTWALLETISH}`,
  // Text selectors – word boundaries to exclude "disconnect"
  // "text=/\\bconnect wallet\\b/i",
  // "text=/\\bconnect\\b/i",
  // Only exact/known testids; avoid *contains*
  `[data-testid="connect"], [data-testid="connect-wallet"], [data-test="connect"], [data-test="connect-wallet"]`,

  // "[data-testid*=connect], [data-test*=connect]",
  "role=button[name=${CONNECTWALLETISH}]",
];
