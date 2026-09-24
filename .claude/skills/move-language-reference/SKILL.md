---
name: move-language-reference
description: Deep Move language reference covering type system, control flow, generics, abilities, Move 2024 features, and advanced Sui programmability patterns. Companion to sui-stack-dev:sui-move-development — covers depth not in that skill.
---

# Move Language Reference

A deep reference for the Move language, based on the [Move Book](https://move-book.com). This complements `sui-stack-dev:sui-move-development` (which covers practical patterns like object transfer, capabilities, and basic test scenarios) by providing language semantics, type system rules, and advanced programmability patterns.

## Primitive Types and Operations

### Integers and Math

- **Types**: `u8`, `u16`, `u32`, `u64`, `u128`, `u256`
- **Casts**: `(val as u64)` — cast to different integer type
- **Overflow**: Arithmetic is checked (panics on overflow); tests can use wrapping arithmetic modules
- **Literals**: `123u8`, `456u64`, `0x1A2B` (hex)

### Boolean and Address

- **`bool`**: `true`, `false`; used in conditionals; cannot be cast to/from integers
- **`address`**: 32-byte identifier; literal form `@0x1234567890abcdef...` (64 hex chars); cast between `u256` via `sui::address::parse_and_verify`

### Vector

```move
let mut v = vector[1, 2, 3];
vector::push_back(&mut v, 4);
vector::pop_back(&mut v);
let len = vector::length(&v);
let ref_elem = vector::borrow(&v, 0);
let mut_ref = vector::borrow_mut(&mut v, 1);
vector::remove(&mut v, 0);
vector::destroy_empty(v);
let is_empty = vector::is_empty(&v);
```

### References

- **Immutable reference** `&T`: read-only borrow; multiple immutable refs allowed
- **Mutable reference** `&mut T`: exclusive write access; only one active at a time
- **Dereference**: `*ref` gives the value (if `T: copy`)
- **Borrow checker**: prevents use-after-move and aliased mutable refs

```move
let x = 10;
let r1 = &x;
let r2 = &x;  // OK: multiple immutable refs
let y = &mut x;  // ERROR: cannot have mutable while immutable borrows exist
```

## Control Flow

### Conditionals

```move
if (condition) {
    // ...
} else if (other) {
    // ...
} else {
    // ...
}

// Expression form (returns a value)
let result = if (flag) 1 else 2;
```

### Loops

```move
loop {
    if (done) break;
}

while (condition) {
    // ...
}

// Labeled loops (break/continue to specific label)
'outer: loop {
    loop {
        break 'outer;  // breaks the outer loop
    }
}
```

### Pattern Matching (Move 2024)

```move
match (value) {
    Some(x) => x * 2,
    None => 0,
    _ => 99,  // catch-all
}
```

## Error Handling

### Abort and Assert

```move
const E_INVALID_AMOUNT: u64 = 1;
const E_INSUFFICIENT_BALANCE: u64 = 2;

assert!(balance >= amount, E_INSUFFICIENT_BALANCE);
if (!is_valid) abort E_INVALID_AMOUNT;
```

**Convention**: Error constants prefixed with `E_`, uppercase snake_case.

**Behavior**: `abort` terminates the transaction immediately; no recovery. Errors are visible in transaction effects.

## Generics and Type Parameters

### Basic Generics

```move
fun get_first<T>(vec: &vector<T>): &T {
    vector::borrow(vec, 0)
}

// Unconstrained: T can be any type (but still movable by default)
```

### Constraints

```move
fun destroy_all<T: drop>(vec: vector<T>) {
    while (vector::length(&vec) > 0) {
        vector::pop_back(&mut vec);  // T must have drop
    }
}

struct Container<T: store> has store {
    items: vector<T>
}
```

**Common constraints**:
- `T: copy` — can be duplicated
- `T: drop` — can be discarded
- `T: store` — can be stored in other objects
- `T: key` — can be a top-level object (rare)
- `T: copy + drop + store` — most permissive for data containers

### Phantom Types

Type parameter not stored as a field; used for type safety without holding a value:

```move
struct Coin<phantom T> has store { amount: u64 }

// Coin<SUI> and Coin<USDC> are different types, even though storage is identical
```

## Abilities — Rules in Depth

Every struct declares its own abilities; they are not inherited.

### `copy`

- **Means**: values of this type can be duplicated/copied
- **Requires**: ALL fields must also have `copy`
- **Examples**: integers, bools, addresses
- **Caveat**: `copy` types are automatically copied in function calls; consuming logic must carefully handle this

```move
struct Point has copy { x: u64, y: u64 }  // OK: both u64 have copy
let p1 = Point { x: 1, y: 2 };
let p2 = p1;  // p1 is copied; both exist
```

### `drop`

- **Means**: values can be discarded without explicit logic
- **Requires**: ALL fields must also have `drop`
- **Examples**: integers, bools
- **Without `drop`**: must be explicitly consumed (moved into another struct, returned, etc.)

```move
struct Resource has key { id: UID, data: u64 }
// Resource does NOT have drop (id: UID does not)
// Must be explicitly destroyed: object::delete(obj)
```

### `store`

- **Means**: values can be stored inside other objects (as fields in a `key` struct)
- **Requires**: ALL fields must also have `store`
- **Caveat**: only top-level objects need `key`; inner objects need `store`

```move
struct Inventory<T: store> has key {
    id: UID,
    items: vector<T>  // T must have store
}
```

### `key`

- **Means**: can be stored as a top-level object at the global level
- **Requires**: first field MUST be `id: UID`; ALL other fields must have `store`
- **Caveat**: only one type in a module can be the main object type

```move
struct Account has key {
    id: UID,
    balance: u64,      // u64 has store ✓
    items: Bag,        // Bag has store ✓
}
```

## Visibility and Generics

### Function Visibility

```move
public fun public_func() { }      // callable from any module
public(package) fun friend() { }  // callable from same package only
fun private_func() { }            // private to this module
entry fun can_be_called() { }     // can be called as a PTB move_call
```

### `public(package)` (Move 2024)

Like old `friend` declarations; allows inter-module calls within the same package:

```move
// In module utils
public(package) fun helper() { }

// In module main (same package)
fun caller() {
    utils::helper();  // OK
}
```

## Move 2024 Edition Features

### Method Syntax

```move
// Old style
object::transfer(obj, addr);
vector::push_back(&mut v, 99);

// New style (method calls)
obj.transfer(addr);
v.push_back(99);
```

### Index Syntax

```move
let elem = v[0];  // sugar for *vector::borrow(&v, 0)
v[1] = new_val;   // sugar for *vector::borrow_mut(&mut v, 1) = new_val
```

### Macros

```move
macro fun repeat<T>($val: T, $times: u64): vector<T> {
    let mut result = vector[];
    let mut i = 0;
    while (i < $times) {
        vector::push_back(&mut result, $val);
        i = i + 1;
    }
    result
}

// Called at compile time
let v = repeat!(42, 5);  // expands before runtime
```

### `let ... else` (Move 2024)

Early exit pattern:

```move
let Some(x) = opt else { return };
let Some(y) = other else { abort E_NOT_FOUND };
```

## Advanced Sui Programmability Patterns

### Hot Potato

Struct with no abilities — forces atomic consumption within a single PTB:

```move
struct Request has drop {  // ONLY drop, no copy/store/key
    id: UID,
    value: u64,
}

public fun create_request(value: u64, ctx: &mut TxContext): Request {
    Request { id: object::new(ctx), value }
}

public fun approve_request(req: Request) {  // takes ownership
    // Must be called same TX; cannot be stored or copied
}
```

### Flashloan

Borrow and return within one transaction:

```move
public fun borrow<T: store>(vault: &mut Vault<T>, amount: u64): (T, Receipt<T>) {
    let asset = // ... extract amount
    let receipt = Receipt { vault_id: object::uid_to_inner(&vault.id), amount };
    (asset, receipt)
}

public fun repay<T: store>(vault: &mut Vault<T>, asset: T, receipt: Receipt<T>) {
    assert!(receipt.vault_id == object::uid_to_inner(&vault.id), E_WRONG_VAULT);
    // ... return asset to vault
}
// If Receipt is not consumed, transaction aborts
```

### Coin Standard

```move
use sui::coin::{Coin, Balance};

// Coin<T> is a wrapper around Balance<T>
struct Coin<T> has store, key {
    id: UID,
    balance: Balance<T>
}

// Combine coins
public fun join<T>(coin1: &mut Coin<T>, coin2: Coin<T>) {
    let Coin { id, balance } = coin2;
    object::delete(id);
    balance::join(&mut coin1.balance, balance);
}

// Split coin
public fun split<T>(coin: &mut Coin<T>, amount: u64, ctx: &mut TxContext): Coin<T> {
    let balance = balance::split(&mut coin.balance, amount);
    Coin { id: object::new(ctx), balance }
}

// Minting and burning require TreasuryCap
public fun mint<T>(cap: &mut TreasuryCap<T>, amount: u64, ctx: &mut TxContext): Coin<T> {
    Coin {
        id: object::new(ctx),
        balance: balance::increase_supply(&mut cap.supply, amount),
    }
}

public fun burn<T>(cap: &mut TreasuryCap<T>, coin: Coin<T>) {
    let Coin { id, balance } = coin;
    object::delete(id);
    balance::decrease_supply(&mut cap.supply, balance);
}
```

### Display Objects

Metadata templates for UI rendering:

```move
use sui::display::Display;

public fun new<T: key>(pub: &Publisher, ctx: &mut TxContext): Display<T> {
    let mut display = display::new<T>(pub, ctx);
    display.add(b"name", b"{name}");
    display.add(b"description", b"{description}");
    display.add(b"image_url", b"{image_url}");
    display.update_version();  // must call after changes
    display
}
```

### Kiosk and Transfer Policies

Personal marketplaces with enforced transfer rules:

```move
public fun create_kiosk(ctx: &mut TxContext): (Kiosk, KioskOwnerCap) {
    kiosk::new(ctx)
}

public fun place<T: key + store>(kiosk: &mut Kiosk, item: T, cap: &KioskOwnerCap) {
    kiosk::place(kiosk, cap, item)
}

public fun list<T: key + store>(
    kiosk: &mut Kiosk,
    cap: &KioskOwnerCap,
    item_id: ID,
    price: u64,
) {
    kiosk::list(kiosk, cap, item_id, price)
}

// TransferPolicy enforces rules on all transfers of type T
public fun create_policy<T: key + store>(pub: &Publisher, ctx: &mut TxContext): TransferPolicy<T> {
    transfer_policy::new(pub, ctx)
}

public fun add_rule<T: key + store>(policy: &mut TransferPolicy<T>, rule_data: u64) {
    // e.g., add royalty, allowlist, burn-on-transfer rules
}
```

### Data Structure Choices

- **`Table<K, V>`** where `K: copy+drop+store`: large homogeneous KV; efficient random access
- **`Bag`**: heterogeneous values (any `T`); keys must have `copy+drop+store`
- **`ObjectTable<K, V>`** where `V: key+store`: values are objects; enables object field access
- **`LinkedTable<K, V>`**: ordered traversal with `prev`/`next` links; supports range iteration

### Package Upgrades

```move
// At init:
public fun init(ctx: &mut TxContext) {
    transfer::transfer(UpgradeCap { id: object::new(ctx) }, ctx.sender());
}

// To upgrade:
// 1. Modify package code
// 2. Run: sui client upgrade --package-id 0x... --upgrade-cap 0x... --gas-budget 100000000
// 3. By default, additive-only: cannot remove/change existing public functions

// To make immutable (no future upgrades):
public fun make_immutable(cap: UpgradeCap) {
    package::make_immutable(cap);
}
```

---

## Reference

For the complete Move Book, see [https://move-book.com](https://move-book.com)

For Sui-specific APIs and patterns, refer to the Sui framework docs.
