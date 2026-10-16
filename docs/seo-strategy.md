# ARL Protocol SEO stratejisi (sıfır bütçe)

Sahip: proje lideri. Tarih: 2026-10-16. Kapsam: arlcoin.io, X @arlprotocol, Telegram
t.me/arlcoin_community, Farcaster, Mirror.xyz, GitHub armanalabsai/arlcoin.io.

Sabit veriler (her içerikte aynı kalır): ARL, Base üzerinde ERC-20; sabit arz 21.000.000 ARL;
mint/burn/pause/upgrade yok; hazine 2-of-3 Safe + 48 saat timelock; Base Mainnet hedefi
**23 Ekim 2026**; Uniswap on Base havuzları 0,20 USD'den açılır; **lansmanda airdrop yok**
(500.000 ARL'lik airdrop ileri bir tarihte, kuralları ayrıca duyurulur). Resmî kanallar:
https://arlcoin.io · https://x.com/arlprotocol · https://t.me/arlcoin_community · team@arlcoin.io.

İçerik kuralları: fiyat vaadi yok, "listelenecek" vaadi yok, airdrop vaadi yok; her teknik iddia
repodaki koda, teste veya dokümana bağlanır (bkz. [content-standard.md](content-standard.md)).

Bu dokümanla birlikte sitede uygulananlar: başlık/açıklama uzunluk limitleri (test ile
korunur), site geneli `Organization` + `WebSite` JSON-LD, doküman sayfalarında `TechArticle` +
`BreadcrumbList`, Core kartlarında `BreadcrumbList`, FAQ'da `FAQPage`, `manifest.webmanifest`,
sitemap öncelik/sıklık ipuçları, AI tarayıcılarına açık `robots.txt`, `llms.txt` resmî kanallar
bölümü, kaldırılan `/core/team` adresleri için 301 yönlendirme.

---

## 1. Anahtar kelime araştırması

Hacim değerleri ücretsiz araçlarla (Google Keyword Planner aralıkları, Google Trends, Search
Console ilk veriler, X arama sonuçları) yapılmış **tahminlerdir**; lansman sonrası Search
Console verisiyle her ay güncellenir. Marka kelimeleri bugün düşük hacimli ama sıralaması en
kolay ve dönüşümü en yüksek gruptur; lansman günü (23 Ekim) aramalar sıçrar.

| #   | Anahtar kelime                         | Kategori    | Aylık hacim (tahmin) | Zorluk | Hedef sayfa        |
| --- | -------------------------------------- | ----------- | -------------------: | ------ | ------------------ |
| 1   | ARL Protocol                           | Marka       |               50–200 | Düşük  | /                  |
| 2   | ARL token                              | Marka       |              100–500 | Düşük  | /core/token        |
| 3   | ARL coin                               | Marka       |              100–500 | Orta   | /                  |
| 4   | arlcoin                                | Marka       |               20–100 | Düşük  | /                  |
| 5   | ARL crypto                             | Marka       |               50–300 | Orta   | /                  |
| 6   | ARL price                              | Marka       |            200–1.000 | Orta   | /buy               |
| 7   | buy ARL token                          | Marka       |               50–200 | Düşük  | /buy               |
| 8   | ARL contract address                   | Marka       |               20–100 | Düşük  | /buy               |
| 9   | ARL tokenomics                         | Marka       |               20–100 | Düşük  | /docs/tokenomics   |
| 10  | ARL Base                               | Marka       |                10–50 | Düşük  | /                  |
| 11  | how to buy ARL on Uniswap              | Uzun kuyruk |                10–50 | Düşük  | /buy               |
| 12  | what is ARL Protocol                   | Uzun kuyruk |                10–50 | Düşük  | /faq               |
| 13  | is ARL token safe                      | Uzun kuyruk |                10–50 | Düşük  | /core/security     |
| 14  | when does ARL launch                   | Uzun kuyruk |                10–50 | Düşük  | /faq               |
| 15  | how to add ARL to MetaMask             | Uzun kuyruk |                10–50 | Düşük  | /buy               |
| 16  | how to pay for AI with crypto          | Uzun kuyruk |              100–500 | Orta   | blog               |
| 17  | how to pay for GPU compute with crypto | Uzun kuyruk |               50–200 | Orta   | blog               |
| 18  | what is a fixed supply token           | Uzun kuyruk |              100–300 | Düşük  | blog               |
| 19  | how does a token timelock work         | Uzun kuyruk |               50–150 | Düşük  | /docs/token-design |
| 20  | how to verify a token contract on Base | Uzun kuyruk |               50–200 | Düşük  | blog               |
| 21  | Render token alternative               | Rakip       |              100–300 | Orta   | blog               |
| 22  | Akash Network alternative              | Rakip       |               50–200 | Orta   | blog               |
| 23  | Bittensor vs                           | Rakip       |            500–2.000 | Yüksek | blog               |
| 24  | Virtuals Protocol alternative          | Rakip       |               50–200 | Orta   | blog               |
| 25  | io.net alternative                     | Rakip       |               50–150 | Orta   | blog               |
| 26  | AI agent tokens on Base                | Rakip       |              200–800 | Yüksek | blog               |
| 27  | decentralized compute tokens           | Rakip       |              200–600 | Yüksek | blog               |
| 28  | DePIN AI tokens                        | Rakip       |            500–1.500 | Yüksek | blog               |
| 29  | AI crypto projects 2026                | Rakip       |          1.000–5.000 | Yüksek | blog               |
| 30  | x402 vs stablecoin payments            | Rakip       |               20–100 | Düşük  | /docs/payments     |
| 31  | Base network tokens                    | Base        |            500–2.000 | Yüksek | blog               |
| 32  | new tokens on Base                     | Base        |          1.000–3.000 | Yüksek | /buy               |
| 33  | Base ecosystem projects                | Base        |              300–900 | Orta   | /core/ecosystem    |
| 34  | Uniswap on Base                        | Base        |            500–1.500 | Yüksek | /buy               |
| 35  | Base Sepolia testnet tokens            | Base        |              100–400 | Düşük  | /core/roadmap      |
| 36  | Base Sepolia faucet                    | Base        |          1.000–4.000 | Orta   | /app               |
| 37  | build on Base                          | Base        |              300–800 | Orta   | GitHub README      |
| 38  | Coinbase L2 token launch               | Base        |               50–200 | Orta   | blog               |
| 39  | Base mainnet launch October 2026       | Base        |                10–50 | Düşük  | blog               |
| 40  | onchain AI payments Base               | Base        |               20–100 | Düşük  | /core/technology   |
| 41  | x402 payments                          | Teknik      |              300–900 | Orta   | /docs/payments     |
| 42  | x402 upto scheme                       | Teknik      |                20–80 | Düşük  | /docs/payments     |
| 43  | ERC-8004 registry                      | Teknik      |              100–400 | Düşük  | /core/technology   |
| 44  | ERC-8183 job escrow                    | Teknik      |               20–100 | Düşük  | /docs/app          |
| 45  | Permit2 spending limit                 | Teknik      |              100–300 | Orta   | /docs/payments     |
| 46  | EIP-2612 permit token                  | Teknik      |              100–300 | Orta   | /docs/token-design |
| 47  | Semaphore anonymous signals            | Teknik      |               50–150 | Düşük  | /docs/zk-privacy   |
| 48  | Noir UltraHonk verifier                | Teknik      |               20–100 | Düşük  | /docs/zk-privacy   |
| 49  | Safe multisig timelock                 | Teknik      |              100–400 | Orta   | /docs/token-design |
| 50  | vesting wallet 12 month cliff          | Teknik      |               50–150 | Düşük  | /docs/tokenomics   |

**Öncelik sırası** (hacim × dönüşüm ÷ zorluk; tek kişilik ekip için önce kazanılabilir olanlar):

1. Marka + işlem niyeti: `ARL token`, `ARL coin`, `buy ARL token`, `ARL contract address`,
   `ARL price` (lansman günü aranır; /buy sayfası hazır olmalı).
2. Marka + bilgi: `ARL Protocol`, `what is ARL Protocol`, `ARL tokenomics`, `when does ARL launch`.
3. Teknik niş (düşük rekabet, otorite kurar): `x402 upto scheme`, `ERC-8183 job escrow`,
   `ERC-8004 registry`, `Semaphore anonymous signals`.
4. Base ekosistemi uzun kuyruk: `onchain AI payments Base`, `Base Sepolia testnet tokens`,
   `Base mainnet launch October 2026`.
5. Rakip/karşılaştırma (ay 2–3, otorite oluştuktan sonra): `Render token alternative`,
   `Akash Network alternative`, `AI agent tokens on Base`.

### Sonraki adım

Search Console'da (zaten doğrulanmış: `verification.google` site meta etiketinde) "Performans"
raporunu açıp ilk 10 sorguyu bu tablonun "Aylık hacim" sütununun yanına yazın.

---

## 2. On-page SEO kontrol listesi

Kurallar: title ≤ 60 karakter, meta description ≤ 155 karakter (sitede `test/unit/seo.test.ts`
bunu her build'de denetler), tek H1, H2'ler anahtar kelimeyi doğal biçimde taşır, her sayfa en az
3 iç bağlantı verir. "Hakkında" ve "Yol haritası" sitede Core katmanlarıdır (/core/technology,
/core/roadmap); "Blog" henüz yok, aşağıda şablonu var (Mirror.xyz kanonik kaynak olarak
kullanılırsa sitedeki kopyaya `canonical` verilir).

| Sayfa                        | Title (uygulandı / önerilen)                      | Meta description                                                                                                                                           | Schema                                  |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Ana sayfa `/`                | ARL Protocol (ARL) · AI and Compute Token on Base | ARL Protocol: the utility token for AI and compute payments on Base. 21,000,000 ARL fixed supply, no mint or upgrade. Base Mainnet launch 23 October 2026. | Organization, WebSite, FAQPage          |
| Hakkında `/core/technology`  | Technology · ARL Protocol                         | How ARL pays for AI and compute on Base: x402 payments, ERC-8004 registry, ERC-8183 job escrow and zero-knowledge anonymous signals.                       | BreadcrumbList                          |
| Yol haritası `/core/roadmap` | Roadmap · ARL Protocol                            | Where ARL Protocol is today: Base Sepolia testnet live since 4 October 2026, Base Mainnet launch on 23 October 2026, services next.                        | BreadcrumbList                          |
| SSS `/faq`                   | ARL Token FAQ · ARL Protocol                      | ARL token FAQ: maximum supply, launch date, Base network, Uniswap trading, whitelist and airdrop timing, answered by ARL Protocol.                         | FAQPage, BreadcrumbList                 |
| Blog `/blog` (öneri)         | ARL Protocol Blog: AI Payments on Base            | Guides on paying for AI and compute with ARL on Base: x402, Permit2, token design and launch updates from ARL Protocol.                                    | Blog, BlogPosting, BreadcrumbList       |
| İletişim `/contact`          | Contact · ARL Protocol                            | Contact ARL Protocol: email team@arlcoin.io, X @arlprotocol or the Telegram community for partnerships, press and listings.                                | Organization (contactPoint), Breadcrumb |
| Satın alma `/buy`            | How to Buy ARL on Uniswap on Base · ARL Protocol  | How to buy ARL: the official ARL/USDC, ARL/USDT, ARL/ETH and ARL/BTC pools on Uniswap on Base, from 0.20 USD, opening 23 October 2026.                     | BreadcrumbList                          |
| Dokümanlar `/docs/<slug>`    | `<Doc title> · ARL Protocol`                      | Dokümanın kendi `description` alanı                                                                                                                        | TechArticle, BreadcrumbList             |

**H1/H2 şablonları**

- Ana sayfa: H1 "The onchain token planned for decentralized AI and compute services." · H2'ler:
  "Launch on Base." / "Onchain. Verifiable." / "Fixed. Forever." / "Built for AI and compute." /
  "Where ARL is today." / "Questions."
- SSS: H1 "Questions" · her soru bir `<summary>` (FAQPage ile eşleşir).
- Blog yazısı: H1 = yazı başlığı (hedef kelime başta) · H2: "What is …", "How it works on Base",
  "Step by step", "FAQ" · sonda CTA.
- /buy: H1 "How to get ARL" · H2: "Before you buy", "Official pools", "Check the contract address".

**İç bağlantı haritası**

- Ana sayfa → /buy, /faq, /core/token, /docs/tokenomics, /whitelist.
- /faq → /buy (satın alma), /docs/tokenomics (arz), /core/roadmap (tarih).
- Her doküman → /faq ve ilgili Core kartı; her blog yazısı → 1 doküman + /buy veya /whitelist.
- Anchor metni anahtar kelime taşır: "ARL tokenomics", "how to buy ARL on Uniswap", "x402 payments".

**Blog yazısı JSON-LD şablonu**

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "How to Pay for AI with Crypto on Base",
  "description": "A step-by-step guide to usage-based AI payments with ARL, x402 and Permit2 on Base.",
  "datePublished": "2026-10-20",
  "author": { "@id": "https://arlcoin.io/#organization" },
  "publisher": { "@id": "https://arlcoin.io/#organization" },
  "mainEntityOfPage": "https://arlcoin.io/blog/pay-for-ai-with-crypto-on-base/",
  "image": "https://arlcoin.io/opengraph-image.png"
}
```

### Sonraki adım

/buy sayfasına 23 Ekim'de mainnet kontrat adresi `SITE.mainnet.token` ile girildiği anda
yeniden build alın; "ARL contract address" aramasının cevabı o sayfadır.

---

## 3. Teknik SEO kontrol listesi

| Alan                 | Durum / adım                                                                                                                                                                              | Ücretsiz araç                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Site hızı            | Statik Next.js export, fontlar self-host. Hedef: mobil LCP < 2,5 s, CLS < 0,1, INP < 200 ms. Ses dosyası etkileşimden önce yüklenmemeli; görselleri PNG yerine WebP/AVIF olarak da sunun. | PageSpeed Insights, Lighthouse (Chrome DevTools) |
| Mobil uyumluluk      | e2e testleri Pixel 7 profilinde yatay kaydırma ve 44 px dokunma hedefini denetliyor.                                                                                                      | Lighthouse mobil, Chrome cihaz modu              |
| Dizine ekleme        | Search Console'da sitemap gönderin; lansman günü /, /buy, /faq için "URL denetimi → Dizine eklenmeyi iste". Bing için `node scripts/indexnow.mjs`.                                        | Google Search Console, Bing Webmaster, IndexNow  |
| sitemap.xml          | `app/sitemap.ts` üretir; her URL sonda `/` ile, kanonikle aynı; öncelik ve sıklık ipuçları eklendi.                                                                                       | Screaming Frog (500 URL'ye kadar ücretsiz)       |
| robots.txt           | Tüm tarayıcılara açık, AI arama tarayıcıları (GPTBot, ClaudeBot, PerplexityBot, Google-Extended …) açıkça izinli, `Sitemap:` ve `Host:` satırı var.                                       | Search Console robots.txt raporu                 |
| Canonical            | Her sayfada `alternates.canonical`; `x-default` ve `en` hreflang kök düzeyde.                                                                                                             | Screaming Frog "Canonicals" sekmesi              |
| HTTPS                | Vercel TLS, CSP `upgrade-insecure-requests`, `www` → apex yönlendirmesi DNS'te kontrol edilmeli.                                                                                          | SSL Labs, securityheaders.com                    |
| Yapılandırılmış veri | Organization, WebSite, FAQPage, TechArticle, BreadcrumbList.                                                                                                                              | Rich Results Test, Schema Markup Validator       |
| 404 / yönlendirme    | Kaldırılan `/core/team` URL'leri 301 ile `/core/`'a gider.                                                                                                                                | Screaming Frog "Response codes"                  |
| AI görünürlüğü       | `/llms.txt` resmî kanallar ve lansman gerçekleriyle güncel.                                                                                                                               | Perplexity / ChatGPT'de "ARL Protocol" araması   |

### Sonraki adım

https://pagespeed.web.dev/ üzerinde `https://arlcoin.io/` mobil testini çalıştırıp LCP öğesini
not edin; 2,5 s üstündeyse ilk iş o öğeyi küçültmek.

---

## 4. İçerik takvimi (12 hafta, İngilizce)

Her hafta: 1 blog yazısı (sitede veya Mirror'da kanonik), 1 X/Farcaster thread, 1 Mirror makalesi.
CTA'lar dönüşüme göre değişir: lansman öncesi Telegram/whitelist, sonrası /buy ve app.

| Hafta (başlangıç) | Blog başlığı · hedef kelime                                                                | X/Farcaster thread                                              | Mirror makalesi                                            | İç bağlantı · CTA                                        |
| ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1 (19 Eki)        | **ARL Protocol Launches on Base on 23 October: What to Know** · `ARL token`                | "ARL launch day in 8 posts: supply, pools, address check"       | "Why ARL launches with no airdrop"                         | /buy, /faq · "Join t.me/arlcoin_community"               |
| 2 (26 Eki)        | **How to Buy ARL on Uniswap on Base, Safely** · `how to buy ARL on Uniswap`                | "5 checks before you swap any new Base token"                   | "Single-sided liquidity from 0.20 USD, explained"          | /buy · "Verify the address on arlcoin.io/buy"            |
| 3 (2 Kas)         | **What Is a Fixed Supply Token? ARL's 21,000,000 Cap** · `fixed supply token`              | "No mint, no burn, no pause, no upgrade: what that means"       | "Reading the ARL token contract line by line"              | /core/token, /docs/token-design · "Read the contract"    |
| 4 (9 Kas)         | **How to Pay for AI with Crypto on Base** · `how to pay for AI with crypto`                | "x402 in one thread: sign a ceiling, pay only what you use"     | "Usage-based payments are the missing AI primitive"        | /docs/payments · "Try it on the testnet app"             |
| 5 (16 Kas)        | **x402 upto Scheme: Usage-Based Payments with Permit2** · `x402 upto scheme`               | "Permit2 spending limits for AI agents"                         | "Metering AI work onchain without trusting a server"       | /docs/payments · "Read the docs"                         |
| 6 (23 Kas)        | **ERC-8004 and ERC-8183: Registries and Job Escrow for AI Services** · `ERC-8004 registry` | "How an AI job is hired, escrowed and rated onchain"            | "Reputation for AI services that no one can edit"          | /core/technology · "Register a service"                  |
| 7 (30 Kas)        | **How a 48-Hour Treasury Timelock Protects Token Holders** · `token timelock`              | "2-of-3 Safe + 48 h timelock: the full path of a treasury move" | "Custody design for a one-person project"                  | /docs/token-design · "See the timelock on Basescan"      |
| 8 (7 Ara)         | **Paying for GPU Compute by the Second with ARL** · `pay for GPU compute with crypto`      | "Per-second compute billing in 6 posts"                         | "Compute providers on Base: a reference node"              | /docs/compute-provider (repo) · "Run the reference node" |
| 9 (14 Ara)        | **Anonymous Onchain Polls with Semaphore and Noir** · `Semaphore anonymous signals`        | "Vote without revealing your wallet: how ZK signals work"       | "Privacy as a feature of payments infrastructure"          | /docs/zk-privacy · "Cast an anonymous signal"            |
| 10 (21 Ara)       | **Render, Akash and ARL: Different Answers to AI Compute** · `Render token alternative`    | "Compute tokens compared: supply, payment model, chain"         | "Why ARL settles on Base instead of its own chain"         | /docs/chain-evaluation · "Read the chain evaluation"     |
| 11 (28 Ara)       | **How to Verify a Token Contract on Base Before You Buy** · `verify token contract Base`   | "Basescan, Blockscout, Sourcify: 3 ways to check source"        | "Reproducible bytecode: proving a deploy matches the code" | /buy, /docs/deployment · "Check the ARL address"         |
| 12 (4 Oca)        | **ARL Protocol in 2027: Services Roadmap on Base** · `ARL Protocol roadmap`                | "What shipped in Q4 2026, in 10 posts"                          | "Quarter one on mainnet: numbers and lessons"              | /core/roadmap · "Follow @arlprotocol"                    |

**150 kelimelik özetler (İngilizce)**

1. _ARL Protocol Launches on Base on 23 October: What to Know._ ARL Protocol moves from the Base Sepolia testnet to Base Mainnet on 23 October 2026. This post lists what changes on launch day and what stays fixed. The token has a fixed supply of 21,000,000 ARL, minted once into 11 allocations; the contract has no owner, mint, burn, pause or upgrade path. Trading opens in the official ARL/USDC, ARL/USDT, ARL/ETH and ARL/BTC pools on Uniswap on Base from 0.20 USD per ARL. There is no airdrop at launch; an airdrop of 500,000 ARL is planned for a later date and will be announced only on arlcoin.io, X @arlprotocol and Telegram. The post explains how to find the official contract address, why any earlier "ARL" on a main network is not official, and how the treasury is protected by a 2-of-3 Safe and a 48-hour timelock. It ends with a short safety checklist for launch-day buyers.
2. _How to Buy ARL on Uniswap on Base, Safely._ A step-by-step guide for first-time buyers. It starts with bridging or buying ETH on Base, then shows how to open Uniswap on Base, paste the official ARL address from arlcoin.io/buy, and compare it character by character with the address on Basescan. It explains the four official pools, the 1% fee tier, why the pools start with ARL only from a 0.20 USD floor, and what slippage settings mean when liquidity is new. It covers adding ARL to MetaMask, reading a swap preview, and recognising fake tokens with the same name. Safety rules close the post: ARL never asks for a seed phrase, a private key or a payment to a personal address, and no one from the project sends direct messages first. Readers are pointed to the FAQ and the Telegram community for questions.
3. _What Is a Fixed Supply Token? ARL's 21,000,000 Cap._ Many tokens can be minted, paused or upgraded by an admin key. This post explains what "fixed supply" means in code: the whole supply is created in the constructor, there is no mint function, no owner role and no proxy, so no one can add tokens later. Using ARL as the example, it walks through the 11 allocations, the vesting wallets with a 12-month cliff and 36 months linear release, and the circulating supply at TGE. It contrasts fixed supply with inflationary staking models and explains why ARL staking rewards come from existing allocations, never from new issuance. Each claim links to the contract and its tests in the public repository, so readers can check it themselves. The post closes with how to read total supply directly from Basescan.
4. _How to Pay for AI with Crypto on Base._ Paying for AI per request is hard with cards and subscriptions. This guide shows a crypto-native alternative on Base. The user signs a spending ceiling once (x402 "upto" scheme with Permit2); the AI service meters the work; a facilitator settles only the ARL actually used, never above the ceiling; and the transfer is recorded on Base for anyone to verify. The post explains each role in plain language, shows where the user stays in control (the ceiling and its expiry), and compares the model with prepaid credits and stablecoin invoices. It links to the payments document and the testnet app where readers can run a simulated request with testnet ARL. It ends with the open questions the protocol still has to answer before services go live.
5. _x402 upto Scheme: Usage-Based Payments with Permit2._ A technical deep dive for developers. It explains the x402 HTTP payment flow, the difference between the "exact" and "upto" schemes, and why usage-based AI work needs an upper bound rather than a fixed price. It walks through the Permit2 signature fields, the facilitator's verification and settlement steps, replay protection, and expiry. Code snippets come from the open-source `@arl/payments` package and its fork tests on Base Sepolia. The post documents failure cases: a service that reports more usage than the ceiling, an expired authorization, and a revoked allowance. It closes with how a provider integrates the package and where to report issues on GitHub.
6. _ERC-8004 and ERC-8183: Registries and Job Escrow for AI Services._ AI services need discovery, payment and reputation that no single company controls. This post explains how ARL uses the ERC-8004 identity and reputation registries to list services and record ratings, and the ERC-8183 job escrow to hold payment until work is delivered. It follows one job end to end: a client hires a service, funds the escrow in ARL, the provider delivers, the evaluator completes or rejects, and funds are released or refunded. It explains what is onchain and what is not, how ratings are tied to completed jobs, and what is deployed on Base Sepolia today. Links lead to the contract source, the tests and the testnet app.
7. _How a 48-Hour Treasury Timelock Protects Token Holders._ A treasury that can move instantly is a risk for every holder. This post explains the ARL treasury design: a timelock holds the tokens, a 2-of-3 Safe can only propose and execute after a minimum 48-hour delay, and a separate guardian can only cancel. It shows how anyone can watch pending operations on Basescan during the delay, why the guardian cannot move funds, and what happens if a signer key is lost. It compares the design with common single-signer treasuries. Every rule links to the contract and its unit tests. The post ends with a short guide to reading a timelock queue as a holder.
8. _Paying for GPU Compute by the Second with ARL._ Compute is billed by the hour on most clouds, even for short jobs. This post introduces per-second compute payments: a provider runs a job, meters seconds used, and settles in ARL over x402 "upto" without ever exceeding the user's ceiling. It describes the open-source reference provider node, how it measures real process time, and how a payment stream can be stopped by either side. It is clear about status: the software is reference code tested on Base Sepolia; no provider runs it in production yet. It invites GPU and CPU operators to try the node and report results on GitHub.
9. _Anonymous Onchain Polls with Semaphore and Noir._ Voting onchain usually reveals every wallet's choice. This post explains how ARL's anonymous signals let members of a group vote without revealing who they are, using a Semaphore-style circuit written in Noir and verified onchain with an UltraHonk verifier. It covers identity commitments, group membership proofs, nullifiers that prevent double voting, and what the contract can and cannot learn. It shows the user flow in the testnet app and links to the circuit, the verifier and the tests with real proofs. It closes with limitations and planned uses such as private feedback on AI services.
10. _Render, Akash and ARL: Different Answers to AI Compute._ A neutral comparison for readers researching AI and compute tokens. It describes each project's model: GPU rendering marketplace, decentralized cloud leases, and ARL's usage-based payments on Base. It compares supply design, how payments work, which chain each uses, and what is live today, using only public sources with links. ARL is presented as a payment layer rather than a compute network; the post explains why it settles on Base instead of running its own chain. No price predictions or rankings are made. It ends with questions readers should ask any compute token before using it.
11. _How to Verify a Token Contract on Base Before You Buy._ Fake tokens copy names and logos. This guide teaches readers to verify any Base token in minutes: find the official address from the project's own site, check it on Basescan, read the verified source, confirm total supply and owner functions, and cross-check on Blockscout and Sourcify. It then shows ARL's extra step: reproducible bytecode, where anyone can rebuild the contracts and compare the result with what is deployed. Screenshots walk through each screen. The post ends with red flags: unverified source, an owner that can mint, hidden fees and proxy upgrades.
12. _ARL Protocol in 2027: Services Roadmap on Base._ A look back at the first weeks on Base Mainnet and the plan ahead. It reports what shipped since 23 October 2026 with links to transactions and releases: pools, holders, contracts, and app usage. It then lists the next milestones: AI services paid per use in ARL, compute providers, staking funded from existing allocations, and the later airdrop with its rules. Each item is marked planned, in development or complete, following the project's content standard. The post invites builders to the GitHub repository and the Telegram community.

### Sonraki adım

1. haftanın blog yazısını bugün taslak olarak yazıp 22 Ekim'de Mirror'da yayına hazırlayın.

---

## 5. Backlink stratejisi (sıfır bütçe)

| Kanal                | Somut adımlar                                                                                                                                                                                                                                                                       | Not                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Kripto dizinleri     | Mainnet adresi doğrulandıktan sonra: CoinGecko ve CoinMarketCap ücretsiz listeleme formu (Uniswap havuz adresi, Basescan doğrulaması, resmî kanallar), DexScreener token profili, GeckoTerminal, Base ekosistem sayfası (base.org/ecosystem, GitHub PR ile), DefiLlama (TVL varsa). | Formlarda yalnızca team@arlcoin.io ve resmî kanallar. |
| Token listeleri      | Uniswap default değil; `tokenlist` paketiyle üretilen listeyi GitHub'da yayınlayın, Coinbase Wallet / Trust Wallet assets repolarına PR açın.                                                                                                                                       | Logo `assets/brand/png/arl-token-icon-256.png`.       |
| Bitcointalk          | "[ANN] ARL Protocol" başlığı: özet, tokenomics tablosu, kontrat adresi, resmî kanallar. Haftalık güncelleme.                                                                                                                                                                        | İmza kampanyası yok (bütçe yok, risk).                |
| Reddit               | r/BaseChain, r/ethdev (teknik yazılar), r/CryptoCurrency yalnızca kurallara uygun "daily discussion" içinde. Self-promo oranı ≤ %10.                                                                                                                                                | Link yerine öğretici içerik.                          |
| GitHub / açık kaynak | README'de arlcoin.io bağlantısı; `awesome-base`, `awesome-x402`, `awesome-erc8004` listelerine PR; x402 ve Noir topluluklarında örnek olarak `@arl/payments` ve devre.                                                                                                              | En kalıcı dofollow kaynak.                            |
| Konuk yazarlık       | Dev.to, Hashnode, Medium (canonical arlcoin.io/Mirror), Base builder blogları, Paragraph.                                                                                                                                                                                           | Her yazıda 1–2 bağlam içi link.                       |
| Ücretsiz PR          | Lansman bülteni: EIN Presswire ücretsiz katman, PR.com, OpenPR, PRLog; kripto: CoinCodex/CryptoSlate "submit news".                                                                                                                                                                 | Fiyat vaadi yok.                                      |
| Sosyal imleme        | Hacker News "Show HN" (teknik açı: x402 upto), Product Hunt (app), Lobsters (davetle), Mix.                                                                                                                                                                                         | Lansmandan 1 hafta sonra.                             |
| Forumlar             | Base Discord builders kanalı, Farcaster /base ve /dev kanalları, Ethereum Magicians (ERC-8004/8183 uygulama raporu).                                                                                                                                                                | Teknik geri bildirim odaklı.                          |

**Örnek pitch (konuk yazı)**

```text
Subject: Guest post idea: usage-based AI payments with x402 on Base

Hi <name>,

I build ARL Protocol, an open-source token and payment layer on Base for AI and compute
services. I'd like to write a practical, code-first guide for your readers: "Paying for AI per
request with x402 upto and Permit2", with working snippets from our Apache-2.0 repo
(github.com/armanalabsai/arlcoin.io) and tests on Base Sepolia.

No price talk, no token promotion — a tutorial that works with any ERC-20. One link back to
arlcoin.io in the author bio is all I ask.

Draft in 5 days if this fits. Thanks!
ARL Protocol · team@arlcoin.io · x.com/arlprotocol
```

**Örnek pitch (dizin/listeleme)**

```text
ARL Protocol (ARL) — ERC-20 on Base (chain 8453)
Contract: <mainnet address, from arlcoin.io/buy>
Supply: 21,000,000 fixed; no mint, burn, pause or upgrade
Pools: Uniswap v3 on Base, ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC
Source: verified on Basescan; github.com/armanalabsai/arlcoin.io
Channels: arlcoin.io · x.com/arlprotocol · t.me/arlcoin_community · team@arlcoin.io
```

### Sonraki adım

GitHub'da `awesome-x402` (veya benzeri) listesine `@arl/payments` için bugün bir PR açın.

---

## 6. Sosyal SEO

| Platform       | Ad / bio                                                                                                                                                                                       | Bio linki          | Sabitlenmiş                                                                             | Etiketler                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| X @arlprotocol | "ARL Protocol" · "Utility token for AI & compute payments on @base. 21M fixed supply, no mint. Mainnet Oct 23. Testnet live."                                                                  | https://arlcoin.io | Lansman bilgisi + resmî adres kontrolü + "No airdrop at launch" (`social/x/profile.md`) | #Base #BaseChain #AI #x402 #DePIN (en fazla 2 / gönderi) |
| Farcaster      | Kullanıcı adı `arlprotocol`, aynı bio                                                                                                                                                          | arlcoin.io         | Aynı lansman cast'i; /base ve /dev kanalları                                            | Kanal seçimi hashtag yerine geçer                        |
| Mirror.xyz     | Yayın adı "ARL Protocol", ENS veya cüzdanla; açıklama anahtar kelimeyle                                                                                                                        | arlcoin.io         | Haftalık makale; her makalede kanonik link                                              | Başlıkta hedef kelime                                    |
| GitHub         | Repo açıklaması: "ARL Protocol — fixed-supply ERC-20 and AI/compute payment layer on Base"; website alanı arlcoin.io; topics: `base`, `erc20`, `x402`, `erc-8004`, `zk`, `solidity`, `foundry` | arlcoin.io         | README başında rozetler + resmî kanallar                                                | Topics = GitHub içi SEO                                  |
| Telegram       | Grup adı "ARL Protocol Community", açıklamada arlcoin.io ve X                                                                                                                                  | arlcoin.io         | `social/telegram/pinned-messages.md`                                                    | —                                                        |

Kurallar: her profilde aynı ad ("ARL Protocol"), aynı logo, aynı bio linki (NAP tutarlılığı;
Organization `sameAs` ile eşleşir). Gönderilerde link başa değil sona; ilk satırda anahtar
kelime ("ARL on Base", "x402 payments").

### Sonraki adım

GitHub repo "About" alanına açıklamayı, website'i ve topics'i girin (2 dakika).

---

## 7. Ölçümleme ve KPI'lar

**Kurulum**

1. Google Search Console: alan zaten doğrulandı (meta etiket). Sitemap'i gönderin:
   `https://arlcoin.io/sitemap.xml`. Domain property için DNS TXT kaydı da ekleyin.
2. Google Analytics 4 (ücretsiz): analytics.google.com → mülk oluştur → Web veri akışı
   `https://arlcoin.io` → Ölçüm kimliği `G-XXXX`. Site şu an çerezsiz Vercel Analytics
   kullanıyor; GA4 eklenirse gizlilik bildirimi (`/privacy`) ve CSP (`script-src`, `connect-src`
   için `googletagmanager.com`, `google-analytics.com`) birlikte güncellenmeli ve çerez onayı
   gerekir. Sıfır bütçe ve gizlilik açısından önerilen: Search Console + Vercel Analytics.
3. Bing Webmaster Tools: Search Console'dan içe aktarın; IndexNow anahtarı zaten yayında.
4. Dönüşüm olayları: whitelist formu gönderimi, /buy → Uniswap tıklaması, Telegram tıklaması.

**KPI'lar**

| Metrik                              | Kaynak                       | 30 gün hedefi      | 90 gün hedefi |
| ----------------------------------- | ---------------------------- | ------------------ | ------------- |
| Organik tıklama                     | Search Console               | 500                | 3.000         |
| Gösterim                            | Search Console               | 10.000             | 60.000        |
| Ortalama CTR                        | Search Console               | ≥ %4               | ≥ %5          |
| Marka sorgularında ort. sıra        | Search Console               | ≤ 3                | 1             |
| Dizinlenen sayfa                    | Search Console "Sayfalar"    | Sitemap'in ≥ %90'ı | %100          |
| Referring domain                    | Search Console "Bağlantılar" | 15                 | 50            |
| Whitelist kaydı / Telegram katılımı | Form + Telegram              | izlenir            | izlenir       |
| Core Web Vitals (mobil)             | PageSpeed / CrUX             | Tümü "İyi"         | Tümü "İyi"    |

**Haftalık rapor şablonu**

```text
Hafta: ____  (Pzt–Paz)
Organik tıklama: ___ (önceki hafta ___, Δ ___%)
Gösterim: ___  CTR: ___%  Ort. sıra: ___
En iyi 5 sorgu: 1) ___ 2) ___ 3) ___ 4) ___ 5) ___
Yeni dizinlenen / hata veren sayfa: ___ / ___
Yayınlanan içerik: blog ___ · thread ___ · Mirror ___
Kazanılan backlink: ___ (kaynaklar: ___)
Dönüşüm: whitelist ___ · /buy→Uniswap ___ · Telegram ___
Sonraki hafta tek öncelik: ___
```

**Aylık rapor şablonu**

```text
Ay: ____
Özet (3 madde): ___
KPI tablosu: hedef / gerçekleşen / fark
Anahtar kelime hareketi: ilk 10'a giren ___, düşen ___
İçerik performansı: en çok tıklanan 3 sayfa ___
Teknik: CWV durumu ___, tarama hataları ___
Backlink: yeni ___, kaybedilen ___
Gelecek ay: 3 eylem ___
```

### Sonraki adım

Search Console → Site haritaları → `sitemap.xml` gönder.

---

## 8. Haftalık SEO rutini (7 adım, ~3 saat)

| #   | Adım                                                                         | Süre  | Ücretsiz araç                                   |
| --- | ---------------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| 1   | Search Console: tıklama, gösterim, CTR, yeni sorgular; raporu doldur         | 20 dk | Google Search Console                           |
| 2   | Dizin ve hata kontrolü: "Sayfalar", 404, yönlendirme                         | 15 dk | Search Console, Screaming Frog                  |
| 3   | Bir sayfanın title/description'ını CTR'ye göre iyileştir                     | 20 dk | Search Console + repo (`seo.test.ts` limitleri) |
| 4   | Haftanın blog + Mirror yazısını yayınla, iç bağlantıları ekle                | 60 dk | Mirror.xyz, repo                                |
| 5   | X + Farcaster thread'i yayınla, profil linklerini kontrol et                 | 20 dk | X, Warpcast                                     |
| 6   | 2 backlink girişimi (dizin, PR, forum, awesome-list)                         | 30 dk | e-posta, GitHub                                 |
| 7   | Hız ve IndexNow: mobil PSI testi, deploy sonrası `node scripts/indexnow.mjs` | 15 dk | PageSpeed Insights, IndexNow                    |

### Sonraki adım

Takviminize her pazartesi 09:00 için 3 saatlik "SEO rutini" bloğu ekleyin.

---

## 9. Acil eylem planı (23 Ekim 2026 mainnet'e kadar)

| Öncelik | İş                                                                                                                                                                                   | Son tarih                | Bitti sayılır                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------- |
| 1       | Bu daldaki site değişikliklerini (meta, JSON-LD, sitemap, robots, manifest, resmî kanallar, airdrop/tarih metinleri) gözden geçirip yayına almak; Search Console'a sitemap göndermek | 18 Ekim                  | Rich Results Test'te Organization + FAQPage geçer; sitemap "Başarılı" |
| 2       | X @arlprotocol, Telegram, GitHub, Farcaster profillerini aynı ad/bio/link ile güncellemek; sabitlenmiş gönderiler                                                                    | 19 Ekim                  | 4 profil aynı NAP; pinned post canlı                                  |
| 3       | 1. hafta blog + Mirror yazısı ("Launches on Base on 23 October") ve lansman thread'i taslağı                                                                                         | 21 Ekim                  | Mirror taslağı, thread taslağı onaylı                                 |
| 4       | Lansman günü: mainnet adresi doğrulandıktan sonra `SITE.mainnet.token` ile /buy ve token listesi build; IndexNow; Search Console "Dizine eklenmeyi iste" (/, /buy, /faq)             | 23 Ekim                  | /buy gerçek adresi gösterir; 3 URL dizinleme kuyruğunda               |
| 5       | Dizin başvuruları: DexScreener profili, GeckoTerminal, CoinGecko ve CoinMarketCap formları, Bitcointalk [ANN]                                                                        | 25 Ekim (lansman +2 gün) | Başvuru e-postaları gönderildi                                        |

### Sonraki adım

Öncelik 1: bu dalı inceleyip merge onayı verin (merge ve deploy ayrıca onayınızla yapılır).
