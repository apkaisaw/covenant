/// Smart Gate extension that enforces diplomatic consequences in physical space.
///
/// Gate owners can link their gates to Covenant treaties. When a character
/// requests passage, the extension checks:
/// - If the character's alliance VIOLATED a linked treaty -> denied
/// - If the character is a member of an ACTIVE treaty -> allowed (allied passage)
/// - Otherwise -> follows default policy (configurable: open or closed)
///
/// This extends Covenant from "on-chain record keeping" to "physical world enforcement":
/// violating a treaty doesn't just cost money -- your pilots get locked out of gates.
#[allow(lint(self_transfer))]
module covenant::gate_enforcer;

use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};
use covenant::covenant::{Self, Treaty};
use world::character::Character;
use world::gate::{Self, Gate};

// === Constants ===

const PERMIT_DURATION_MS: u64 = 60 * 60 * 1000; // 1 hour

// === Errors ===

/// Character's alliance has violated a linked treaty
const EDiplomaticViolation: u64 = 200;
/// Character is not covered by any linked treaty
const ENoTreatyCoverage: u64 = 201;
/// Caller is not the config owner
const ENotOwner: u64 = 202;

// === Structs ===

/// Witness type for gate extension authorization.
public struct CovenantAuth has drop {}

/// Configuration for a Covenant-enforced gate.
/// Stores which treaties govern passage and the default policy.
public struct GateConfig has key {
    id: UID,
    owner: address,
    // Treaty object IDs linked to this gate
    linked_treaties: Table<ID, bool>,
    linked_treaty_count: u64,
    // If true, characters not in any treaty are allowed through.
    // If false, only treaty members from non-violating alliances pass.
    default_allow: bool,
}

// === Events ===

public struct GateConfigCreated has copy, drop {
    config_id: ID,
    owner: address,
    default_allow: bool,
}

public struct TreatyLinked has copy, drop {
    config_id: ID,
    treaty_id: ID,
}

public struct PassageDenied has copy, drop {
    config_id: ID,
    character_id: ID,
    reason: u8, // 0 = violation, 1 = no coverage
}

public struct PassageGranted has copy, drop {
    config_id: ID,
    character_id: ID,
}

// === Public Functions ===

/// Create a gate enforcement config. The caller becomes the owner.
public fun create_config(
    default_allow: bool,
    ctx: &mut TxContext,
) {
    let config = GateConfig {
        id: object::new(ctx),
        owner: ctx.sender(),
        linked_treaties: table::new(ctx),
        linked_treaty_count: 0,
        default_allow,
    };

    event::emit(GateConfigCreated {
        config_id: object::id(&config),
        owner: ctx.sender(),
        default_allow,
    });

    transfer::share_object(config);
}

/// Link a treaty to this gate config. Only the config owner can do this.
public fun link_treaty(
    config: &mut GateConfig,
    treaty_id: ID,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == config.owner, ENotOwner);
    if (!config.linked_treaties.contains(treaty_id)) {
        config.linked_treaties.add(treaty_id, true);
        config.linked_treaty_count = config.linked_treaty_count + 1;

        event::emit(TreatyLinked {
            config_id: object::id(config),
            treaty_id,
        });
    };
}

/// Check whether a character should be allowed passage through a Covenant-enforced gate.
/// Uses in-game character_id (from Character object) to look up treaty membership.
///
/// Issues a JumpPermit if allowed; aborts if denied.
public fun issue_jump_permit(
    config: &GateConfig,
    treaty: &Treaty,
    source_gate: &Gate,
    destination_gate: &Gate,
    character: &Character,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let treaty_id = object::id(treaty);
    let character_id = world::in_game_id::item_id(&world::character::key(character));

    // Treaty must be linked to this gate config
    assert!(config.linked_treaties.contains(treaty_id), ENoTreatyCoverage);

    // Check treaty status and membership
    let status = covenant::status(treaty);
    let is_member_a = covenant::is_member_a(treaty, character_id);
    let is_member_b = covenant::is_member_b(treaty, character_id);

    if (status == 2) {
        // Treaty VIOLATED -- check if this character's alliance is the violator
        // If they're a member of either side of a violated treaty, deny passage
        // (the violating alliance loses gate access)
        if (is_member_a || is_member_b) {
            event::emit(PassageDenied {
                config_id: object::id(config),
                character_id: object::id(character),
                reason: 0,
            });
            abort EDiplomaticViolation
        };
    };

    if (status == 1) {
        // Treaty ACTIVE -- members of either alliance get passage
        if (is_member_a || is_member_b) {
            let expires = clock.timestamp_ms() + PERMIT_DURATION_MS;

            gate::issue_jump_permit<CovenantAuth>(
                source_gate,
                destination_gate,
                character,
                CovenantAuth {},
                expires,
                ctx,
            );

            event::emit(PassageGranted {
                config_id: object::id(config),
                character_id: object::id(character),
            });
            return
        };
    };

    // Character not in this treaty -- apply default policy
    if (config.default_allow) {
        let expires = clock.timestamp_ms() + PERMIT_DURATION_MS;
        gate::issue_jump_permit<CovenantAuth>(
            source_gate,
            destination_gate,
            character,
            CovenantAuth {},
            expires,
            ctx,
        );

        event::emit(PassageGranted {
            config_id: object::id(config),
            character_id: object::id(character),
        });
    } else {
        event::emit(PassageDenied {
            config_id: object::id(config),
            character_id: object::id(character),
            reason: 1,
        });
        abort ENoTreatyCoverage
    }
}

// === View Functions ===

public fun is_treaty_linked(config: &GateConfig, treaty_id: ID): bool {
    config.linked_treaties.contains(treaty_id)
}

public fun linked_treaty_count(config: &GateConfig): u64 {
    config.linked_treaty_count
}

public fun default_allow(config: &GateConfig): bool {
    config.default_allow
}
