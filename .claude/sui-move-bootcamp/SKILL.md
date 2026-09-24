---
name: sui-move-bootcamp
description: Curriculum context and key patterns from the MystenLabs Sui Move Bootcamp (modules A–K). Use when building or reviewing bootcamp exercises, or as a learning progression reference for Move development.
---

# Sui Move Bootcamp Guide

The [MystenLabs Sui Move Bootcamp](https://github.com/MystenLabs/sui-move-bootcamp) is an 11-module educational curriculum for Sui blockchain and Move programming. The `main` branch contains intentionally scaffolded (incomplete) projects for learning; each module `X` has a corresponding `X-solution` branch with completed implementations.

## Module Progression

| Module | Focus |
|--------|-------|
| **A** | Sui introduction, first contract |
| **B** | Move fundamentals: types, abilities, events |
| **C** | Advanced patterns: capabilities, OTW, PTBs, on-chain randomness |
| **D** | TypeScript SDK client interactions |
| **E** | NFT minting and wallet integration |
| **F** | Full dApp (frontend + contracts) |
| **G** | Test scenarios, collections (Vector, VecMap, Bag, Option), dynamic fields, tables |
| **H** | Package upgrades, security patterns (capability, witness, hot potato), vulnerability patterns |
| **I** | Coins, treasury caps, closed-loop tokens, Kiosk, transfer policies |
| **J** | Indexers, Prometheus/Grafana monitoring |
| **K** | Advanced topics (ZKLogin demo with React frontend) |

## Build and Test Commands

All 40+ Move packages are independent (no cross-dependencies). **Run all commands from within the package directory** (where `Move.toml` lives):

```bash
cd G1/scenario
sui move build              # Build the package
sui move test               # Run all tests
sui move test --filter test_name  # Run a specific test
sui client publish --gas-budget 100000000  # Publish to current network
```

TypeScript projects in `ts/` subdirectories use npm/pnpm:

```bash
npm install && npm run dev  # Development server
npm run build              # Production build
```

## All Packages Use Move 2024 Edition

```toml
[package]
name = "package_name"
edition = "2024"

[dependencies]
# Sui framework is auto-resolved by the package manager
```

## Key Recurring Patterns

### Hero / Sword / Weapon Teaching Structs

Most modules use generic Hero/Sword/Weapon structs as canonical examples for teaching types, abilities, and object model patterns.

### Test Scenario Pattern

Standard test setup using `test_scenario`:

```move
use sui::test_scenario as ts;

#[test]
fun test_example() {
    let mut s = ts::begin(@0x1);
    // your test setup
    s.next_tx(@0x2);
    // assertions, object take/return
    s.end();
}
```

Key functions: `ts::begin(@addr)`, `test.next_tx(@addr)`, `take_from_sender`, `expected_failure`.

### Capability Pattern

Access control via owned capabilities (never shared):

```move
struct AdminCap has key { id: UID }
struct StoreAdminCap has key { id: UID }
```

Only holders can call `entry` functions marked with `_cap: &AdminCap` parameter. Transfer to governance multisig post-deployment.

### One-Time Witness (OTW)

Module-named uppercase struct with no fields, used for trustless initialization:

```move
struct SILVER has drop {}  // in module silver

fun init(witness: SILVER, ctx: &mut TxContext) {
    let treasury = coin::create_currency(witness, /* ... */);
}
```

### Dynamic Fields and Tables

From module G3 onward, flexible object storage:

- **Dynamic fields** (`sui::dynamic_field`): arbitrary KV pairs on objects, query by key
- **Table** (`sui::table::Table<K,V>`): large KV collections with `K: copy+drop+store`
- **Bag** (`sui::bag::Bag`): like Table but heterogeneous value types
- **ObjectTable** (`sui::object_table::ObjectTable<K,V>`): for value objects with `key+store`

## Solution Branches

After attempting a module on `main`, check the solution branch to compare:

```bash
git checkout A1-solution
git checkout B2-solution
```

This keeps your work on `main`, allowing you to switch to solutions without losing progress.

## Resources

- [GitHub repository](https://github.com/MystenLabs/sui-move-bootcamp)
- [Sui docs](https://docs.sui.io)
- [Move book](https://move-book.com)
