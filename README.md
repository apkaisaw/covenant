# Covenant

Self-enforcing diplomatic treaties for EVE Frontier — sign on-chain, deposit collateral, and let the blockchain be the judge.

Two alliances sign a non-aggression pact with SUI deposits. If a KillMail proves a member violated the treaty, the violator's deposit is automatically forfeited to the other side. No arbitrator, no vote, no trust required.

## How It Works

1. Alliance A creates a treaty with terms, member list, and SUI deposit
2. Alliance B reviews, adds their members and deposit, and co-signs
3. The treaty is now active and publicly visible on-chain
4. If a KillMail shows cross-alliance aggression, violation is auto-detected
5. Violator's deposit transfers to the victim alliance
6. Treaty compliance history builds each alliance's diplomatic reputation

## Tech Stack

- **Contracts:** Sui Move
- **Frontend:** React + TypeScript + Vite
- **Sui Integration:** @mysten/dapp-kit + @evefrontier/dapp-kit

## License

MIT
