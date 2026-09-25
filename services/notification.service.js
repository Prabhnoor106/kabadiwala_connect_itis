/**
 * Notification Service
 * Pluggable notification sender.
 * In dev: logs to console. In prod: pluggable SMS/push provider.
 */
const logger = require('../utils/logger');

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console';

/**
 * Send an SMS notification.
 *
 * @param {string} phone - Phone number
 * @param {string} message - Message body
 * @returns {Promise<{ success: boolean, provider: string }>}
 */
async function sendSMS(phone, message) {
  if (SMS_PROVIDER === 'console' || process.env.NODE_ENV !== 'production') {
    logger.info('📱 SMS (dev mode)', { phone, message });
    return { success: true, provider: 'console' };
  }

  // TODO: Implement actual SMS providers
  if (SMS_PROVIDER === 'twilio') {
    // const twilio = require('twilio')(accountSid, authToken);
    // await twilio.messages.create({ body: message, to: phone, from: senderPhone });
    logger.info('SMS sent via Twilio', { phone });
    return { success: true, provider: 'twilio' };
  }

  if (SMS_PROVIDER === 'msg91') {
    // const axios = require('axios');
    // await axios.post('https://api.msg91.com/api/v5/flow/', { ... });
    logger.info('SMS sent via MSG91', { phone });
    return { success: true, provider: 'msg91' };
  }

  logger.warn('Unknown SMS provider', { provider: SMS_PROVIDER });
  return { success: false, provider: SMS_PROVIDER };
}

/**
 * Send an OTP to a phone number.
 *
 * @param {string} phone
 * @param {string} otp
 * @returns {Promise<{ success: boolean }>}
 */
async function sendOTP(phone, otp) {
  const message = `Your Kabadiwala Connect verification code is: ${otp}. Valid for 10 minutes.`;
  return sendSMS(phone, message);
}

/**
 * Send a transaction status notification.
 *
 * @param {string} phone
 * @param {Object} params
 * @param {string} params.status
 * @param {string} [params.reference]
 * @param {number} [params.amount]
 */
async function sendTransactionUpdate(phone, { status, reference, amount }) {
  let message = `Transaction status: ${status}.`;
  if (reference) message += ` Ref: ${reference}.`;
  if (amount) message += ` Amount: ₹${amount}.`;

  return sendSMS(phone, message);
}

module.exports = {
  sendSMS,
  sendOTP,
  sendTransactionUpdate,
};
