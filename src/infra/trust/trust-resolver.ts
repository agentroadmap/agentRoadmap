/**
 * P208: Trust Resolver for A2A Communication
 *
 * Resolves the trust tier between two agents by checking:
 *   1. Authority overrides (orchestrator-agent, gary, system)
 *   2. Explicit trust entries in agent_trust table
 *   3. Same-team heuristic (shared agent_identity prefix)
 *   4. System agent heuristic
 *   5. Default: restricted
 *
 * DB tables: roadmap_workforce.agent_trust (trust_level column)
 *            roadmap_workforce.agent_registry (trust_tier column)
 */

import { query } from "../postgres/pool.ts";
import {
	type TrustTier,
	type TrustPolicy,
	TRUST_POLICIES,
	AUTHORITY_IDENTITIES,
	DEFAULT_TIER,
} from "./trust-model.ts";

export interface TrustContext {
	/** The agent sending the message */
	sender: string;
	/** The agent receiving the message */
	receiver: string;
	/** Optional: message type being sent (for policy check) */
	messageType?: string;
	/** Optional: external channel context */
	channel?: string;
}

export interface TrustResult {
	/** Whether the interaction is allowed */
	allowed: boolean;
	/** The resolved trust tier */
	tier: TrustTier;
	/** Human-readable reason for the decision */
	reason: string;
	/** The policy for the resolved tier */
	policy: TrustPolicy;
}

/**
 * Check if an identity belongs to the authority set.
 */
function isAuthority(identity: string): boolean {
	if (AUTHORITY_IDENTITIES.has(identity)) return true;
	// Also match prefixed forms: "orchestrator-agent/something"
	for (const auth of AUTHORITY_IDENTITIES) {
		if (identity.startsWith(auth + "/") || identity.startsWith(auth + "-")) {
			return true;
		}
	}
	return false;
}

/**
 * Extract the team/agency prefix from an agent identity.
 * Examples (provider names below are illustrative; real values come from
 * agent_registry — never hardcode provider identity in source):
 *   "<provider>/<agency>/<worker>" -> "<provider>/<agency>"
 *   "<provider>-<n>"               -> "<provider>"
 *   "<provider>"                   -> "<provider>"
 */
function teamPrefix(identity: string): string {
	const slashIdx = identity.lastIndexOf("/");
	if (slashIdx > 0) return identity.substring(0, slashIdx);
	const dashIdx = identity.indexOf("-");
	if (dashIdx > 0) return identity.substring(0, dashIdx);
	return identity;
}

/**
 * Check if two agents share the same team prefix.
 */
function sameTeam(a: string, b: string): boolean {
	return teamPrefix(a) === teamPrefix(b);
}

/**
 * Look up the agent's declared trust_tier from agent_registry.
 * Returns null if not found.
 */
async function getAgentRegistryTier(
	identity: string,
): Promise<TrustTier | null> {
	const result = await query<{ trust_tier: string }>(
		"SELECT trust_tier FROM agent_registry WHERE agent_identity = $1",
		[identity],
	);
	if (result.rows.length === 0) return null;
	const tier = result.rows[0].trust_tier as TrustTier;
	if (tier in TRUST_POLICIES) return tier;
	return null;
}

/**
 * Look up explicit trust level from agent_trust table.
 * Checks both directions: A->B and B->A (reciprocal).
 * Returns null if no entry found.
 */
