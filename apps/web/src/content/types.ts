// ARL Interactive Core — content model.
//
// Content is data. Components in src/core render whatever the registry holds
// and contain no copy of their own. Adding a layer or a card means adding data
// here, not writing a new component.

/**
 * Delivery status (docs/content-standard.md). `LIVE` requires verifiable
 * evidence; nothing on the site uses it yet.
 */
export type Status = "PLANNED" | "IN DEVELOPMENT" | "LIVE";

/**
 * Where a deployment-dependent value will come from once it exists. The site
 * never renders a guessed value for these: until a provider is implemented
 * the metric stays `unavailable`.
 */
export type DataSourceId =
  | "chain.contractAddress"
  | "chain.network"
  | "chain.circulatingSupply"
  | "chain.stakedSupply"
  | "chain.holders"
  | "market.liquidity"
  | "market.listings";

/** The headline value of a card. */
export type Metric =
  | { readonly kind: "static"; readonly value: string; readonly unit?: string }
  | { readonly kind: "unavailable"; readonly label: string; readonly source: DataSourceId };

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** Render in the monospace face (numbers, identifiers). */
  readonly mono?: boolean;
}

export interface Section {
  readonly heading: string;
  readonly body?: string;
  readonly items?: readonly string[];
}

export interface ExternalLink {
  readonly label: string;
  /** An https URL, or a page of this site such as a published document under /docs. */
  readonly href: `https://${string}` | `/${string}`;
}

/**
 * Whether a profile's identity and background have been checked.
 * - verified: identity, education and career confirmed against a source.
 * - unverified: provided to the project, not yet checked.
 * - placeholder: an open seat, not a person.
 */
export type VerificationStatus = "verified" | "unverified" | "placeholder";

export interface Person {
  /** Name as provided, or null for an open seat. */
  readonly name: string | null;
  readonly role: string;
  readonly open: boolean;
  readonly verificationStatus: VerificationStatus;
  /** Two letters for the abstract identity mark. No portrait is ever generated. */
  readonly initials: string;
}

/** Visual weight. Cards are not all equal; the layer decides what matters. */
export type Weight = "primary" | "secondary" | "tertiary";

export interface Card {
  /** URL segment: lower-case letters, digits and hyphens. */
  readonly id: string;
  readonly title: string;
  /** One line on the card face. */
  readonly shortDescription: string;
  /** Delivery status. Omitted where it does not apply (roadmap phases). */
  readonly status?: Status;
  readonly weight: Weight;
  readonly metric?: Metric;
  readonly person?: Person;
  readonly detail: {
    readonly summary: string;
    readonly facts?: readonly Fact[];
    readonly sections?: readonly Section[];
  };
  readonly links?: readonly ExternalLink[];
}

export interface Layer {
  /** URL segment. */
  readonly id: string;
  readonly title: string;
  /** One sentence shown under the Core while the layer is open. */
  readonly description: string;
  readonly cards: readonly Card[];
  /** Shown at the foot of every detail surface in this layer. */
  readonly disclaimer?: string;
}
