/**
 * Application Constants
 * Mirrors all SQL ENUM types so app code never hardcodes strings.
 */

const LOT_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  MATCHED: 'matched',
  IN_TRANSACTION: 'in_transaction',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
});

const LOT_CONDITION = Object.freeze({
  WORKING: 'working',
  NON_WORKING: 'non_working',
  DAMAGED: 'damaged',
  MIXED: 'mixed',
});

const SOURCE_TYPE = Object.freeze({
  HOUSEHOLD: 'household',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  INSTITUTIONAL: 'institutional',
});

const TRANSACTION_STATUS = Object.freeze({
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  IN_TRANSIT: 'in_transit',
  HANDED_OVER: 'handed_over',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
});

/**
 * Valid state-machine transitions for transaction_status.
 * Key = current status, Value = array of allowed next statuses.
 *
 * A transaction may be disputed from any in-flight state; a dispute is
 * resolved either forward (back into the flow) or terminally (cancelled).
 */
const TRANSACTION_TRANSITIONS = Object.freeze({
  [TRANSACTION_STATUS.QUOTED]: [
    TRANSACTION_STATUS.ACCEPTED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.ACCEPTED]: [
    TRANSACTION_STATUS.IN_TRANSIT,
    TRANSACTION_STATUS.CANCELLED,
    TRANSACTION_STATUS.DISPUTED,
  ],
  [TRANSACTION_STATUS.IN_TRANSIT]: [
    TRANSACTION_STATUS.HANDED_OVER,
    TRANSACTION_STATUS.CANCELLED,
    TRANSACTION_STATUS.DISPUTED,
  ],
  [TRANSACTION_STATUS.HANDED_OVER]: [
    TRANSACTION_STATUS.CONFIRMED,
    TRANSACTION_STATUS.CANCELLED,
    TRANSACTION_STATUS.DISPUTED,
  ],
  [TRANSACTION_STATUS.CONFIRMED]: [
    TRANSACTION_STATUS.COMPLETED,
    TRANSACTION_STATUS.DISPUTED,
  ],
  [TRANSACTION_STATUS.COMPLETED]: [],
  [TRANSACTION_STATUS.CANCELLED]: [],
  // A dispute can be resolved back into the flow or written off.
  [TRANSACTION_STATUS.DISPUTED]: [
    TRANSACTION_STATUS.HANDED_OVER,
    TRANSACTION_STATUS.CONFIRMED,
    TRANSACTION_STATUS.COMPLETED,
    TRANSACTION_STATUS.CANCELLED,
  ],
});

/**
 * Which role is permitted to drive each status transition.
 * Enforced in the transaction service on top of the state machine above.
 */
const TRANSITION_ACTORS = Object.freeze({
  [TRANSACTION_STATUS.ACCEPTED]: ['recycler', 'admin'],
  [TRANSACTION_STATUS.IN_TRANSIT]: ['collector', 'recycler', 'admin'],
  [TRANSACTION_STATUS.HANDED_OVER]: ['collector', 'recycler', 'admin'],
  [TRANSACTION_STATUS.CONFIRMED]: ['recycler', 'admin'],
  [TRANSACTION_STATUS.COMPLETED]: ['recycler', 'admin'],
  [TRANSACTION_STATUS.CANCELLED]: ['collector', 'recycler', 'admin'],
  [TRANSACTION_STATUS.DISPUTED]: ['collector', 'recycler', 'admin'],
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
});

const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
  UPI: 'upi',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other',
});

const AUTHORIZATION_STATUS = Object.freeze({
  AUTHORIZED: 'authorized',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
});

const PREFERRED_LANGUAGE = Object.freeze({
  HINDI: 'hi',
  MARATHI: 'mr',
  ENGLISH: 'en',
});

const TRAINING_SAMPLE_SOURCE = Object.freeze({
  LOT_COMPLETION: 'lot_completion',
  TRANSACTION: 'transaction',
  MANUAL_UPLOAD: 'manual_upload',
});

const SYNC_OPERATION = Object.freeze({
  CREATE_LOT: 'create_lot',
  UPDATE_LOT_STATUS: 'update_lot_status',
  CREATE_TRANSACTION: 'create_transaction',
  UPDATE_TRANSACTION_STATUS: 'update_transaction_status',
  CREATE_HANDOVER: 'create_handover',
});

const SYNC_STATUS = Object.freeze({
  PENDING: 'pending',
  APPLIED: 'applied',
  CONFLICT: 'conflict',
  REJECTED: 'rejected',
});

const ROLES = Object.freeze({
  COLLECTOR: 'collector',
  RECYCLER: 'recycler',
  ADMIN: 'admin',
});

/** Default pagination */
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

module.exports = {
  LOT_STATUS,
  LOT_CONDITION,
  SOURCE_TYPE,
  TRANSACTION_STATUS,
  TRANSACTION_TRANSITIONS,
  TRANSITION_ACTORS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  AUTHORIZATION_STATUS,
  PREFERRED_LANGUAGE,
  TRAINING_SAMPLE_SOURCE,
  SYNC_OPERATION,
  SYNC_STATUS,
  ROLES,
  PAGINATION,
};
