# Rewarded ads adapter plan

## Goal
Allow guest or unsubscribed users to watch rewarded ads to earn coins and unlock locked episodes.

## V1 behavior
- first ad reward can unlock the next episode faster
- later unlocks require multiple ad views or additional coins
- coins are only granted after backend verification

## Suggested adapter interface
```ts
startRewardedAd(placement: string): Promise<{ verificationToken: string; provider: string }>
verifyRewardedAd(payload): Promise<{ grantedCoins: number }>
```

## Providers worth speaking with
- Google Ad Manager / Ad Exchange video demand
- SpringServe
- Publica by IAS
- Equativ
- direct sponsor inventory

## Rules
- never grant coins purely from client state
- use cooldowns to slow abuse
- record each reward event for audit and fraud checks