async function getExplicitTrust(
	agentA: string,
	agentB: string,
): Promise<{ tier: TrustTier; grantedBy: string } | null> {
	const result = await query<{
		trust_level: string;
		granted_by: string;
	}>(
		`SELECT trust_level, granted_by
		 FROM agent_trust
		 WHERE agent_identity = $1
		   AND trusted_agent = $2
		   AND (expires_at IS NULL OR expires_at > now())
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[agentA, agentB],
	);
	if (result.rows.length === 0) return null;
	const tier = result.rows[0].trust_level as TrustTier;
	if (!(tier in TRUST_POLICIES)) return null;
	return { tier, grantedBy: result.rows[0].granted_by };
}

/**
 * Resolve trust between two agents.
 *
 * Priority (highest to lowest):
 *   1. Authority override (sender or receiver is orchestrator/gary/system)
 *   2. Explicit trust entry in agent_trust (sender->receiver direction)
 *   3. Explicit trust entry in agent_trust (receiver->sender, reciprocal)
 *   4. Same-team heuristic -> trusted
 *   5. Agent registry trust_tier
 *   6. Default: restricted
 */
export async function resolveTrust(ctx: TrustContext): Promise<TrustResult> {
	const { sender, receiver } = ctx;

	// 1. Authority override
	if (isAuthority(sender)) {
		return {
			allowed: true,
			tier: "authority",
			reason: `Sender "${sender}" has authority status`,
			policy: TRUST_POLICIES.authority,
		};
	}
	if (isAuthority(receiver)) {
		// Receiving from authority is always allowed
		return {
			allowed: true,
			tier: "known",
			reason: `Receiver "${receiver}" has authority; accepting`,
			policy: TRUST_POLICIES.known,
		};
	}

	// 2. Explicit trust (sender trusts receiver)
	const senderTrust = await getExplicitTrust(sender, receiver);
	if (senderTrust) {
		const policy = TRUST_POLICIES[senderTrust.tier];
		const allowed = checkPolicy(policy, ctx.messageType);
		return {
			allowed,
			tier: senderTrust.tier,
			reason: `Explicit trust: ${sender} -> ${receiver} = ${senderTrust.tier} (granted by ${senderTrust.grantedBy})`,
			policy,
		};
	}

	// 3. Reciprocal trust (receiver trusts sender)
	const reciprocalTrust = await getExplicitTrust(receiver, sender);
	if (reciprocalTrust) {
		// Use reciprocal but cap at "known" for messaging (can't assume full trusted)
		const tier: TrustTier =
			reciprocalTrust.tier === "authority" || reciprocalTrust.tier === "trusted"
				? "known"
				: reciprocalTrust.tier;
		const policy = TRUST_POLICIES[tier];
		const allowed = checkPolicy(policy, ctx.messageType);
		return {
			allowed,
			tier,
			reason: `Reciprocal trust: ${receiver} -> ${sender} = ${reciprocalTrust.tier}; mapped to ${tier} for messaging`,
			policy,
		};
	}

	// 4. Same-team heuristic
	if (sameTeam(sender, receiver)) {
		const policy = TRUST_POLICIES.trusted;
		const allowed = checkPolicy(policy, ctx.messageType);
		return {
			allowed,
			tier: "trusted",
			reason: `Same team: ${teamPrefix(sender)}`,
			policy,
		};
	}

	// 5. Agent registry trust_tier
	const registryTier = await getAgentRegistryTier(sender);
	if (registryTier && registryTier !== DEFAULT_TIER) {
		const policy = TRUST_POLICIES[registryTier];
		const allowed = checkPolicy(policy, ctx.messageType);
		return {
			allowed,
			tier: registryTier,
			reason: `Agent registry tier: ${registryTier}`,
			policy,
		};
	}

	// 6. Default: restricted
	const policy = TRUST_POLICIES[DEFAULT_TIER];
	const allowed = checkPolicy(policy, ctx.messageType);
	return {
		allowed,
		tier: DEFAULT_TIER,
		reason: "No explicit trust; default restricted",
		policy,
	};
}

/**
 * Check if a policy allows a specific message type.
 * If no messageType is specified, only check DM permission.
 */
function checkPolicy(policy: TrustPolicy, messageType?: string): boolean {
	if (!messageType) return policy.canDirectMessage;
	return policy.canSendMessageTypes.includes(messageType);
}

/**
 * Grant trust from one agent to another.
 * Inserts or updates the agent_trust row and writes an audit entry.
 */
export async function grantTrust(
	agentIdentity: string,
	trustedAgent: string,
	tier: TrustTier,
	grantedBy: string,
	reason?: string,
	expiresAt?: Date,
): Promise<void> {
	// Upsert into agent_trust
	await query(
		`INSERT INTO agent_trust (agent_identity, trusted_agent, trust_level, granted_by, reason, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (agent_identity, trusted_agent)
		 DO UPDATE SET trust_level = $3, granted_by = $4, reason = $5, expires_at = $6, updated_at = now()`,
		[agentIdentity, trustedAgent, tier, grantedBy, reason ?? null, expiresAt ?? null],
	);

	// Audit entry
	await query(
		`INSERT INTO agent_trust_audit (agent_identity, trusted_agent, old_tier, new_tier, modified_by, reason)
		 VALUES ($1, $2, NULL, $3, $4, $5)`,
		[agentIdentity, trustedAgent, tier, grantedBy, reason ?? "trust grant"],
	);
}

/**
 * Revoke trust between two agents.
 * Deletes the agent_trust row and writes an audit entry.
 */
export async function revokeTrust(
	agentIdentity: string,
	trustedAgent: string,
	revokedBy: string,
	reason?: string,
): Promise<void> {
	// Get current tier for audit
	const current = await query<{ trust_level: string }>(
		"SELECT trust_level FROM agent_trust WHERE agent_identity = $1 AND trusted_agent = $2",
		[agentIdentity, trustedAgent],
	);

	if (current.rows.length > 0) {
		await query(
			`INSERT INTO agent_trust_audit (agent_identity, trusted_agent, old_tier, new_tier, modified_by, reason)
			 VALUES ($1, $2, $3, 'blocked', $4, $5)`,
			[agentIdentity, trustedAgent, current.rows[0].trust_level, revokedBy, reason ?? "trust revoked"],
		);
	}

	await query(
		"DELETE FROM agent_trust WHERE agent_identity = $1 AND trusted_agent = $2",
		[agentIdentity, trustedAgent],
	);
}
