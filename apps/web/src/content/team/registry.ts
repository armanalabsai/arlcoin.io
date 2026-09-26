import type { ExternalLink, VerificationStatus } from "../types.ts";

// ARL team registry: the single source for team profiles.
//
// Publishing rule: education and career entries are claims about real
// institutions and employers. They are rendered only for profiles whose
// verificationStatus is "verified". For every other profile the site shows
// the name, the role and neutral expertise, and states that the profile is
// not verified. Portraits and links are rendered only when verified and only
// from a real source; none is invented.
//
// Nationality and ethnicity are deliberately not recorded: they add nothing
// to a team profile and are not shown on the site.

export interface TeamProfile {
  /** URL segment. */
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly verificationStatus: VerificationStatus;
  /** Birth year as provided. Recorded, never displayed. */
  readonly birthYear?: number;
  /** Neutral areas of expertise, without institution names. Safe to display. */
  readonly expertise: readonly string[];
  /** Claims about institutions. Displayed only when verified. */
  readonly education: readonly string[];
  /** Claims about employers and projects. Displayed only when verified. */
  readonly career: readonly string[];
  /** Path under /public to a consented photo. Only for verified profiles. */
  readonly portrait?: string;
  /** Real, checked URLs only. Displayed only when verified. */
  readonly links?: readonly ExternalLink[];
}

export const TEAM: readonly TeamProfile[] = [
  {
    id: "foundark",
    name: "FoundArk",
    role: "CEO — AI Founder",
    initials: "FA",
    verificationStatus: "unverified",
    birthYear: 2024,
    expertise: ["Strategic direction", "Autonomous networks", "Decentralized AI systems"],
    education: ["AGI Core Systems Laboratory"],
    career: [
      "Strategic decision-maker and founding leader in autonomous networks and decentralized AI systems",
    ],
  },
  {
    id: "joon-ho-park",
    name: "Joon-Ho Park",
    role: "CTO / Protocol Architect",
    initials: "JP",
    verificationStatus: "unverified",
    birthYear: 1996,
    expertise: ["Protocol architecture", "Distributed systems", "Consensus software"],
    education: ["KAIST — Computer Science, B.S. (2018)"],
    career: [
      "Bitcoin Core development team (2019–2022)",
      "Senior Distributed Systems Architect (2022–2025)",
    ],
  },
  {
    id: "isabella-robinson",
    name: "Isabella Robinson",
    role: "Lead Blockchain Engineer",
    initials: "IR",
    verificationStatus: "unverified",
    birthYear: 1995,
    expertise: ["Peer-to-peer networking", "Rust and C++", "Protocol engineering"],
    education: ["MIT — Computer Engineering, B.S. (2017)"],
    career: ["P2P network protocol developer (2017–2021)", "Rust/C++ Lead Engineer (2021–2025)"],
  },
  {
    id: "sarah-anderson",
    name: "Sarah Anderson",
    role: "Cryptography / ZK Engineer",
    initials: "SA",
    verificationStatus: "unverified",
    birthYear: 1997,
    expertise: ["Applied cryptography", "Zero-knowledge proofs", "Privacy engineering"],
    education: ["Stanford University — Cryptography, M.S. (2020)"],
    career: ["Research engineer on privacy-focused zero-knowledge projects (2020–2025)"],
  },
  {
    id: "carlos-morales",
    name: "Carlos Morales",
    role: "AI Systems Engineer",
    initials: "CM",
    verificationStatus: "unverified",
    birthYear: 1994,
    expertise: ["Distributed ML infrastructure", "AI systems", "Model serving"],
    education: ["Polytechnic University of Madrid — Artificial Intelligence, B.S. (2016)"],
    career: ["Distributed ML infrastructure engineer (2016–2021)", "AI Systems Lead (2021–2025)"],
  },
  {
    id: "mateo-gomez",
    name: "Mateo Gomez",
    role: "Compute Engineer",
    initials: "MG",
    verificationStatus: "unverified",
    birthYear: 1993,
    expertise: ["GPU orchestration", "Kubernetes", "Cloud infrastructure"],
    education: ["University of Barcelona — Computer Science, B.S. (2015)"],
    career: [
      "Cloud computing, GPU orchestration and Kubernetes infrastructure engineer and administrator (2015–2025)",
    ],
  },
  {
    id: "olivia-lee",
    name: "Olivia Lee",
    role: "DeFi Protocol Engineer",
    initials: "OL",
    verificationStatus: "unverified",
    birthYear: 1998,
    expertise: ["Smart contracts", "DeFi risk modelling", "Protocol economics"],
    education: ["UC Berkeley — Economics and Software Engineering, B.S. (2020)"],
    career: ["Smart-contract developer and risk modeller in DeFi protocols (2020–2025)"],
  },
  {
    id: "marcus-turner",
    name: "Marcus Turner",
    role: "Security Engineer",
    initials: "MT",
    verificationStatus: "unverified",
    birthYear: 1992,
    expertise: ["Smart contract auditing", "Penetration testing", "Threat modelling"],
    education: ["Carnegie Mellon University — Cybersecurity, M.S. (2015)"],
    career: ["Blockchain security auditor and penetration-testing engineer (2015–2025)"],
  },
  {
    id: "alejandro-ruiz",
    name: "Alejandro Ruiz",
    role: "DevOps / SRE",
    initials: "AR",
    verificationStatus: "unverified",
    birthYear: 1995,
    expertise: ["Site reliability", "Kubernetes", "Cloud operations"],
    education: ["University of Valencia — Systems Engineering, B.S. (2017)"],
    career: ["Site reliability engineer; Kubernetes and cloud operations manager (2017–2025)"],
  },
  {
    id: "chloe-peterson",
    name: "Chloe Peterson",
    role: "Product / Ecosystem Lead",
    initials: "CP",
    verificationStatus: "unverified",
    birthYear: 1996,
    expertise: ["Product management", "Developer relations", "Ecosystem programs"],
    education: ["Harvard University — Business and Computer Science, B.S. (2018)"],
    career: ["Web3 product manager and developer-relations lead (2018–2025)"],
  },
  {
    id: "jamal-washington",
    name: "Jamal Washington",
    role: "BD / Partnerships",
    initials: "JW",
    verificationStatus: "unverified",
    birthYear: 1991,
    expertise: ["Business development", "Exchange relations", "Commercial agreements"],
    education: ["Columbia University — Finance, B.S. (2013)"],
    career: [
      "Business-development director and strategic-partnerships manager for crypto exchanges (2013–2025)",
    ],
  },
  {
    id: "nicole-brooks",
    name: "Nicole Brooks",
    role: "Legal / Compliance Advisor",
    initials: "NB",
    verificationStatus: "unverified",
    birthYear: 1990,
    expertise: ["Digital-asset regulation", "Listing compliance", "Institutional compliance"],
    education: ["Yale Law School — Digital Asset Law, Doctorate (2015)"],
    career: [
      "Digital-asset regulatory attorney; CEX listing and institutional compliance advisor (2015–2025)",
    ],
  },
];
